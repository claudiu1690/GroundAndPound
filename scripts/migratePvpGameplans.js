/**
 * Migration: PvP gameplans 3 → 5 approaches.
 *
 * The PvP defense gameplan set was redesigned from { aggressive, balanced, counter } to
 * { striking, wrestling, submission, counter, balanced }. The retired "aggressive" plan
 * maps to the new "striking" plan (str/spd-forward pressure). This script rewrites every
 * PVPRecord whose stored defenseGameplan is still "aggressive".
 *
 * Scope:
 *   - PVPRecord.defenseGameplan: "aggressive" → "striking".
 *   - PVPFight rows are NOT migrated — those store the actual gameplan PLAYED in a historical
 *     bout and must keep their real value (the model enum tolerates the legacy key on read).
 *
 * Idempotent: a re-run matches zero "aggressive" records and reports 0 modified.
 *
 * Manual only — NOT auto-run by any scheduler/boot path.
 *
 * Run: node scripts/migratePvpGameplans.js
 */
const mongoose = require("mongoose");
const connectDB = require("../modules/dbConnect");
const PVPRecord = require("../models/pvpRecordModel");

async function run() {
    await connectDB();

    const before = await PVPRecord.countDocuments({ defenseGameplan: "aggressive" });
    console.log(`PVPRecords with legacy defenseGameplan "aggressive": ${before}`);

    const res = await PVPRecord.updateMany(
        { defenseGameplan: "aggressive" },
        { $set: { defenseGameplan: "striking" } }
    );
    const modified = res.modifiedCount ?? res.nModified ?? 0;
    console.log(`Migrated ${modified} PVPRecord(s): "aggressive" → "striking".`);

    await mongoose.disconnect();
    console.log("Done.");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
