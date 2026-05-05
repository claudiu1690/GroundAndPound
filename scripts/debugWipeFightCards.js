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

        // We DROP the collections (not just deleteMany) so stale indexes from earlier
        // schema versions are cleared too. Mongoose will recreate fresh indexes on next
        // write. Without this, an old { fighterId, mainEventId } unique index can still
        // enforce against new docs that have mainEventId=null, causing duplicate-key 500s.
        const db = mongoose.connection.db;

        async function dropIfExists(collName) {
            try {
                await db.collection(collName).drop();
                return true;
            } catch (err) {
                // namespace not found = collection didn't exist; safe to ignore.
                if (err?.codeName === "NamespaceNotFound") return false;
                throw err;
            }
        }

        const droppedCards   = await dropIfExists("fightcards");
        const droppedPreds   = await dropIfExists("predictions");
        const droppedLegacy  = await dropIfExists("mainevents");

        console.log(`\nDropped:`);
        if (droppedCards)  console.log(`  fightcards collection (${cardCount} doc${cardCount === 1 ? "" : "s"} + indexes)`);
        if (droppedPreds)  console.log(`  predictions collection (${predCount} doc${predCount === 1 ? "" : "s"} + indexes)`);
        if (droppedLegacy) console.log(`  mainevents (legacy) collection (${legacyCount} doc${legacyCount === 1 ? "" : "s"} + indexes)`);
        console.log("\nReload the Events tab — a fresh card will be assembled and Mongoose will rebuild fresh indexes on first write.");
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
