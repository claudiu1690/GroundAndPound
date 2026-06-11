/**
 * Seed Proving Ground Season 1 — 4 active seasons (one per weight class), all belts
 * unclaimed, ladders empty. Idempotent (unique {weightClass,seasonNumber} index).
 *
 * Usage: node scripts/seedPvpSeason1.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const pvpSeasonService = require("../services/pvpSeasonService");

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const now = new Date();
    const seasons = await pvpSeasonService.seedAllForCycle(1, "iron_circuit", now, "active");
    for (const s of seasons) {
        console.log(`  Season ${s.seasonNumber} ${s.weightClass} — status=${s.status} twist=${s.twist} ends ${s.endDate.toISOString()}`);
    }
    console.log(`Seeded ${seasons.length} Proving Ground season(s) for cycle 1.`);

    await mongoose.disconnect();
    console.log("Done.");
}

run().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
