/**
 * GYM RETIREMENT COMPENSATION — pays every player the 1.6 goodwill grant.
 *
 * Ten specialty gyms and the free gym closed in 1.6, and the changelog promised that everyone
 * affected would be compensated directly. This is that payment: 3 Energy Drinks per fighter.
 *
 * ⚠️ THIS SCRIPT WRITES FIGHTER DOCUMENTS (inventory.energyDrinks only). Nothing else on the
 * fighter is touched. It also writes one `compensations` row per fighter and one career-feed
 * entry per paid fighter.
 *
 * SAFE TO RE-RUN. The `{fighterId, campaign}` unique index means a fighter can be paid once and
 * only once; a second run reports them as already paid and writes nothing. A run interrupted
 * halfway can simply be run again, including a run that died between claiming and paying.
 *
 * WHEN TO RUN IT — LAST, after the wipe:
 *     1. flip GYMS_RETIRED=true
 *     2. node scripts/wipeGymData.js --commit --backup=<path>
 *     3. node scripts/grantGymRetirementCompensation.js --commit     <-- this script
 *
 * ⚠️ `migrateFightersToHomeCamp.js` is NOT part of this sequence. GDD §6.22 records the owner
 * decision: a clean break, no conversion of gym progress, compensated out of band — which is
 * what this script pays. That backfill exists only to give a camp to players who never opened
 * the screen, and running it mid-cutover would convert gym history the wipe is about to delete.
 *
 * Running this before the wipe is harmless but pays people before they have lost anything,
 * which makes the feed note read as a non-sequitur.
 *
 * Usage:
 *   node scripts/grantGymRetirementCompensation.js                # DRY RUN (the default)
 *   node scripts/grantGymRetirementCompensation.js --commit
 *   node scripts/grantGymRetirementCompensation.js --commit --limit=500
 *
 * Connects via ../config, so it honours the same LOCAL_MODE / USE_ATLAS switch as the app.
 * The resolved target is printed in full before anything happens — READ IT.
 */
const mongoose = require("mongoose");
const config = require("../config");

const Fighter = require("../models/fighterModel");
const Compensation = require("../models/compensationModel");
const compensationService = require("../services/compensationService");
const { SOFT_CAP } = require("../consts/shopConfig");

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const VERBOSE = args.includes("--verbose");
const LIMIT = (() => {
    const a = args.find((x) => x.startsWith("--limit="));
    return a ? Math.max(0, parseInt(a.split("=")[1], 10) || 0) : 0;
})();

const { GYM_RETIREMENT_CAMPAIGN, GYM_RETIREMENT_DRINKS } = compensationService;

// Bots are not players and have no inventory anyone will ever see. Same selector the gym wipe
// uses, so the two scripts always agree on who counts as a real fighter.
const SELECTOR = { isPvpBot: { $ne: true } };

function maskUrl(u) {
    return String(u).replace(/\/\/([^:/@]+):[^@]+@/, "//$1:***@");
}

(async () => {
    const uri = config.database.url;
    const remote = uri.startsWith("mongodb+srv://");

    console.log("─".repeat(72));
    console.log(`  CAMPAIGN : ${GYM_RETIREMENT_CAMPAIGN}`);
    console.log(`  PAYS     : ${GYM_RETIREMENT_DRINKS} Energy Drinks per fighter (capped at ${SOFT_CAP} total)`);
    console.log(`  TARGET   : ${remote ? "!! REMOTE !!" : "local"} → ${maskUrl(uri)}`);
    console.log(`  MODE     : ${COMMIT ? "COMMIT (writes)" : "DRY RUN (no writes)"}`);
    if (LIMIT) console.log(`  LIMIT    : ${LIMIT}`);
    console.log("─".repeat(72));

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

    const total = await Fighter.countDocuments(SELECTOR);
    const alreadyPaid = await Compensation.countDocuments({ campaign: GYM_RETIREMENT_CAMPAIGN, grantedAt: { $ne: null } });
    const claimedNotPaid = await Compensation.countDocuments({ campaign: GYM_RETIREMENT_CAMPAIGN, grantedAt: null });

    console.log(`fighters in scope .......... ${total}`);
    console.log(`already paid ............... ${alreadyPaid}`);
    if (claimedNotPaid) console.log(`claimed but unpaid ......... ${claimedNotPaid}  (interrupted run — this pass will finish them)`);
    console.log(`outstanding ................ ${Math.max(0, total - alreadyPaid)}`);

    if (!COMMIT) {
        console.log("\nDRY RUN — nothing was written. Re-run with --commit to pay.");
        await mongoose.disconnect();
        return;
    }

    const stats = { paid: 0, drinks: 0, already: 0, capped: 0, missing: 0, errors: 0 };
    const cursor = Fighter.find(SELECTOR).select("_id").sort({ _id: 1 }).lean().cursor({ batchSize: 500 });

    let seen = 0;
    for await (const f of cursor) {
        if (LIMIT && seen >= LIMIT) break;
        seen++;
        try {
            const r = await compensationService.grantGymRetirement(f._id);
            if (r.status === "already_granted") stats.already++;
            else if (r.status === "fighter_not_found") stats.missing++;
            else {
                stats.paid++;
                stats.drinks += r.granted;
                if (r.status === "capped") stats.capped++;
                if (VERBOSE) console.log(`  paid ${String(f._id)} → ${r.granted}${r.status === "capped" ? " (capped)" : ""}`);
            }
        } catch (err) {
            stats.errors++;
            console.error(`  ERROR ${String(f._id)}: ${err.message}`);
        }
        if (seen % 500 === 0) console.log(`  ...${seen} scanned`);
    }

    console.log("\n─".repeat(1) + "─".repeat(71));
    console.log(`  scanned ............ ${seen}`);
    console.log(`  paid ............... ${stats.paid}  (${stats.drinks} drinks total)`);
    console.log(`  of those, capped ... ${stats.capped}  (were at/near the ${SOFT_CAP} cap, got fewer)`);
    console.log(`  already paid ....... ${stats.already}`);
    if (stats.missing) console.log(`  vanished mid-run ... ${stats.missing}`);
    console.log(`  errors ............. ${stats.errors}`);
    console.log("─".repeat(72));
    if (stats.errors) console.log("Some fighters errored. Re-run — paid fighters are skipped, only the failures retry.");

    await mongoose.disconnect();
    process.exitCode = stats.errors ? 1 : 0;
})().catch((err) => {
    console.error("fatal:", err.message);
    process.exit(1);
});
