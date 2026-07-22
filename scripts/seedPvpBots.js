/**
 * Seed / converge the PVP ladder bots — realistic filler so a new player never sees an
 * empty ladder.
 *
 * ── THIS SCRIPT IS NON-DESTRUCTIVE BY DEFAULT ───────────────────────────────
 * The default path CREATES WHAT IS MISSING AND FIXES WHAT HAS DRIFTED. It never deletes.
 * Run it as many times as you like; run it against production; run it twice by accident.
 *
 * (A previous version of this header claimed the script was "idempotent" because it
 * deleted ALL isPvpBot fighters and recreated them. That wording read as safe, was run
 * against prod, and took live fighters — with real players' fight history pointing at
 * them — out from under the ladder. Deletion now lives behind two explicit flags and a
 * typed confirmation. Please keep it that way.)
 *
 * Convergence, per roster entry (consts/pvpBotRoster.js — 25 bots, 18/4/3):
 *   Fighter      find-or-create on the natural key { isPvpBot, firstName, lastName }.
 *                EXISTING bots keep their _id, names, OVR and record — they are live.
 *                `banner` plus the CAREER COHERENCE fields below are converged.
 *   PVPRecord    find-or-create in the current season (heals bots with no record).
 *   PvpBotState  find-or-create (the activity scheduler's per-bot row).
 *
 * ── CAREER COHERENCE HEAL (this convergence IS the migration — no separate script) ──
 * The ladder side shipped fine, but a bot's read-only Career Profile was instantly fake:
 * a 22-10 record with a 0/0/0 win-method split, Fame "—" on a 32-fight veteran, and eight
 * IDENTICAL stat bars. All of it is DERIVED from the roster (pvpBotRoster.deriveBotProfile)
 * and healed additively here:
 *     record.koWins / subWins / decisionWins   (sums to the EXISTING wins — never rewritten)
 *     the 8 stats                              (style shape scaled to the EXISTING OVR)
 *     notoriety.score / peakTier / lastEventAt
 *     promotionTier, gymId, careerTrainingSessions
 *
 * STRICTLY ADDITIVE. This script NEVER writes record.wins, record.losses, overallRating or
 * badgesEarned:
 *   - wins/losses/overallRating are live identity — a real player may have fought this bot
 *     yesterday, and OVR drives matchmaking.
 *   - badgesEarned needs no seeding: fighterController.getCareerProfile runs
 *     badgeService.evaluateBadges(...{silent:true}) and SAVES on every profile view, so
 *     once the fields above are correct the right badges self-heal for free.
 * Re-running once converged is a pure no-op.
 *
 * Usage:
 *   node scripts/seedPvpBots.js                        # converge (safe, default)
 *   node scripts/seedPvpBots.js --dry-run              # print the plan, write NOTHING
 *   node scripts/seedPvpBots.js --reset --yes-delete-all-bots   # destructive, see below
 *
 * --reset requires BOTH flags, prints exact counts, asks for an interactive `y`, and
 * REFUSES outright if any bot has ever fought a real player (that PVPFight row is half of
 * a human's career history). PVPFight rows are NEVER deleted by this script.
 */
const readline = require("readline");
const connectDB = require("../modules/dbConnect");
const mongoose = require("mongoose");
const Fighter = require("../models/fighterModel");
const Season = require("../models/seasonModel");
const PVPRecord = require("../models/pvpRecordModel");
const PVPFight = require("../models/pvpFightModel");
const PVPRival = require("../models/pvpRivalModel");
const PvpBotState = require("../models/pvpBotStateModel");
const Gym = require("../models/gymModel");
const { ROSTER, STAT_KEYS, deriveBotProfile, botNotoriety } = require("../consts/pvpBotRoster");
const { divisionForDp, GAMEPLAN_KEYS } = require("../consts/pvpConfig");
const { BOT_INTERVAL_MIN_HOURS, BOT_INTERVAL_MAX_HOURS } = require("../consts/pvpBotConfig");
const { snapToBand } = require("../services/pvpBotService");
const { ensureNotorietyShape } = require("../services/notorietyService");

const MIN = 60 * 1000;
const DAY = 24 * 3600 * 1000;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const RESET = argv.includes("--reset");
const RESET_CONFIRMED = argv.includes("--yes-delete-all-bots");

const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Spread the roster's activity bands across the whole UTC day, so the ladder sees bot
 * traffic at every hour instead of a nightly clump.
 */
const spreadBand = (i) => Math.floor((i * 24) / ROSTER.length) % 24;

/**
 * Initial fire time for bot #i: staggered ~90min apart with up to an hour of slop, then
 * snapped into the bot's band. Without the stagger all 25 bots come due on the very first
 * hourly tick and the ladder gets 25 fights in one minute — the loudest possible "the bots
 * just turned on" tell.
 */
function seedNextActivityAt(i, now, hourBandStart) {
    const t = new Date(now.getTime() + i * 90 * MIN + randInt(0, 60) * MIN);
    return snapToBand(t, hourBandStart);
}

/** Prompt for a literal `y`. Auto-declines when not attached to a TTY (CI / piped runs). */
function confirm(question) {
    if (!process.stdin.isTTY) {
        console.error("Not a TTY — refusing to auto-confirm a destructive reset.");
        return Promise.resolve(false);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(String(answer).trim().toLowerCase() === "y");
        });
    });
}

/**
 * Target season. Prefer the live Open season; fall back to an upcoming one so bots can be
 * seeded during the pre-season countdown and are already on the ladder at go-live.
 */
async function resolveSeason() {
    const open = await Season.findOne({
        status: { $in: ["active", "upcoming"] },
        "config.crossWeightClass": true,
    }).sort({ startDate: -1 });
    if (open) return open;
    return Season.findOne({ status: { $in: ["active", "upcoming"] } }).sort({ startDate: -1 });
}

// ── Destructive path ────────────────────────────────────────────────────────

async function runReset() {
    const bots = await Fighter.find({ isPvpBot: true }).select("_id firstName lastName").lean();
    const botIds = bots.map((b) => b._id);
    if (botIds.length === 0) {
        console.log("No bots exist — nothing to reset.");
        return;
    }

    // ── HARD REFUSAL: a bot that has fought a real player is not ours to delete. That
    //    PVPFight row is half of a human's career history and their defense log. Deleting
    //    the Fighter leaves the row pointing at nothing.
    //    Checked BEFORE the flag gate, so even a half-specified reset tells you the truth.
    const mixedFights = await PVPFight.countDocuments({
        $or: [
            { attackerId: { $in: botIds }, defenderId: { $nin: botIds } },
            { defenderId: { $in: botIds }, attackerId: { $nin: botIds } },
        ],
    });
    if (mixedFights > 0) {
        console.error(`\n  REFUSING: ${mixedFights} PVPFight row(s) pit a bot against a REAL player.`);
        console.error("  Deleting these bots would orphan real players' fight history.");
        console.error("  There is no flag for this. If you truly need it, do it by hand and");
        console.error("  decide consciously what happens to those rows.\n");
        await mongoose.disconnect();
        process.exit(1);
    }

    const [recordCount, rivalCount, stateCount] = await Promise.all([
        PVPRecord.countDocuments({ playerId: { $in: botIds } }),
        PVPRival.countDocuments({ $or: [{ player1Id: { $in: botIds } }, { player2Id: { $in: botIds } }] }),
        PvpBotState.countDocuments({ fighterId: { $in: botIds } }),
    ]);
    const botOnlyFights = await PVPFight.countDocuments({
        attackerId: { $in: botIds },
        defenderId: { $in: botIds },
    });

    console.log("\n  DESTRUCTIVE RESET — about to delete:");
    console.log(`    Fighter (isPvpBot:true) : ${botIds.length}`);
    console.log(`    PvpBotState             : ${stateCount}`);
    console.log(`    PVPRival                : ${rivalCount}`);
    console.log(`    PVPRecord               : ${recordCount}`);
    console.log(`    PVPFight                : 0  (NEVER deleted — ${botOnlyFights} bot-vs-bot row(s) will be left behind)`);
    console.log("\n  Bots to be removed:");
    for (const b of bots) console.log(`    - ${b.firstName} ${b.lastName} (${b._id})`);

    // --dry-run wins over --reset, always. An operator combining them is asking to PREVIEW
    // a reset; deleting anything here would be the single worst way to be surprised. This
    // gate must stay ABOVE the flag gate and the confirm — never let a --dry-run run delete.
    if (DRY_RUN) {
        console.log("\n  --dry-run: nothing was deleted. Re-run without --dry-run to apply.\n");
        await mongoose.disconnect();
        process.exit(0);
    }

    // Flag gate AFTER the plan: a half-specified reset still shows you exactly what it
    // would have done, then refuses. Both flags are required — one is a typo, two is intent.
    if (!RESET || !RESET_CONFIRMED) {
        console.error("\n  REFUSING — nothing was deleted. A reset requires BOTH flags:\n");
        console.error("      node scripts/seedPvpBots.js --reset --yes-delete-all-bots\n");
        console.error("  If you only want to create missing bots / fix drifted banners, run with");
        console.error("  no flags at all — the default path is non-destructive.\n");
        await mongoose.disconnect();
        process.exit(1);
    }

    const ok = await confirm("\n  Type 'y' to permanently delete the above: ");
    if (!ok) {
        console.log("Aborted — nothing was deleted.");
        return;
    }

    // Order matters: dependants first, Fighter last, so an abort mid-way never leaves a
    // Fighter whose ladder rows have already gone.
    const s = await PvpBotState.deleteMany({ fighterId: { $in: botIds } });
    const v = await PVPRival.deleteMany({ $or: [{ player1Id: { $in: botIds } }, { player2Id: { $in: botIds } }] });
    const r = await PVPRecord.deleteMany({ playerId: { $in: botIds } });
    const f = await Fighter.deleteMany({ _id: { $in: botIds } });
    console.log(`\nDeleted: ${s.deletedCount} state(s), ${v.deletedCount} rival(s), ${r.deletedCount} record(s), ${f.deletedCount} fighter(s).`);
    console.log("PVPFight rows were left untouched, by design.");
}

// ── Non-destructive convergence (default) ───────────────────────────────────

/**
 * Resolve every gym name the roster asks for to a Gym._id, in one query.
 * A missing gym WARNS and yields null — a bot with no gym is cosmetically imperfect, but a
 * seed that crashes half way through leaves the ladder in a worse state than it found it.
 * @returns {Promise<Map<string, object>>} gym name → _id
 */
async function resolveGymIds(profiles) {
    const names = [...new Set(profiles.map((p) => p.gymName).filter(Boolean))];
    const gyms = await Gym.find({ name: { $in: names } }).select("_id name").lean();
    const byName = new Map(gyms.map((g) => [g.name, g._id]));
    for (const name of names) {
        if (!byName.has(name)) {
            console.warn(`  [gym:MISSING] "${name}" not found in the Gym collection — those bots keep gymId null.`);
        }
    }
    return byName;
}

async function runConverge() {
    const season = await resolveSeason();
    if (!season) {
        console.error("No active or upcoming season found — seed a season first (scripts/seedPreSeasonCountdown.js or seedPvpSeason1.js).");
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`Target season: #${season.seasonNumber} wc=${season.weightClass} status=${season.status} id=${season._id}`);
    if (DRY_RUN) console.log("\n── DRY RUN — no writes will be performed ──\n");

    const now = new Date();
    const plan = {
        fighterCreate: 0, fighterFound: 0, bannerFix: 0,
        statsFix: 0, splitFix: 0, fameFix: 0, tierFix: 0, gymFix: 0, trainFix: 0,
        recordCreate: 0, recordFound: 0, stateCreate: 0, stateFound: 0,
    };
    const counts = {};

    // Derive the whole coherent roster up front: if the roster is malformed (a style with
    // no win-method mix, an unreachable OVR) it throws HERE, before a single write.
    const profiles = ROSTER.map((b) => deriveBotProfile(b));
    const gymIdByName = await resolveGymIds(profiles);

    for (let i = 0; i < ROSTER.length; i++) {
        const b = ROSTER[i];
        const p = profiles[i];
        const gymId = gymIdByName.get(p.gymName) || null;
        const label = `${b.first} "${b.nick}" ${b.last}`;

        // ── Fighter: find-or-create on the natural key. ──────────────────────
        let fighter = await Fighter.findOne({ isPvpBot: true, firstName: b.first, lastName: b.last });
        if (!fighter) {
            plan.fighterCreate++;
            console.log(`  [fighter:CREATE] ${label} (${b.wc}, ${b.style}, OVR ${b.ovr})`);
            if (!DRY_RUN) {
                fighter = await Fighter.create({
                    firstName: b.first,
                    lastName: b.last,
                    nickname: b.nick,
                    isPvpBot: true,
                    weightClass: b.wc,
                    style: b.style,
                    backstory: b.story,
                    overallRating: b.ovr,
                    // Style-shaped stats scaled to hit exactly this OVR — NOT 8×OVR, which
                    // rendered as eight identical bars on the profile.
                    ...p.stats,
                    record: {
                        wins: b.w,
                        losses: b.l,
                        koWins: p.koWins,
                        subWins: p.subWins,
                        decisionWins: p.decisionWins,
                    },
                    notoriety: { ...p.notoriety },
                    promotionTier: p.promotionTier,
                    gymId,
                    careerTrainingSessions: p.careerTrainingSessions,
                    banner: { ...b.banner },
                    // Bots skip onboarding: they never run placement fights, and a
                    // mid-placement fighter is treated as PROTECTED (unattackable) by
                    // matchmaking — a bot stuck there would be invisible filler.
                    pvpOnboarding: { unlocked: true, placementComplete: true },
                });
            }
        } else {
            plan.fighterFound++;
            // Converge the banner + the career coherence fields. Names / OVR / wins /
            // losses / badgesEarned are live identity — a player may have fought this
            // fighter yesterday. Never rewrite them from the roster.
            let dirty = false;

            const cur = fighter.banner || {};
            if (
                cur.backgroundId !== b.banner.backgroundId ||
                cur.frameId !== b.banner.frameId ||
                cur.accentColor !== b.banner.accentColor ||
                (cur.badgeSlots || []).length !== 0
            ) {
                plan.bannerFix++;
                dirty = true;
                console.log(`  [fighter:BANNER] ${label} → ${b.banner.backgroundId}/${b.banner.frameId}/${b.banner.accentColor}`);
                if (!DRY_RUN) {
                    fighter.banner = { ...b.banner };
                    fighter.markModified("banner");
                }
            }

            // ── Stats: the 8-identical-bars tell. Derived from the fighter's OWN stored
            //    OVR, not the roster's, so a bot whose OVR legitimately drifted still gets
            //    a shape that matches what the profile prints. OVR itself is untouched.
            const liveOvr = fighter.overallRating;
            const wantStats = liveOvr === b.ovr ? p.stats : deriveBotProfile({ ...b, ovr: liveOvr }).stats;
            if (STAT_KEYS.some((k) => fighter[k] !== wantStats[k])) {
                plan.statsFix++;
                dirty = true;
                console.log(`  [fighter:STATS]  ${label} → ${STAT_KEYS.map((k) => `${k.toUpperCase()} ${wantStats[k]}`).join(" ")} (OVR ${liveOvr} unchanged)`);
                if (!DRY_RUN) STAT_KEYS.forEach((k) => { fighter[k] = wantStats[k]; });
            }

            // ── Win-method split: must sum to the LIVE wins, not the roster's.
            const liveWins = fighter.record?.wins ?? 0;
            const liveLosses = fighter.record?.losses ?? 0;
            const wantSplit = liveWins === b.w ? p : deriveBotProfile({ ...b, w: liveWins });
            if (
                fighter.record?.koWins !== wantSplit.koWins ||
                fighter.record?.subWins !== wantSplit.subWins ||
                fighter.record?.decisionWins !== wantSplit.decisionWins
            ) {
                plan.splitFix++;
                dirty = true;
                console.log(`  [fighter:RECORD] ${label} → ${liveWins}-${liveLosses} split ${wantSplit.koWins} KO / ${wantSplit.subWins} SUB / ${wantSplit.decisionWins} DEC`);
                if (!DRY_RUN) {
                    fighter.record.koWins = wantSplit.koWins;
                    fighter.record.subWins = wantSplit.subWins;
                    fighter.record.decisionWins = wantSplit.decisionWins;
                    fighter.markModified("record");
                }
            }

            // ── Promotion tier: the OVR band rule (GDD §5.1), off the LIVE OVR.
            const wantTier = deriveBotProfile({ ...b, ovr: liveOvr }).promotionTier;
            if (fighter.promotionTier !== wantTier) {
                plan.tierFix++;
                dirty = true;
                console.log(`  [fighter:TIER]   ${label} → ${wantTier} (OVR ${liveOvr})`);
                if (!DRY_RUN) fighter.promotionTier = wantTier;
            }

            // ── Fame. peakTier MUST be written explicitly: ensureNotorietyShape only
            //    backfills it when falsy, and the schema default "UNKNOWN" is truthy — so
            //    it never self-heals, and tierLabel (what the profile prints) comes from
            //    peakTier, not score. Computed off the live record + healed tier.
            const wantFame = botNotoriety({
                promotionTier: wantTier,
                koWins: wantSplit.koWins,
                subWins: wantSplit.subWins,
                decisionWins: wantSplit.decisionWins,
                losses: liveLosses,
            });
            // Normalise the legacy numeric-notoriety shape before touching it (the shared
            // helper — same one every read path uses). It never sets peakTier off a
            // truthy default, which is exactly why we still write peakTier explicitly.
            ensureNotorietyShape(fighter);
            const curFame = fighter.notoriety || {};
            if (
                curFame.score !== wantFame.score ||
                curFame.peakTier !== wantFame.peakTier ||
                curFame.lastEventAt != null
            ) {
                plan.fameFix++;
                dirty = true;
                console.log(`  [fighter:FAME]   ${label} → ${wantFame.score} (${wantFame.peakTier})`);
                if (!DRY_RUN) {
                    fighter.notoriety.score = wantFame.score;
                    fighter.notoriety.peakTier = wantFame.peakTier;
                    // Null by design: runNotorietyDecayBatch only walks non-null
                    // lastEventAt, so a seeded score never decays.
                    fighter.notoriety.lastEventAt = null;
                    fighter.markModified("notoriety");
                }
            }

            // ── Gym. A missing gym leaves null (warned above) — don't churn it every run.
            if (gymId && String(fighter.gymId || "") !== String(gymId)) {
                plan.gymFix++;
                dirty = true;
                console.log(`  [fighter:GYM]    ${label} → ${p.gymName}`);
                if (!DRY_RUN) fighter.gymId = gymId;
            }

            // ── Career training sessions, off the LIVE total fights.
            const wantSessions = (liveWins + liveLosses) * 4;
            if (fighter.careerTrainingSessions !== wantSessions) {
                plan.trainFix++;
                dirty = true;
                console.log(`  [fighter:TRAIN]  ${label} → ${wantSessions} session(s)`);
                if (!DRY_RUN) fighter.careerTrainingSessions = wantSessions;
            }

            if (!dirty) console.log(`  [fighter:OK]     ${label}`);
            else if (!DRY_RUN) await fighter.save();
        }

        const div = divisionForDp(b.dp);
        counts[div] = (counts[div] || 0) + 1;

        // In a dry run an uncreated fighter has no _id — skip the dependent lookups but
        // still count what WOULD happen.
        if (!fighter) {
            plan.recordCreate++;
            plan.stateCreate++;
            console.log(`  [record:CREATE]  ${label} → ${div} @ ${b.dp} DP · ${b.w}-${b.l}`);
            console.log(`  [state:CREATE]   ${label}`);
            continue;
        }

        // ── PVPRecord in the target season: find-or-create. ──────────────────
        let record = await PVPRecord.findOne({ playerId: fighter._id, seasonId: season._id });
        if (!record) {
            plan.recordCreate++;
            console.log(`  [record:CREATE]  ${label} → ${div} @ ${b.dp} DP · ${b.w}-${b.l}`);
            if (!DRY_RUN) {
                const onStreak = i % 4 === 0; // a few show the streak pill
                const lastFightAt = new Date(now.getTime() - b.lastDays * DAY);
                await PVPRecord.create({
                    playerId: fighter._id,
                    seasonId: season._id,
                    weightClass: season.weightClass,   // season-derived ("Open") — load-bearing for pool filters
                    realWeightClass: b.wc,             // true class — drives the cross-WC filter + [WC] pill
                    division: div,
                    dp: b.dp,
                    peakDp: b.dp,
                    overallRating: b.ovr,
                    wins: b.w,
                    losses: b.l,
                    winStreak: onStreak ? 3 : 0,
                    longestStreak: onStreak ? 3 : 0,
                    defenseGameplan: GAMEPLAN_KEYS[i % GAMEPLAN_KEYS.length],
                    lastFightAt,
                    lastActiveAt: lastFightAt,
                });
            }
        } else {
            plan.recordFound++;
        }

        // ── PvpBotState: find-or-create. ─────────────────────────────────────
        const state = await PvpBotState.findOne({ fighterId: fighter._id });
        if (!state) {
            plan.stateCreate++;
            const hourBandStart = spreadBand(i);
            const baseIntervalHours = randInt(BOT_INTERVAL_MIN_HOURS, BOT_INTERVAL_MAX_HOURS);
            const nextActivityAt = seedNextActivityAt(i, now, hourBandStart);
            console.log(`  [state:CREATE]   ${label} · band ${hourBandStart}:00 UTC · every ~${baseIntervalHours}h · first ${nextActivityAt.toISOString()}`);
            if (!DRY_RUN) {
                await PvpBotState.create({
                    fighterId: fighter._id,
                    nextActivityAt,
                    baseIntervalHours,
                    hourBandStart,
                    gameplanIndex: i % GAMEPLAN_KEYS.length,
                });
            }
        } else {
            plan.stateFound++;
        }
    }

    console.log("\n── Convergence plan ──");
    console.log(`  Fighters : ${plan.fighterCreate} created, ${plan.fighterFound} found`);
    console.log(`  Healed   : ${plan.bannerFix} banner · ${plan.statsFix} stats · ${plan.splitFix} win-split · ${plan.fameFix} fame · ${plan.tierFix} promo-tier · ${plan.gymFix} gym · ${plan.trainFix} training`);
    console.log(`  Records  : ${plan.recordCreate} created, ${plan.recordFound} found`);
    console.log(`  States   : ${plan.stateCreate} created, ${plan.stateFound} found`);
    console.log(`  Tier mix : ${JSON.stringify(counts)}`);
    if (DRY_RUN) {
        console.log("\nDRY RUN — nothing was written. Re-run without --dry-run to apply.");
        return;
    }
    const total = await PVPRecord.countDocuments({ seasonId: season._id });
    console.log(`\nSeason now has ${total} PVP record(s).`);
}

(async () => {
    await connectDB();
    if (RESET || RESET_CONFIRMED) await runReset();
    else await runConverge();
    await mongoose.disconnect();
})().catch(async (e) => {
    console.error(e);
    try { await mongoose.disconnect(); } catch (_) { /* already down */ }
    process.exit(1);
});
