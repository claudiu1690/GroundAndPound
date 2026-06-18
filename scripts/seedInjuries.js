/**
 * Seed a showcase set of active injuries on the PvP test account so the Hospital
 * body map renders populated for visual calibration. Idempotent: reverses any
 * existing injuries' stat effects, clears them, then applies a fixed set spanning
 * head / face / ribcage / hand / knee across both severities and columns.
 *
 *   node scripts/seedInjuries.js              # default showcase set
 *   node scripts/seedInjuries.js clear        # remove all injuries
 *
 * Targets EMAIL below (the OVR-45 test account from seedTestAccount.js).
 */
const mongoose = require("mongoose");
const config = require("../config");
const User = require("../models/userModel");
const Fighter = require("../models/fighterModel");
const { buildInjury, applyInjuryToFighter, reverseInjuryFromFighter } = require("../utils/injuryUtils");

const EMAIL = "pvp@test.com";
// Spread across the figure: head, ribcage, hand, knee (+ face), both severities.
const SHOWCASE = ["concussion", "bruised_rib", "broken_hand", "torn_ligament", "broken_nose"];

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log(`Connected → ${mongoose.connection.name}`);

    const user = await User.findOne({ email: EMAIL });
    if (!user || !user.fighterId) {
        console.error(`No test fighter for ${EMAIL} — run scripts/seedTestAccount.js first.`);
        await mongoose.disconnect();
        return;
    }
    const fighter = await Fighter.findById(user.fighterId);

    // Reverse + clear any existing injuries so stat effects don't accumulate.
    for (const inj of fighter.injuries || []) reverseInjuryFromFighter(fighter, inj);
    fighter.injuries = [];

    const clearOnly = process.argv[2] === "clear";
    if (!clearOnly) {
        for (const key of SHOWCASE) {
            const inj = buildInjury(key);
            if (!inj) { console.warn(`  unknown injury key: ${key}`); continue; }
            applyInjuryToFighter(fighter, inj);
            fighter.injuries.push(inj);
        }
    }
    fighter.markModified("injuries");
    await fighter.save();

    console.log(clearOnly
        ? "Cleared all injuries."
        : `Applied ${fighter.injuries.length} injuries: ${fighter.injuries.map((i) => i.label).join(", ")}.`);
    await mongoose.disconnect();
    console.log("Done.");
}

run().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
