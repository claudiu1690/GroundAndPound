/**
 * Home Camp migration VERIFIER — read-only. Exits non-zero on ANY failure.
 *
 * This is the gate between "the backfill ran" and "the owner may flip GYMS_RETIRED". It is not
 * a smoke test: every check RE-DERIVES the expected value from the fighter's own gym history and
 * compares it to what was stored, so a wrong `GYM_SLUG_TO_DOMAIN` entry or a botched head-coach
 * tie-break shows up as a failure rather than as a quiet demotion of a live veteran.
 *
 * ⚠️ WRITES NOTHING. Ever. It is safe to run against production at any time.
 *
 * Checks:
 *   A1  one camp per fighter (no duplicates)
 *   A2  every non-bot fighter has a camp
 *   A3  1..MAX_COACHES coaches, exactly one isStarter
 *   A4  GYM_MIGRATION: sourceGymSlug maps non-null, starter rank === clamp(gymRanks[slug].rank,1,4),
 *       and sessions/wins are AT LEAST that rank's requirements (the never-below floor)
 *   A5  focusDomain correct for BOTH origins (gym head coach, or the style fallback)
 *   A6  starter coach: taughtMoveIds empty, pool length 1, ids in the catalog, COMMON,
 *       null trait, 0 wage, 0 hire fee
 *   A7  condition.value === 100, lastNeglectDayKey === utcDayKey(convertedAt),
 *       lastSessionDayKey === null  → NO RETRO-DECAY
 *   A8  tier === 1, lastWeeklyTickIndex === -1, market.weekIndex === -1, no candidates,
 *       nextWageDebitAt === null    → NO RETRO-WAGES
 *   A9  disciplineFamiliarity re-derived from gymRanks and deep-equal
 *   A10 FIGHTER UNTOUCHED — re-derives each digest and compares to the --snapshot taken before
 *       the commit. ⚠️ RUN THIS ONE OR YOU ARE TAKING "purely additive" ON FAITH.
 *   A11 full re-derivation of the camp on a sample, deep-equal against what is stored
 *
 * Usage:
 *   node scripts/verifyHomeCampMigration.js                      # sampled
 *   node scripts/verifyHomeCampMigration.js --all                # every non-bot fighter
 *   node scripts/verifyHomeCampMigration.js --all --snapshot=./out/pre.json
 *
 * Flags:
 *   --all                check 100% of non-bot fighters (use under ~20k; check with scripts/stats.js)
 *   --snapshot=<path>    enable A10 against a pre-commit snapshot from the backfill script
 *   --sample=2000        random sample size when not --all (veterans are ALWAYS 100% checked)
 *   --max-failures=50    stop printing after N failures (the exit code is unaffected)
 *   --verbose            print every check as it runs
 *
 * SAMPLE POLICY when not --all: 100% of fighters whose max gym rank is >= 3 (the veterans —
 * they are the ones a bad conversion actually costs something) PLUS a random 2,000 of everyone
 * else. A uniform random sample would under-weight exactly the population that matters.
 */
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const config = require("../config");

const Fighter = require("../models/fighterModel");
const HomeCamp = require("../models/homeCampModel");
const Gym = require("../models/gymModel");
const homeCampService = require("../services/homeCampService");
const { fighterDigest } = require("./migrateFightersToHomeCamp");
const { SPECIAL_MOVES_BY_ID } = require("../consts/specialMovesCatalog");
const {
    GYM_SLUG_TO_DOMAIN, STYLE_TO_DOMAIN, DEFAULT_DOMAIN,
    COACH_ARCHETYPES, COACH_RANKS, MAX_COACHES, CONDITION_MAX,
    DOMAIN_TEACH_POOLS, TEACH_BREADTH_BY_RARITY, utcDayKey,
} = require("../consts/homeCampConfig");

const hasOwn = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
const clampRank = (v) => Math.max(1, Math.min(4, Math.floor(Number(v)) || 1));
const toInt = (v) => Math.max(0, Math.floor(Number(v)) || 0);

function parseArgs(argv) {
    const args = { all: false, snapshot: null, sample: 2000, maxFailures: 50, verbose: false };
    for (const raw of argv.slice(2)) {
        if (raw === "--all") { args.all = true; continue; }
        if (raw === "--verbose") { args.verbose = true; continue; }
        const m = /^--([a-z-]+)=(.*)$/.exec(raw);
        if (!m) { console.error(`Unknown argument "${raw}"`); process.exit(2); }
        const [, key, value] = m;
        if (key === "snapshot") args.snapshot = value;
        else if (key === "sample") args.sample = Number(value) || 2000;
        else if (key === "max-failures") args.maxFailures = Number(value) || 50;
        else { console.error(`Unknown argument "--${key}"`); process.exit(2); }
    }
    return args;
}

// ── failure collection ───────────────────────────────────────────────────────

const failures = [];
let printed = 0;
function fail(check, fighterId, detail, maxFailures) {
    failures.push({ check, fighterId: String(fighterId), detail });
    if (printed < maxFailures) {
        printed += 1;
        console.error(`  ✖ ${check}  fighter ${fighterId}: ${detail}`);
    } else if (printed === maxFailures) {
        printed += 1;
        console.error(`  … further failures suppressed (--max-failures=${maxFailures}); the exit code still reflects all of them`);
    }
}

// ── the re-derivation used by A4/A5/A9/A11 ──────────────────────────────────

/** Independently re-derive the head coach + familiarity from a fighter's gym history. */
function rederive(fighter, gymSlugById) {
    const entries = Object.entries(fighter.gymRanks || {})
        .filter(([slug]) => hasOwn(GYM_SLUG_TO_DOMAIN, slug) && GYM_SLUG_TO_DOMAIN[slug] !== null)
        .map(([slug, p]) => ({
            slug,
            domain: GYM_SLUG_TO_DOMAIN[slug],
            rank: clampRank(p && p.rank),
            sessions: toInt(p && p.trainingSessions),
            wins: toInt(p && p.relevantWins),
        }));

    let head = null;
    const activeSlug = fighter.activeGymId ? gymSlugById[String(fighter.activeGymId)] : null;
    if (activeSlug) head = entries.find((e) => e.slug === activeSlug) || null;
    if (!head && entries.length > 0) {
        head = entries.slice().sort((a, b) => (b.rank - a.rank) || (b.sessions - a.sessions))[0];
    }

    const styleDomain = hasOwn(STYLE_TO_DOMAIN, fighter.style) ? STYLE_TO_DOMAIN[fighter.style] : null;
    const candidate = head ? head.domain : styleDomain;
    const focusDomain = COACH_ARCHETYPES[candidate] ? candidate : DEFAULT_DOMAIN;

    const familiarity = {};
    for (const e of entries) {
        if (head && e.slug === head.slug) continue;
        if (!familiarity[e.domain]) familiarity[e.domain] = { bankedSessions: 0, bankedWins: 0 };
        familiarity[e.domain].bankedSessions += e.sessions;
        familiarity[e.domain].bankedWins += e.wins;
    }

    return { entries, head, focusDomain, familiarity, source: head ? "GYM_MIGRATION" : "NEW" };
}

const maxGymRank = (f) =>
    Object.values(f.gymRanks || {}).reduce((m, p) => Math.max(m, clampRank(p && p.rank)), 0);

// ── the per-camp checks ──────────────────────────────────────────────────────

function checkCamp(fighter, camp, gymSlugById, args) {
    const id = fighter._id;
    const d = rederive(fighter, gymSlugById);

    /**
     * How much of the camp is still exactly what the conversion produced?
     *
     * This matters because the verifier is run right after the sweep (runbook step 7) but is
     * also safe to run months later, and most checks would produce FALSE ALARMS on a camp the
     * player has since used: training lowers condition, a hire changes the roster, a promotion
     * writes `taughtMoveIds`. So the checks are scoped honestly rather than gated on a single
     * blunt flag:
     *
     *   neverPlayed — no camp session has ever run and the roster is still the lone starter.
     *                 Deliberately does NOT look at `sessionsCompleted`: a migrated coach's
     *                 counter legitimately carries his GYM history, so keying off it made every
     *                 veteran — the exact population these checks exist for — skip silently.
     *   fresh       — neverPlayed AND converted today, i.e. not one completed UTC day has passed,
     *                 so no legitimate neglect decay or weekly tick can have happened yet.
     */
    const convertedAt = camp.origin?.convertedAt ? new Date(camp.origin.convertedAt) : null;
    const convertedToday = !!convertedAt && utcDayKey(convertedAt) === utcDayKey(new Date());
    const neverPlayed = (camp.condition?.lastSessionDayKey ?? null) === null
        && (camp.coaches || []).length === 1
        && !(camp.coaches[0] || {}).lastSessionAt;
    const fresh = convertedToday && neverPlayed;

    // A3 — roster shape
    const coaches = camp.coaches || [];
    if (coaches.length < 1 || coaches.length > MAX_COACHES) {
        fail("A3", id, `roster size ${coaches.length} outside 1..${MAX_COACHES}`, args.maxFailures);
    }
    const starters = coaches.filter((c) => c.isStarter);
    if (starters.length !== 1) fail("A3", id, `expected exactly 1 isStarter coach, found ${starters.length}`, args.maxFailures);
    const starter = starters[0] || coaches[0];
    if (!starter) return;

    // A5 — focusDomain, for BOTH origins
    if (camp.focusDomain !== d.focusDomain) {
        fail("A5", id, `focusDomain "${camp.focusDomain}" but re-derives to "${d.focusDomain}" (origin ${camp.origin?.source})`, args.maxFailures);
    }
    if (camp.origin?.source !== d.source) {
        fail("A5", id, `origin.source "${camp.origin?.source}" but re-derives to "${d.source}"`, args.maxFailures);
    }

    // A4 — GYM_MIGRATION fidelity. This is the veteran-safety check.
    if (camp.origin?.source === "GYM_MIGRATION") {
        const slug = camp.origin.sourceGymSlug;
        if (!slug) {
            fail("A4", id, "GYM_MIGRATION with a null sourceGymSlug", args.maxFailures);
        } else if (!hasOwn(GYM_SLUG_TO_DOMAIN, slug) || GYM_SLUG_TO_DOMAIN[slug] === null) {
            fail("A4", id, `sourceGymSlug "${slug}" maps to null/unknown — the conversion had no domain signal`, args.maxFailures);
        } else {
            const expectedRank = clampRank((fighter.gymRanks || {})[slug]?.rank);
            // A rank BELOW the source gym's is always a bug — that is a demoted veteran, and it
            // is the single most expensive thing this whole script exists to catch. A rank ABOVE
            // it is only a bug on a camp that has never been played (otherwise the player simply
            // promoted the coach themselves).
            if (starter.rank < expectedRank || (fresh && starter.rank !== expectedRank)) {
                fail("A4", id, `starter rank ${starter.rank} !== clamp(gymRanks["${slug}"].rank) ${expectedRank} — A VETERAN WAS DEMOTED`, args.maxFailures);
            }
            const def = COACH_RANKS[starter.rank];
            if (def) {
                if ((starter.sessionsCompleted || 0) < def.sessions) {
                    fail("A4", id, `rank ${starter.rank} coach has ${starter.sessionsCompleted} sessions, below that rank's requirement ${def.sessions}`, args.maxFailures);
                }
                if ((starter.relevantWins || 0) < def.wins) {
                    fail("A4", id, `rank ${starter.rank} coach has ${starter.relevantWins} wins, below that rank's requirement ${def.wins}`, args.maxFailures);
                }
            }
            const gymEntry = (fighter.gymRanks || {})[slug] || {};
            if ((starter.sessionsCompleted || 0) < toInt(gymEntry.trainingSessions)) {
                fail("A4", id, `sessions ${starter.sessionsCompleted} lower than the gym's ${gymEntry.trainingSessions} — the conversion may only RAISE`, args.maxFailures);
            }
            if ((starter.relevantWins || 0) < toInt(gymEntry.relevantWins)) {
                fail("A4", id, `wins ${starter.relevantWins} lower than the gym's ${gymEntry.relevantWins} — the conversion may only RAISE`, args.maxFailures);
            }
        }
    } else if (camp.origin?.sourceGymSlug !== null && camp.origin?.sourceGymSlug !== undefined) {
        fail("A4", id, `origin NEW but sourceGymSlug is "${camp.origin.sourceGymSlug}"`, args.maxFailures);
    }

    // A6 — starter coach shape
    // (taughtMoveIds only on a never-played camp: a promotion writes it, legitimately.)
    if (neverPlayed && (starter.taughtMoveIds || []).length !== 0) {
        fail("A6", id, `starter taughtMoveIds is not empty (${starter.taughtMoveIds}) — the conversion must NEVER retro-grant a move`, args.maxFailures);
    }
    const pool = starter.teachPoolMoveIds || [];
    const expectedPool = (DOMAIN_TEACH_POOLS[camp.focusDomain] || []).slice(0, TEACH_BREADTH_BY_RARITY.COMMON);
    if (pool.length !== expectedPool.length || pool.some((v, i) => v !== expectedPool[i])) {
        fail("A6", id, `starter teachPool [${pool}] !== expected [${expectedPool}]`, args.maxFailures);
    }
    for (const mid of pool) {
        if (!SPECIAL_MOVES_BY_ID[mid]) fail("A6", id, `starter teach pool holds unknown move id "${mid}"`, args.maxFailures);
    }
    if (starter.rarity !== "COMMON") fail("A6", id, `starter rarity "${starter.rarity}" !== COMMON`, args.maxFailures);
    if (starter.traitKey !== null && starter.traitKey !== undefined) fail("A6", id, `starter has traitKey "${starter.traitKey}"`, args.maxFailures);
    if ((starter.wage || 0) !== 0) fail("A6", id, `starter wage ${starter.wage} !== 0`, args.maxFailures);
    if ((starter.hireFee || 0) !== 0) fail("A6", id, `starter hireFee ${starter.hireFee} !== 0`, args.maxFailures);
    if (starter.archetype !== camp.focusDomain) fail("A6", id, `starter archetype "${starter.archetype}" !== focusDomain "${camp.focusDomain}"`, args.maxFailures);

    // A7 — NO RETRO-DECAY. A converted player must not be punished for days their camp
    // didn't exist.
    if (fresh) {
        if (Number(camp.condition?.value) !== CONDITION_MAX) {
            fail("A7", id, `freshly converted camp has condition ${camp.condition?.value}, expected ${CONDITION_MAX}`, args.maxFailures);
        }
        const expectedKey = camp.origin?.convertedAt ? utcDayKey(camp.origin.convertedAt) : null;
        if (expectedKey && camp.condition?.lastNeglectDayKey !== expectedKey) {
            fail("A7", id, `lastNeglectDayKey "${camp.condition?.lastNeglectDayKey}" !== utcDayKey(convertedAt) "${expectedKey}" — retro-decay window is open`, args.maxFailures);
        }
        // A8 — NO RETRO-WAGES.
        if (camp.tier !== 1) fail("A8", id, `freshly converted camp tier ${camp.tier} !== 1`, args.maxFailures);
        if (camp.lastWeeklyTickIndex !== -1) fail("A8", id, `lastWeeklyTickIndex ${camp.lastWeeklyTickIndex} !== -1`, args.maxFailures);
        if (camp.market?.weekIndex !== -1) fail("A8", id, `market.weekIndex ${camp.market?.weekIndex} !== -1`, args.maxFailures);
        if ((camp.market?.candidates || []).length !== 0) fail("A8", id, `freshly converted camp already has ${camp.market.candidates.length} market candidate(s)`, args.maxFailures);
        if (camp.nextWageDebitAt !== null && camp.nextWageDebitAt !== undefined) {
            fail("A8", id, `nextWageDebitAt is set (${camp.nextWageDebitAt}) on a camp that has never ticked`, args.maxFailures);
        }
    }

    // A9 — discipline familiarity, re-derived independently
    const stored = camp.disciplineFamiliarity || {};
    if (neverPlayed) {
        const storedKeys = Object.keys(stored).sort();
        const expectedKeys = Object.keys(d.familiarity).sort();
        if (storedKeys.join(",") !== expectedKeys.join(",")) {
            fail("A9", id, `familiarity domains [${storedKeys}] !== re-derived [${expectedKeys}]`, args.maxFailures);
        } else {
            for (const k of expectedKeys) {
                const a = stored[k] || {};
                const b = d.familiarity[k];
                if (toInt(a.bankedSessions) !== b.bankedSessions || toInt(a.bankedWins) !== b.bankedWins) {
                    fail("A9", id, `familiarity[${k}] {${a.bankedSessions},${a.bankedWins}} !== re-derived {${b.bankedSessions},${b.bankedWins}}`, args.maxFailures);
                }
            }
        }
    }

    // A11 — full re-derivation, deep-equal on the fields the constructor owns
    if (neverPlayed) {
        // Re-run the real constructor against the fighter's CURRENT gym history and compare. If
        // GYM_SLUG_TO_DOMAIN, the head-coach tie-break or the never-lower floors ever change
        // meaning, this is the check that notices.
        const rederived = homeCampService.deriveInitialCampState(fighter, gymSlugById);
        const freshStarter = rederived.coaches[0];
        const mismatches = [];
        if (rederived.focusDomain !== camp.focusDomain) mismatches.push(`focusDomain ${rederived.focusDomain}≠${camp.focusDomain}`);
        if (rederived.origin.source !== camp.origin?.source) mismatches.push(`source ${rederived.origin.source}≠${camp.origin?.source}`);
        if ((rederived.origin.sourceGymSlug ?? null) !== (camp.origin?.sourceGymSlug ?? null)) mismatches.push(`slug ${rederived.origin.sourceGymSlug}≠${camp.origin?.sourceGymSlug}`);
        if (freshStarter.rank !== starter.rank) mismatches.push(`rank ${freshStarter.rank}≠${starter.rank}`);
        if (freshStarter.sessionsCompleted !== starter.sessionsCompleted) mismatches.push(`sessions ${freshStarter.sessionsCompleted}≠${starter.sessionsCompleted}`);
        if (freshStarter.relevantWins !== starter.relevantWins) mismatches.push(`wins ${freshStarter.relevantWins}≠${starter.relevantWins}`);
        if (freshStarter.name !== starter.name) mismatches.push(`name ${freshStarter.name}≠${starter.name}`);
        if (mismatches.length) fail("A11", id, `re-derivation disagrees with the stored camp: ${mismatches.join(", ")}`, args.maxFailures);
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv);

    console.log("");
    console.log("═".repeat(72));
    console.log("  Home Camp migration verifier — READ-ONLY. Non-zero exit on any failure.");
    console.log("═".repeat(72));

    await mongoose.connect(config.database.url, config.database.options);

    const gymSlugById = {};
    for (const g of await Gym.find({}).select("_id slug").lean()) gymSlugById[String(g._id)] = g.slug;

    // ── A1 — one camp per fighter ──
    console.log("\n[A1] one camp per fighter…");
    const dupes = await HomeCamp.aggregate([
        { $group: { _id: "$fighterId", n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $limit: 100 },
    ]);
    for (const d of dupes) fail("A1", d._id, `${d.n} camps for one fighter — the unique index is not doing its job`, args.maxFailures);
    console.log(`  ${dupes.length === 0 ? "✔ no duplicates" : `✖ ${dupes.length} fighter(s) with duplicate camps`}`);

    // ── A2 — every non-bot fighter has a camp ──
    console.log("\n[A2] every non-bot fighter has a camp…");
    const totalFighters = await Fighter.countDocuments({ isPvpBot: { $ne: true } });
    const campedIds = new Set((await HomeCamp.find({}).select("fighterId").lean()).map((c) => String(c.fighterId)));
    let missing = 0;
    {
        const cursor = Fighter.find({ isPvpBot: { $ne: true } }).select("_id").lean().cursor({ batchSize: 1000 });
        for await (const f of cursor) {
            if (!campedIds.has(String(f._id))) {
                missing += 1;
                fail("A2", f._id, "non-bot fighter has no HomeCamp", args.maxFailures);
            }
        }
    }
    console.log(`  ${totalFighters} non-bot fighter(s), ${missing} without a camp`);

    // ── A3–A11 — the per-camp checks ──
    console.log(`\n[A3–A11] per-camp checks (${args.all ? "ALL fighters" : `veterans 100% + random ${args.sample}`})…`);
    let checked = 0;
    let veterans = 0;
    const sampleRate = args.all ? 1 : Math.min(1, args.sample / Math.max(1, totalFighters));
    {
        const cursor = Fighter.find({ isPvpBot: { $ne: true } }).lean().cursor({ batchSize: 500 });
        for await (const fighter of cursor) {
            const isVeteran = maxGymRank(fighter) >= 3;
            // Veterans are ALWAYS checked — they are the population a bad conversion costs
            // something. A uniform sample would under-weight exactly them.
            if (!args.all && !isVeteran && Math.random() > sampleRate) continue;
            const camp = await HomeCamp.findOne({ fighterId: fighter._id }).lean();
            if (!camp) continue;   // already reported by A2
            if (isVeteran) veterans += 1;
            checked += 1;
            checkCamp(fighter, camp, gymSlugById, args);
            if (args.verbose && checked % 500 === 0) console.log(`  …${checked} checked`);
        }
    }
    console.log(`  checked ${checked} camp(s), of which ${veterans} veteran(s) (max gym rank >= 3)`);

    // ── A10 — FIGHTER UNTOUCHED ──
    console.log("\n[A10] fighter documents untouched…");
    if (!args.snapshot) {
        console.log("  ⚠ SKIPPED — no --snapshot given. Without it you are taking \"purely additive\" ON FAITH.");
        console.log("    Re-run the backfill with --snapshot=./out/pre.json BEFORE --commit, then pass it here.");
    } else {
        const file = path.resolve(args.snapshot);
        if (!fs.existsSync(file)) {
            console.error(`  ✖ snapshot not found: ${file}`);
            fail("A10", "-", `snapshot file missing: ${file}`, args.maxFailures);
        } else {
            const snap = JSON.parse(fs.readFileSync(file, "utf8"));
            let compared = 0;
            for (const row of snap.rows || []) {
                const f = await Fighter.findById(row._id).lean();
                if (!f) { fail("A10", row._id, "fighter in the snapshot no longer exists", args.maxFailures); continue; }
                const now = fighterDigest(f);
                compared += 1;
                for (const key of Object.keys(row)) {
                    const a = JSON.stringify(row[key]);
                    const b = JSON.stringify(now[key]);
                    if (a !== b) {
                        fail("A10", row._id, `FIGHTER WAS MODIFIED — ${key}: ${a} → ${b}`, args.maxFailures);
                    }
                }
            }
            console.log(`  compared ${compared} fighter digest(s) against ${path.basename(file)}`);
        }
    }

    // ── verdict ──
    console.log("\n" + "─".repeat(72));
    if (failures.length === 0) {
        console.log("  ✔ ALL CHECKS PASSED");
        console.log("─".repeat(72) + "\n");
        await mongoose.disconnect();
        process.exit(0);
    }
    const byCheck = {};
    for (const f of failures) byCheck[f.check] = (byCheck[f.check] || 0) + 1;
    console.error(`  ✖ ${failures.length} FAILURE(S)`);
    for (const k of Object.keys(byCheck).sort()) console.error(`      ${k}: ${byCheck[k]}`);
    console.error("\n  DO NOT FLIP GYMS_RETIRED. Fix the cause and re-run.");
    console.error("─".repeat(72) + "\n");
    await mongoose.disconnect();
    process.exit(1);
}

if (require.main === module) {
    main().catch(async (err) => {
        console.error("\n[verifyHomeCampMigration] FAILED:", err);
        try { await mongoose.disconnect(); } catch (_) { /* already down */ }
        process.exit(1);
    });
}

module.exports = { parseArgs, rederive, checkCamp };
