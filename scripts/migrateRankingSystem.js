/**
 * Migration: Ranking System v1.0
 *
 * Wipes the existing Opponent collection (their IDs won't match the new fixed-rank
 * roster anyway), clears all references to Opponent IDs on Fighter docs (nemesis,
 * beef flags, respect flags, active callouts, accepted fights), and resets the
 * ranking subdoc on every fighter.
 *
 * After this script runs, immediately run scripts/seedOpponentsAndGym.js to populate
 * the new fixed roster (420 NPCs across 5 tiers × 4 weight classes).
 *
 * Communicate in patch notes: existing test fighters lose their beef/respect/nemesis
 * targets, but career records, stats, and progression are preserved.
 *
 * Run: node scripts/migrateRankingSystem.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const Opponent = require("../models/opponentModel");
const Fighter = require("../models/fighterModel");
const Fight = require("../models/fightModel");

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    // 1. Wipe all opponents — the new seed script will re-create them with fixedRank.
    const oppCount = await Opponent.countDocuments({});
    if (oppCount > 0) {
        await Opponent.deleteMany({});
        console.log(`Removed ${oppCount} old Opponent docs`);
    } else {
        console.log("No Opponent docs to remove");
    }

    // 2. Wipe all Fight docs (references to Opponent IDs now invalid).
    const fightCount = await Fight.countDocuments({});
    if (fightCount > 0) {
        await Fight.deleteMany({});
        console.log(`Removed ${fightCount} old Fight docs`);
    }

    // 3. For every Fighter, clear opponent-ID references and reset ranking subdoc.
    const fighters = await Fighter.find({});
    console.log(`Resetting ranking + clearing flags on ${fighters.length} fighters`);

    let touched = 0;
    for (const f of fighters) {
        let changed = false;

        // Clear references to (now-deleted) Opponent IDs.
        if (f.nemesis && (f.nemesis.opponentId || f.nemesis.opponentName)) {
            f.nemesis = { opponentId: null, opponentName: null, lossCount: 0, setAt: null };
            f.markModified("nemesis");
            changed = true;
        }
        if (Array.isArray(f.beefFlags) && f.beefFlags.length > 0) {
            f.beefFlags = [];
            changed = true;
        }
        if (Array.isArray(f.respectFlags) && f.respectFlags.length > 0) {
            f.respectFlags = [];
            changed = true;
        }
        if (f.activeCallout && f.activeCallout.opponentId) {
            f.activeCallout = undefined;
            changed = true;
        }
        if (f.acceptedFightId) {
            f.acceptedFightId = null;
            changed = true;
        }

        // Reset ranking subdoc to defaults — every fighter starts Unranked in their current tier.
        f.ranking = {
            rank: null,
            fightsInTier: 0,
            entryRecordAtFight3: null,
        };
        f.markModified("ranking");
        changed = true;

        if (changed) {
            await f.save();
            touched++;
        }
    }

    console.log(`Migrated: ${touched} fighter(s).`);
    console.log("\nNext step: run `node scripts/seedOpponentsAndGym.js` to populate the new roster.");
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
