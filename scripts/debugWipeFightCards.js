/**
 * DEBUG: wipe all FightCard + Prediction documents.
 *
 * Use this when you've changed the schema or want a clean slate to test the
 * card flow from scratch. Drops both the old `mainevents` collection (legacy
 * single-fight system) and the new `fightcards` collection, plus all predictions.
 *
 * Usage:
 *   node scripts/debugWipeFightCards.js
 *   node scripts/debugWipeFightCards.js --list   # dry run
 *
 * Allowed when NODE_ENV is not production, or when DEBUG_ALLOW_EVENT_WIPE=1.
 */
const mongoose = require("mongoose");
const config = require("../config");
const FightCard = require("../models/mainEventModel");
const Prediction = require("../models/predictionModel");

function isAllowed() {
    return process.env.NODE_ENV !== "production" || process.env.DEBUG_ALLOW_EVENT_WIPE === "1";
}

async function main() {
    if (!isAllowed()) {
        console.error("Refused: set NODE_ENV!=production or DEBUG_ALLOW_EVENT_WIPE=1");
        process.exit(1);
    }
    const dryRun = process.argv.includes("--list");

    await mongoose.connect(config.database.url, config.database.options);
    try {
        const cardCount = await FightCard.countDocuments();
        const predCount = await Prediction.countDocuments();

        // Legacy collection from the v1 single-fight system, if it still exists.
        let legacyCount = 0;
        try {
            const db = mongoose.connection.db;
            const legacy = db.collection("mainevents");
            legacyCount = await legacy.countDocuments();
        } catch (_) {}

        console.log(`Found:`);
        console.log(`  fightcards:  ${cardCount}`);
        console.log(`  predictions: ${predCount}`);
        console.log(`  mainevents (legacy): ${legacyCount}`);

        if (dryRun) {
            console.log("\n[--list] Dry run — no changes made.");
            return;
        }

        const cardRes = await FightCard.deleteMany({});
        const predRes = await Prediction.deleteMany({});
        let legacyDeleted = 0;
        if (legacyCount > 0) {
            try {
                const r = await mongoose.connection.db.collection("mainevents").deleteMany({});
                legacyDeleted = r.deletedCount || 0;
            } catch (_) {}
        }

        console.log(`\nDeleted:`);
        console.log(`  ${cardRes.deletedCount} fightcard(s)`);
        console.log(`  ${predRes.deletedCount} prediction(s)`);
        if (legacyDeleted > 0) console.log(`  ${legacyDeleted} legacy mainevent(s)`);
        console.log("\nReload the Events tab — a fresh card will be assembled on the next request.");
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
