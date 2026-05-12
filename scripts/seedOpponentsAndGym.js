/**
 * Seed script — Ranking System v1.0 NPC roster.
 *
 * Creates the fixed NPC roster for every (tier, weightClass) pair. Each roster has
 * rosterSize + 1 fighters (rank 1 = champion, ranks 2..N = roster). OVR is distributed
 * across the tier range so rank 1 sits at the top and rank N at the bottom.
 * Stats are generated via buildScaledOpponentStats; strategy by style.
 *
 * Idempotent: if a (tier, wc) roster already has the expected number of NPCs, skipped.
 *
 * NOTE: Gyms are seeded via scripts/seedGyms.js — not this script.
 *
 * Run: node scripts/seedOpponentsAndGym.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const Opponent = require("../models/opponentModel");
const { WEIGHT_CLASSES, STYLES, PROMOTION_TIERS } = require("../consts/gameConstants");
const { generateOpponentName } = require("../utils/opponentNames");
const { buildScaledOpponentStats, strategyForStyle } = require("../utils/opponentStats");
const { generateFightHistory } = require("./migrateCampHistory");
const { ROSTER_SIZE } = require("../services/rankingService");

const styleKeys = Object.keys(STYLES);

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Generate a plausible win/loss/draw record based on promotion tier.
 * Higher tiers have more fights and a better win percentage.
 */
function generateRecord(promotionTier) {
    const ranges = {
        Amateur:         { wins: [1, 5],   losses: [0, 3], drawChance: 0.10 },
        "Regional Pro":  { wins: [4, 12],  losses: [1, 5], drawChance: 0.08 },
        National:        { wins: [8, 20],  losses: [2, 7], drawChance: 0.06 },
        "GCS Contender": { wins: [14, 28], losses: [2, 8], drawChance: 0.05 },
        GCS:             { wins: [20, 38], losses: [3, 10], drawChance: 0.04 },
    };
    const r = ranges[promotionTier] || ranges.Amateur;
    const wins   = randInt(r.wins[0],   r.wins[1]);
    const losses = randInt(r.losses[0], r.losses[1]);
    const draws  = Math.random() < r.drawChance ? randInt(1, 2) : 0;
    return { wins, losses, draws };
}

/**
 * OVR distribution for a given rank within a tier.
 * Rank 1 = champion at tierMax. Rank N (last) = tierMin (clamped >= 8 so stats are fightable).
 * Linear interpolation in between, with a tiny jitter so two rank-adjacent fighters
 * aren't identical.
 */
function ovrForRank(tier, rank, totalRanks) {
    const tierCfg = PROMOTION_TIERS[tier];
    if (!tierCfg) return 30;
    const top = tierCfg.maxOverall;
    const bottom = Math.max(8, tierCfg.minOverall);
    if (totalRanks <= 1) return top;
    // rank 1 → top, rank totalRanks → bottom (linear).
    const t = (rank - 1) / (totalRanks - 1);
    const base = Math.round(top - (top - bottom) * t);
    const jitter = randInt(-1, 1);
    return Math.max(bottom, Math.min(top, base + jitter));
}

async function seedTierRoster(tier, wc) {
    const expectedSize = (ROSTER_SIZE[tier] || 0) + 1; // +1 for champion
    if (expectedSize <= 1) return; // unknown tier
    const existing = await Opponent.countDocuments({
        promotionTier: tier,
        weightClass: wc,
        fixedRank: { $ne: null },
    });
    if (existing >= expectedSize) {
        console.log(`  ${tier} / ${wc}: already seeded (${existing}/${expectedSize})`);
        return;
    }
    if (existing > 0 && existing < expectedSize) {
        console.warn(`  ${tier} / ${wc}: partial roster (${existing}/${expectedSize}) — leaving alone, run migration to wipe first`);
        return;
    }

    let created = 0;
    for (let rank = 1; rank <= expectedSize; rank++) {
        const isChampion = rank === 1;
        const style = pickRandom(styleKeys);
        const targetOvr = ovrForRank(tier, rank, expectedSize);
        const scaled = buildScaledOpponentStats(style, targetOvr);
        const { name, nickname } = generateOpponentName(true);
        const record = generateRecord(tier);
        const fightHistory = generateFightHistory({ style, chn: scaled.chn, record });

        await Opponent.create({
            name,
            nickname,
            weightClass: wc,
            style,
            strategy: strategyForStyle(style),
            promotionTier: tier,
            fixedRank: rank,
            overallRating: scaled.overallRating,
            str: scaled.str, spd: scaled.spd, leg: scaled.leg, wre: scaled.wre,
            gnd: scaled.gnd, sub: scaled.sub, chn: scaled.chn, fiq: scaled.fiq,
            isChampion,
            championTier: isChampion ? tier : null,
            record,
            fightHistory,
        });
        created++;
    }
    console.log(`  ${tier} / ${wc}: created ${created} (rank 1 = champion)`);
}

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    // Seed all 5 tiers × 4 weight classes.
    for (const tier of Object.keys(ROSTER_SIZE)) {
        console.log(`\n${tier}:`);
        for (const wc of WEIGHT_CLASSES) {
            await seedTierRoster(tier, wc);
        }
    }

    await mongoose.disconnect();
    console.log("\nDone. (Reminder: run scripts/seedGyms.js separately if gym data is missing.)");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
