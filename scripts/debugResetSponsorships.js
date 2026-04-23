/**
 * DEBUG: reset a fighter's sponsorship state so contracts can be re-signed for testing.
 *
 * What it does by default:
 *   - Deletes every resolved (completed / broken / dropped / expired) Sponsorship
 *     record for the fighter.
 *   - Leaves ACTIVE contracts alone so mid-test state isn't clobbered.
 *   - Prints a summary of what was removed.
 *
 * Flags:
 *   --all        also delete ACTIVE contracts (full wipe for this fighter)
 *   --list       dry-run — print what would be affected, change nothing
 *
 * Usage:
 *   node scripts/debugResetSponsorships.js <fighterObjectId>
 *   node scripts/debugResetSponsorships.js <fighterObjectId> --all
 *   node scripts/debugResetSponsorships.js <fighterObjectId> --list
 *
 * Allowed when NODE_ENV is not production, or when DEBUG_ALLOW_SPONSOR_RESET=1.
 */
const mongoose = require("mongoose");
const config = require("../config");
const Sponsorship = require("../models/sponsorshipModel");

function isAllowed() {
    return process.env.NODE_ENV !== "production" || process.env.DEBUG_ALLOW_SPONSOR_RESET === "1";
}

async function main() {
    if (!isAllowed()) {
        console.error("Refused: set NODE_ENV!=production or DEBUG_ALLOW_SPONSOR_RESET=1");
        process.exit(1);
    }

    const id = process.argv[2];
    const flags = new Set(process.argv.slice(3));
    const wipeAll = flags.has("--all");
    const dryRun = flags.has("--list");

    if (!id) {
        console.error("Usage: node scripts/debugResetSponsorships.js <fighterObjectId> [--all] [--list]");
        process.exit(1);
    }
    if (!mongoose.isValidObjectId(id)) {
        console.error(`Not a valid ObjectId: ${id}`);
        process.exit(1);
    }

    await mongoose.connect(config.database.url, config.database.options);
    try {
        const query = { fighterId: id };
        if (!wipeAll) {
            query.status = { $in: ["completed", "broken", "dropped", "expired"] };
        }

        const docs = await Sponsorship.find(query)
            .select("sponsorId brand status resolvedAt createdAt totals")
            .sort({ createdAt: -1 })
            .lean();

        if (docs.length === 0) {
            console.log(`No ${wipeAll ? "" : "resolved "}sponsorship records found for fighter ${id}.`);
            return;
        }

        console.log(`Found ${docs.length} ${wipeAll ? "" : "resolved "}sponsorship record(s):`);
        for (const d of docs) {
            const earned = d.totals?.ironEarned ?? 0;
            const when = d.resolvedAt ? new Date(d.resolvedAt).toISOString() : "—";
            console.log(`  · ${d.brand.padEnd(22)} ${d.status.padEnd(10)}  resolved=${when}  earned=${earned}⊗`);
        }

        if (dryRun) {
            console.log("\n[--list] Dry run — no records deleted.");
            return;
        }

        const result = await Sponsorship.deleteMany(query);
        console.log(`\nDeleted ${result.deletedCount} sponsorship record(s).`);
        if (wipeAll) {
            console.log("(All contracts wiped — fighter is a clean slate.)");
        } else {
            console.log("(Active contracts were preserved.)");
        }
        console.log("\nReload the Contracts tab to see the refreshed offer pool.");
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
