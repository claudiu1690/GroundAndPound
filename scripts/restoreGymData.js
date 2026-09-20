/**
 * GYM DATA RESTORE — puts back exactly what scripts/wipeGymData.js removed.
 *
 * This is the rollback half of the wipe, and it is the ONLY reason the wipe is safe to run.
 * It reads the backup file the wipe fsynced before its first write and restores, per fighter:
 * `gymRanks`, `gymPerks`, `activeGymId`, `activeGymPaidUntil`, and every removed
 * `badgesEarned` entry (with its original `earnedAt` / `context` / `seen`).
 *
 * ⚠️ IT RESTORES, IT DOES NOT MERGE. `gymRanks` / `gymPerks` / `activeGym*` are $set back to
 * their recorded values, so anything written to those fields AFTER the wipe is overwritten.
 * Badges are the exception: they are re-added with $addToSet keyed on badgeId, so a badge the
 * player earned after the wipe is never duplicated or clobbered.
 *
 * Usage:
 *   node scripts/restoreGymData.js --from=./out/gym-backup.json            # DRY RUN
 *   node scripts/restoreGymData.js --from=./out/gym-backup.json --commit
 */
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const config = require("../config");

const Fighter = require("../models/fighterModel");
const { ALL_GYM_PERKS, ALL_GYM_BADGES } = require("./wipeGymData");

function parseArgs(argv) {
    const args = { commit: false, from: null };
    for (const raw of argv.slice(2)) {
        if (raw === "--commit") { args.commit = true; continue; }
        const m = /^--from=(.*)$/.exec(raw);
        if (m) { args.from = m[1]; continue; }
        console.error(`Unknown argument "${raw}"`); process.exit(2);
    }
    if (!args.from) { console.error("\n  ✖ --from=<backup path> is required.\n"); process.exit(2); }
    return args;
}

async function main() {
    const args = parseArgs(process.argv);
    const file = path.resolve(args.from);
    if (!fs.existsSync(file)) { console.error(`\n  ✖ backup not found: ${file}\n`); process.exit(2); }

    const backup = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(backup.rows) ? backup.rows : [];

    console.log("");
    console.log("═".repeat(74));
    console.log(args.commit ? "  GYM DATA RESTORE — COMMIT MODE" : "  GYM DATA RESTORE — DRY RUN (default)");
    console.log(`  backup   : ${file}`);
    console.log(`  taken    : ${backup.takenAt}  (committed=${backup.committed})`);
    console.log(`  taken on : ${backup.target}`);
    console.log(`  TARGET   : ${config.database.url.replace(/\/\/[^@]*@/, "//<redacted>@")}`);
    console.log("═".repeat(74));

    await mongoose.connect(config.database.url, config.database.options);

    let restored = 0, missing = 0, failed = 0, badgesReadded = 0;
    for (const row of rows) {
        const exists = await Fighter.exists({ _id: row._id });
        if (!exists) { missing += 1; continue; }

        // Only the gym badges this run actually removed need re-adding.
        const toReadd = (row.badgesEarned || []).filter(
            (b) => ALL_GYM_BADGES.has(b.badgeId) && !(row.after.badgeIds || []).includes(b.badgeId)
        );

        if (!args.commit) { restored += 1; badgesReadded += toReadd.length; continue; }

        try {
            await Fighter.updateOne({ _id: row._id }, {
                $set: {
                    gymRanks: row.gymRanks || {},
                    gymPerks: row.gymPerks || [],
                    activeGymId: row.activeGymId || null,
                    activeGymPaidUntil: row.activeGymPaidUntil || null,
                },
            });
            for (const b of toReadd) {
                // $addToSet on the whole subdoc would re-add a near-duplicate, so guard on the
                // badgeId in the FILTER instead — a badge re-earned since the wipe is left alone.
                const res = await Fighter.updateOne(
                    { _id: row._id, "badgesEarned.badgeId": { $ne: b.badgeId } },
                    { $push: { badgesEarned: { badgeId: b.badgeId, earnedAt: b.earnedAt, context: b.context ?? null, seen: b.seen !== false } } }
                );
                if (res.modifiedCount === 1) badgesReadded += 1;
            }
            restored += 1;
        } catch (err) {
            failed += 1;
            console.error(`  [ERR] fighter ${row._id}: ${err.message}`);
        }
    }

    console.log("\n" + "─".repeat(74));
    console.log(args.commit ? "  RESULT (COMMITTED)" : "  RESULT (DRY RUN — nothing written)");
    console.log("─".repeat(74));
    console.log(`  fighters in backup ....... ${rows.length}`);
    console.log(`  ${args.commit ? "restored ................." : "would restore ..........."} ${restored}`);
    console.log(`  badges re-added .......... ${badgesReadded}`);
    console.log(`  no longer exist .......... ${missing}`);
    console.log(`  failed ................... ${failed}`);
    if (!args.commit) console.log("\n  DRY RUN — re-run with --commit to apply.");
    console.log("");

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch(async (err) => {
        console.error("\n[restoreGymData] FAILED:", err);
        try { await mongoose.disconnect(); } catch (_) { /* already down */ }
        process.exit(1);
    });
}
