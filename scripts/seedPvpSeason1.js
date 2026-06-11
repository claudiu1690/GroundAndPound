/**
 * Seed Proving Ground Season 1 — ONE active Open (cross-weight-class) season: a single
 * merged ladder across all weight classes, one belt, belt unclaimed, ladder empty.
 * Idempotent (unique {weightClass,seasonNumber} index). At season end every player
 * redistributes into their REAL weight class for the per-WC Season 2.
 *
 * Usage: node scripts/seedPvpSeason1.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const pvpSeasonService = require("../services/pvpSeasonService");

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const season = await pvpSeasonService.seedOpenSeason(1, "iron_circuit", new Date(), "active");
    const crossWeightClass = !!(season.config && season.config.crossWeightClass);
    console.log(
        `  Season ${season.seasonNumber} ${season.weightClass} — status=${season.status} ` +
        `twist=${season.twist} crossWeightClass=${crossWeightClass} ends ${season.endDate.toISOString()}`
    );
    console.log("Seeded 1 Open Proving Ground season for cycle 1.");

    await mongoose.disconnect();
    console.log("Done.");
}

run().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
