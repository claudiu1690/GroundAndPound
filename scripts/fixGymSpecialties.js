/**
 * Fix: Local Fight Club (T1) is a plain gym — no specialty stats.
 * Run: node scripts/fixGymSpecialties.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const Gym = require("../models/gymModel");

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const result = await Gym.updateOne(
        { name: "Local Fight Club", tier: "T1" },
        { $set: { specialtyStats: [] } }
    );
    console.log(result.matchedCount
        ? `Fixed Local Fight Club → specialtyStats cleared (no specialty)`
        : "Gym not found — nothing updated");

    await mongoose.disconnect();
    console.log("Done.");
}

run().catch((err) => { console.error(err); process.exit(1); });
