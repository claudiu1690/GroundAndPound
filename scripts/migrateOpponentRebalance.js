/**
 * Migration: rebalance all existing Opponent documents.
 *
 * Two changes per opponent:
 *   1. Assign a `strategy` based on their style (if not already set).
 *   2. Replace uniform-scaled stats with style-weighted stats matching the same OVR target.
 *      A Wrestler at OVR 50 ends up with high WRE/GND and modest STR/SPD instead of
 *      having every stat scaled to ~50, which was the source of the OVR-vs-fight-power mismatch.
 *
 * The existing OVR is preserved as the target so matchmaking ranges don't shift.
 *
 * Run:  node scripts/migrateOpponentRebalance.js
 * Idempotent: rerunning re-rolls stats again with fresh variance, but OVR target stays the same.
 */

const mongoose = require("mongoose");
const config = require("../config");
const Opponent = require("../models/opponentModel");
const { buildScaledOpponentStats, strategyForStyle } = require("../utils/opponentStats");

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const opponents = await Opponent.find({});
    console.log(`Found ${opponents.length} opponents to rebalance`);

    let updated = 0;
    let skipped = 0;

    for (const opp of opponents) {
        const targetOvr = opp.overallRating;
        if (!targetOvr || !opp.style) {
            skipped++;
            continue;
        }

        const fresh = buildScaledOpponentStats(opp.style, targetOvr);

        opp.str = fresh.str;
        opp.spd = fresh.spd;
        opp.leg = fresh.leg;
        opp.wre = fresh.wre;
        opp.gnd = fresh.gnd;
        opp.sub = fresh.sub;
        opp.chn = fresh.chn;
        opp.fiq = fresh.fiq;
        opp.overallRating = fresh.overallRating;
        opp.strategy = strategyForStyle(opp.style);

        await opp.save();
        updated++;
    }

    console.log(`Rebalanced: ${updated}, skipped: ${skipped}`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
