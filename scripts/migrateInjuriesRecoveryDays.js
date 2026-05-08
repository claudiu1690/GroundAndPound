/**
 * Migration: convert legacy injury fields for the Hospital feature.
 *
 * For every Fighter with active injuries:
 *   - Rename `recoverySessionsLeft` → `recoveryDaysLeft` (1:1 numeric copy).
 *   - Set `recoveryLastTickAt = sustainedAt` so the daily heal tick has a baseline.
 *   - Backfill `recoverySkipIron` from injuryDefinitions for auto-heal injuries.
 *   - Backfill `docVisitIron` from injuryDefinitions for doctor-required injuries.
 *
 * Idempotent — re-running the script after success is a no-op.
 *
 * Run:  node scripts/migrateInjuriesRecoveryDays.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const { INJURY_TYPES } = require("../consts/injuryDefinitions");

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const fighters = await Fighter.find({ "injuries.0": { $exists: true } });
    console.log(`Found ${fighters.length} fighters with active injuries`);

    let touched = 0;
    let injuriesUpdated = 0;

    for (const fighter of fighters) {
        let changed = false;
        for (const inj of fighter.injuries) {
            const def = INJURY_TYPES[inj.type] || {};

            // 1. Rename recoverySessionsLeft → recoveryDaysLeft if not already migrated.
            if (inj.recoverySessionsLeft != null && (inj.recoveryDaysLeft == null || inj.recoveryDaysLeft === 0)) {
                inj.recoveryDaysLeft = inj.recoverySessionsLeft;
                inj.recoverySessionsLeft = undefined;
                changed = true;
            }

            // 2. Set recoveryLastTickAt baseline if missing and the injury is auto-healing.
            if (!inj.requiresDoctorVisit && inj.recoveryDaysLeft > 0 && !inj.recoveryLastTickAt) {
                inj.recoveryLastTickAt = inj.sustainedAt || new Date();
                changed = true;
            }

            // 3. Backfill recoverySkipIron for auto-heal injuries.
            if (!inj.requiresDoctorVisit && (!inj.recoverySkipIron || inj.recoverySkipIron === 0)) {
                if (def.recoverySkipIron) {
                    inj.recoverySkipIron = def.recoverySkipIron;
                    changed = true;
                }
            }

            // 4. Backfill docVisitIron for doctor-required injuries.
            if (inj.requiresDoctorVisit && (!inj.docVisitIron || inj.docVisitIron === 0)) {
                if (def.docVisitIron) {
                    inj.docVisitIron = def.docVisitIron;
                    changed = true;
                }
            }

            if (changed) injuriesUpdated += 1;
        }
        if (changed) {
            await fighter.save();
            touched += 1;
        }
    }

    console.log(`Migrated: ${touched} fighter(s); updated ${injuriesUpdated} injury record(s).`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
