/**
 * DEBUG: fast-forward the current upcoming Main Event so it resolves now.
 *
 * What it does:
 *   1. Finds the latest event with status = "upcoming".
 *   2. Backdates its `resolvesAt` to one second ago.
 *   3. Calls `resolveEvent` directly — runs the simulation, pays every predictor
 *      (including the player's prediction if any), marks event resolved.
 *   4. The next time the Events tab loads, `getCurrentEvent` will see the
 *      resolved event + spawn a fresh upcoming event automatically.
 *
 * After running, refresh your Events tab in the browser — the prediction-result
 * overlay should pop on the first render (assuming you predicted this one).
 *
 * Flags:
 *   --list     dry-run — print what would be affected without changing anything
 *
 * Usage:
 *   node scripts/debugResolveMainEvent.js
 *   node scripts/debugResolveMainEvent.js --list
 *
 * Allowed when NODE_ENV is not production, or when DEBUG_ALLOW_EVENT_RESOLVE=1.
 */
const mongoose = require("mongoose");
const config = require("../config");
const MainEvent = require("../models/mainEventModel");
const mainEventService = require("../services/mainEventService");

function isAllowed() {
    return process.env.NODE_ENV !== "production" || process.env.DEBUG_ALLOW_EVENT_RESOLVE === "1";
}

async function main() {
    if (!isAllowed()) {
        console.error("Refused: set NODE_ENV!=production or DEBUG_ALLOW_EVENT_RESOLVE=1");
        process.exit(1);
    }

    const dryRun = process.argv.includes("--list");

    await mongoose.connect(config.database.url, config.database.options);
    try {
        const evt = await MainEvent.findOne({ status: "upcoming" }).sort({ createdAt: -1 });
        if (!evt) {
            console.log("No upcoming main event found. Nothing to fast-forward.");
            return;
        }

        const aName = evt.fighterA?.name || "Fighter A";
        const bName = evt.fighterB?.name || "Fighter B";
        console.log(`Found upcoming event: ${aName} vs ${bName} (${evt.weightClass})`);
        console.log(`  Original resolvesAt: ${evt.resolvesAt?.toISOString?.() || evt.resolvesAt}`);

        if (dryRun) {
            console.log("\n[--list] Dry run — would backdate resolvesAt and resolve. No changes made.");
            return;
        }

        // Backdate so any later getCurrentEvent calls also see it as past-due,
        // then resolve in-process so the player sees results immediately.
        evt.resolvesAt = new Date(Date.now() - 1000);
        await evt.save();

        await mainEventService.resolveEvent(evt);

        // Re-fetch to see what happened.
        const after = await MainEvent.findById(evt._id).lean();
        const outcome = after.actualOutcome || {};
        const winnerName = outcome.winnerSide === "A"
            ? aName
            : outcome.winnerSide === "B"
                ? bName
                : "Draw";

        console.log("\nEvent resolved.");
        console.log(`  Winner: ${winnerName}${outcome.method && outcome.winnerSide !== "DRAW" ? ` by ${outcome.method}` : ""}`);
        console.log(`  Status: ${after.status}`);
        console.log(`  Resolved at: ${after.resolvedAt?.toISOString?.() || after.resolvedAt}`);
        console.log("\nReload the Events tab — the prediction-result overlay should fire if you predicted this one.");
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
