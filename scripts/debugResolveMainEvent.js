/**
 * DEBUG: fast-forward the current upcoming Fight Card so it resolves now.
 *
 * What it does:
 *   1. Finds the latest card with status = "upcoming".
 *   2. Backdates its `resolvesAt` to one second ago.
 *   3. Calls `resolveCard` directly — runs the simulator on every sub-fight,
 *      updates each NPC's record + fightHistory, pays every prediction.
 *   4. The next time the Events tab loads, `getCurrentEvent` will see the
 *      resolved card + spawn a fresh upcoming one automatically.
 *
 * After running, refresh your Events tab — the multi-fight result overlay should
 * pop on the first render (assuming you predicted at least one fight).
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
const FightCard = require("../models/mainEventModel");
const fightCardService = require("../services/mainEventService");

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
        const card = await FightCard.findOne({ status: "upcoming" }).sort({ createdAt: -1 });
        if (!card) {
            console.log("No upcoming fight card found. Nothing to fast-forward.");
            return;
        }

        console.log(`Found upcoming card: Fight Night #${card.cardNumber} (${card.fights.length} fights)`);
        console.log(`  Original resolvesAt: ${card.resolvesAt?.toISOString?.() || card.resolvesAt}`);
        for (const f of card.fights) {
            console.log(`  · [${f.slot}] ${f.fighterA.name} (${f.fighterA.overallRating}) vs ${f.fighterB.name} (${f.fighterB.overallRating}) [${f.weightClass}]`);
        }

        if (dryRun) {
            console.log("\n[--list] Dry run — would backdate resolvesAt and resolve. No changes made.");
            return;
        }

        card.resolvesAt = new Date(Date.now() - 1000);
        await card.save();

        await fightCardService.resolveCard(card);

        const after = await FightCard.findById(card._id).lean();
        console.log("\nCard resolved. Outcomes:");
        for (const f of after.fights) {
            const winnerName = f.actualOutcome?.winnerSide === "A"
                ? f.fighterA.name
                : f.actualOutcome?.winnerSide === "B"
                    ? f.fighterB.name
                    : "Draw";
            const method = f.actualOutcome?.method;
            console.log(`  · [${f.slot}] ${winnerName}${method && f.actualOutcome.winnerSide !== "DRAW" ? ` by ${method}` : ""}`);
        }
        console.log(`\nResolved at: ${after.resolvedAt?.toISOString?.() || after.resolvedAt}`);
        console.log("\nReload the Events tab — the multi-fight result overlay should fire if you predicted any fights.");
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
