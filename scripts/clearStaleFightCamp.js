/**
 * One-shot utility: clears a fighter's stale fight-camp state from before
 * the Training Camp Overhaul (v1.1) was deployed.
 *
 * What it does:
 *   1. Finds the fighter by ID.
 *   2. Cancels their dangling accepted fight (sets status → "cancelled").
 *   3. Resets acceptedFightId, trainingCampActions, and weightCut on the fighter.
 *   4. Optionally removes any orphan FightCamp documents for that fight.
 *
 * Usage:
 *   node scripts/clearStaleFightCamp.js <fighterId>
 *
 * Example:
 *   node scripts/clearStaleFightCamp.js 69c296ff8dfec2180d50b62b
 */

const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const Fight = require("../models/fightModel");

// FightCamp may not exist yet on older deploys — require lazily
let FightCamp;
try {
    FightCamp = require("../models/fightCampModel");
} catch (_) {
    FightCamp = null;
}

async function run() {
    const fighterId = process.argv[2];
    if (!fighterId) {
        console.error("Usage: node scripts/clearStaleFightCamp.js <fighterId>");
        process.exit(1);
    }

    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    // ── 1. Load fighter ───────────────────────────────────────────────────────
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) {
        console.error(`Fighter not found: ${fighterId}`);
        process.exit(1);
    }
    console.log(`Fighter: ${fighter.name} (${fighter._id})`);
    console.log(`  acceptedFightId  : ${fighter.acceptedFightId ?? "none"}`);
    console.log(`  trainingCampActions: ${fighter.trainingCampActions ?? 0}`);
    console.log(`  weightCut        : ${fighter.weightCut ?? "easy"}`);

    const acceptedFightId = fighter.acceptedFightId;

    // ── 2. Cancel the dangling fight (if it still exists and is "accepted") ──
    if (acceptedFightId) {
        const fight = await Fight.findById(acceptedFightId);
        if (fight) {
            console.log(`\nFight: ${fight._id} | status: ${fight.status}`);
            if (fight.status === "accepted") {
                fight.status = "cancelled";
                await fight.save();
                console.log("  → fight status set to cancelled");
            } else {
                console.log(`  → fight already ${fight.status}, no change`);
            }

            // ── 3. Remove orphan FightCamp document if the model is available ──
            if (FightCamp) {
                const removed = await FightCamp.deleteOne({ fightId: acceptedFightId });
                if (removed.deletedCount > 0) {
                    console.log("  → orphan FightCamp document removed");
                } else {
                    console.log("  → no FightCamp document found (none to remove)");
                }
            }
        } else {
            console.log(`\nFight ${acceptedFightId} not found in DB — skipping fight cleanup`);
        }
    } else {
        console.log("\nFighter has no acceptedFightId — only resetting fighter fields");
    }

    // ── 4. Reset fighter fields ───────────────────────────────────────────────
    fighter.acceptedFightId = null;
    fighter.trainingCampActions = 0;
    fighter.weightCut = "easy";
    await fighter.save();
    console.log("\nFighter reset:");
    console.log("  acceptedFightId   → null");
    console.log("  trainingCampActions → 0");
    console.log("  weightCut          → easy");

    await mongoose.disconnect();
    console.log("\nDone. Fighter can now accept a new fight.");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
