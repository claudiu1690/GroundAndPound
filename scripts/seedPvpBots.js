/**
 * Ground & Pound — PvP bot ladder seed (cold-start fix).
 *
 * THE PROBLEM: a fighter only becomes attackable after 3 PvP fights, and everyone
 * starts at 0. With no seeded ladder, the very first players can never reach 3 fights
 * because there is nobody (with ≥3 fights) to attack — a permanent deadlock.
 *
 * THE FIX: seed 30 "bots" — userId-less Fighter docs flagged isPvpBot:true — spread across
 * the OVR range so any new player has in-bracket (±8 OVR) targets from day one. Bots are
 * ranked (total_fights=5), so they ARE attackable; their rank_points rise with OVR so the
 * ladder is meaningfully ordered. The genesis belt is allowed to land on the top bot via the
 * existing runLadderRecalcBatch champion-seeding (a player takes it by beating them).
 *
 * Bots are excluded from every PvE list/leaderboard (see the isPvpBot:{$ne:true} filters in
 * fighterService.listFighters, fighterController.notorietyLeaderboard,
 * notorietyService.runNotorietyDecayBatch). They never log in, so PvP keeps them at full
 * health + uninjured (see processPvpResult bot-defender branch) so they stay valid targets.
 *
 * Usage:
 *   node scripts/seedPvpBots.js            upsert the 30 bots (idempotent)
 *   node scripts/seedPvpBots.js --reset    delete ALL bots first, then re-seed
 *
 * ───────────────────────────────────────────────────────────────────────────────────────
 *  !!  DANGER — the --reset deleteMany IS SCOPED STRICTLY TO { isPvpBot: true }.          !!
 *  !!  NEVER widen this filter. An unscoped deleteMany({}) here would PERMANENTLY WIPE     !!
 *  !!  EVERY REAL PLAYER in the fighters collection. The scope is the only thing standing  !!
 *  !!  between this maintenance script and total data loss. Do not touch it.               !!
 * ───────────────────────────────────────────────────────────────────────────────────────
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const pvpService = require("../services/pvpService");
const { STYLES, PROMOTION_TIERS, ENERGY } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");

const STYLE_KEYS = Object.keys(STYLES);
// PvP ignores weight class (only ±8 OVR matters), so one fixed valid class is fine.
const BOT_WEIGHT_CLASS = "Lightweight";

// OVR rungs: 12,18,24,…,96 (step 6) — 15 rungs, 2 bots per rung = 30 bots.
const OVR_MIN = 12;
const OVR_MAX = 96;
const OVR_STEP = 6;
const BOTS_PER_RUNG = 2;

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Generate 8 stats that produce ~targetOvr (weighted by style), biased toward the style's
 * primary stats. Based on scripts/seedOpponents.js generateStats, but because calculateOverall
 * uses a weighted mean (primary ×1.4, secondary ×1.0, off ×0.6), a naive spread lands well
 * below target. So after the initial spread we measure the real weighted OVR and scale the
 * stats a couple of times to converge on the target — the caller then persists the recomputed
 * OVR (never the raw target), so the stored OVR and the engine's stats agree.
 */
function generateStats(style, targetOvr) {
    const styleDef = STYLES[style];
    const primary = styleDef.primary || [];
    const STAT_KEYS = ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"];
    const stats = {};
    for (const key of STAT_KEYS) {
        const isPrimary = primary.includes(key);
        const base = isPrimary
            ? targetOvr + randInt(-4, 8)        // primaries near/above target
            : targetOvr * 0.75 + randInt(-5, 5); // off-stats a notch below (keeps a profile)
        stats[key.toLowerCase()] = Math.max(5, Math.min(99, Math.round(base)));
    }

    // Converge: scale all stats by (target / currentOvr) a few times. calculateOverall reads
    // lowercase stat keys + style, so we pass a {style, ...stats} probe.
    for (let iter = 0; iter < 4; iter++) {
        const current = calculateOverall({ style, ...stats });
        if (current === targetOvr || current <= 0) break;
        const scale = targetOvr / current;
        for (const key of STAT_KEYS) {
            const k = key.toLowerCase();
            stats[k] = Math.max(5, Math.min(99, Math.round(stats[k] * scale)));
        }
    }
    return stats;
}

/**
 * Pick the promotion tier whose OVR band contains `ovr`: the highest tier whose minOverall
 * is ≤ ovr (PROMOTION_TIERS bands overlap, and the order is ascending). Falls back to the
 * lowest tier for sub-minimum OVRs.
 */
function tierForOvr(ovr) {
    const tiers = Object.entries(PROMOTION_TIERS); // insertion order = ascending
    let chosen = tiers[0][0];
    for (const [name, cfg] of tiers) {
        if (ovr >= (cfg.minOverall ?? 0)) chosen = name;
    }
    return chosen;
}

/**
 * Believable record summing to total_fights=5. Lower rungs are scrappier (more losses),
 * top rungs near-flawless. rankFrac is 0 (bottom rung) → 1 (top rung).
 */
function recordForRank(rankFrac) {
    // wins climb from ~2 to 5 as rank rises; the remainder splits into losses (mostly) + a draw.
    const wins = Math.min(5, Math.max(2, Math.round(2 + rankFrac * 3)));
    const remainder = 5 - wins;
    // One draw on a couple of the mid rungs for flavour; rest are losses.
    const draws = remainder >= 2 && rankFrac > 0.2 && rankFrac < 0.8 ? 1 : 0;
    const losses = remainder - draws;
    return { wins, losses, draws };
}

/**
 * rank_points band that rises monotonically with OVR: rung 0 ~0–40 … top rung ~900–1000.
 * Linear interpolation of the band endpoints by rankFrac, with a small jitter that can't
 * break monotonicity between rungs (jitter < half the inter-rung gap).
 */
function rankPointsForRank(rankFrac, rungs) {
    const lo = Math.round(rankFrac * 920);          // 0 … 920
    const hi = lo + 80;                              // band width 80 → top rung ~920–1000
    const point = randInt(lo, hi);
    return Math.max(0, point);
}

function buildBot(ovr, rungIndex, totalRungs, dupIndex) {
    const style = STYLE_KEYS[randInt(0, STYLE_KEYS.length - 1)];
    const stats = generateStats(style, ovr);

    // Reuse the canonical pvp default object (don't hand-retype a divergent copy), then override.
    const rankFrac = totalRungs > 1 ? rungIndex / (totalRungs - 1) : 0;
    const { wins, losses, draws } = recordForRank(rankFrac);
    const rank_points = rankPointsForRank(rankFrac, totalRungs);
    const recentFightAt = new Date(Date.now() - randInt(1, 72) * 3_600_000); // within last 3 days

    const pvp = {
        ...pvpService.defaultPvp(),
        wins,
        losses,
        draws,
        total_fights: 5,            // ≥3 → ranked & attackable (the whole point)
        rank_points,
        ladder_rank: null,          // runLadderRecalcBatch assigns this
        is_champion: false,         // recalc may promote the top bot to genesis champion
        attackable_after: null,
        last_pvp_fight_at: recentFightAt,
    };

    const botDoc = {
        userId: null,
        isPvpBot: true,
        firstName: "Bot",
        lastName: `${ovr}-${dupIndex}`,   // stable upsert key with firstName
        nickname: "CPU",
        weightClass: BOT_WEIGHT_CLASS,
        style,
        backstory: null,
        ...stats,
        // Full health/energy/stamina shapes the fight engine + schema expect.
        maxStamina: 100,
        health: 100,
        healthLastRegenAt: new Date(),
        energy: { current: ENERGY.max, max: ENERGY.max, lastSyncedAt: new Date() },
        iron: 0,
        promotionTier: tierForOvr(ovr),
        pvp,
    };

    // The bracket check reads the STORED overallRating while the engine reads stats — they
    // must agree, so recompute the real OVR from the generated stats and persist THAT.
    botDoc.overallRating = calculateOverall(botDoc);
    return botDoc;
}

/** Build all 30 bot docs (pure — no DB). Exported for dry schema-validation tests. */
function buildAllBots() {
    const rungs = [];
    for (let o = OVR_MIN; o <= OVR_MAX; o += OVR_STEP) rungs.push(o);
    const totalRungs = rungs.length;

    const bots = [];
    rungs.forEach((ovr, rungIndex) => {
        for (let dup = 1; dup <= BOTS_PER_RUNG; dup++) {
            bots.push(buildBot(ovr, rungIndex, totalRungs, dup));
        }
    });
    return bots;
}

async function run() {
    const reset = process.argv.includes("--reset");

    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    if (reset) {
        // SCOPED STRICTLY TO BOTS — see the DANGER banner at the top of this file.
        const del = await Fighter.deleteMany({ isPvpBot: true });
        console.log(`[seedPvpBots] --reset: deleted ${del.deletedCount} existing bot(s) (scope: { isPvpBot: true }).`);
    }

    const bots = buildAllBots();
    let upserted = 0;
    for (const bot of bots) {
        // Idempotent upsert by the stable key { isPvpBot, firstName, lastName }.
        const res = await Fighter.updateOne(
            { isPvpBot: true, firstName: bot.firstName, lastName: bot.lastName },
            { $set: bot },
            { upsert: true }
        );
        if (res.upsertedCount || res.modifiedCount || res.matchedCount) upserted += 1;
    }
    console.log(`[seedPvpBots] Upserted ${upserted}/${bots.length} bot(s).`);

    // Assign ladder_rank to all ranked fighters and seed the genesis champion (top bot)
    // if the belt is currently vacant.
    const { ranked, championSeeded } = await pvpService.runLadderRecalcBatch();
    console.log(`[seedPvpBots] Ladder recalc: ${ranked} ranked fighter(s)${championSeeded ? " (genesis champion seeded)" : ""}.`);

    // Summary by OVR/tier for a quick eyeball.
    const summary = await Fighter.find({ isPvpBot: true })
        .select("lastName overallRating promotionTier style pvp.rank_points pvp.ladder_rank pvp.is_champion")
        .sort({ overallRating: 1 })
        .lean();
    console.log("[seedPvpBots] Bot distribution (OVR · tier · style · rankPts · ladderRank · champ):");
    for (const b of summary) {
        console.log(
            `  OVR ${String(b.overallRating).padStart(2)} · ${(b.promotionTier || "").padEnd(13)} · ` +
            `${(b.style || "").padEnd(20)} · pts ${String(b.pvp?.rank_points ?? 0).padStart(4)} · ` +
            `#${b.pvp?.ladder_rank ?? "-"}${b.pvp?.is_champion ? " · CHAMPION" : ""}`
        );
    }

    await mongoose.disconnect();
    console.log("[seedPvpBots] Done.");
}

// Only auto-run when invoked directly (so tests can require buildAllBots without a DB).
if (require.main === module) {
    run().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { buildAllBots, buildBot, tierForOvr, generateStats };
