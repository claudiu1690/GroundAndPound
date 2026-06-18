/**
 * Seed a TEST ACCOUNT for PvP testing — one login-able user + a fighter at OVR 45
 * with the Proving Ground unlocked. Builds the fighter through the real creation
 * service (so every invariant holds) and then tunes stats/record/tier.
 *
 * Idempotent + SCOPED: only touches the single test email below — it removes a
 * prior test user + its linked fighter, then recreates. No other data is altered.
 * (The active Open season + ladder bots already exist in the DB.)
 *
 * Usage: node scripts/seedTestAccount.js
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("../config");
const User = require("../models/userModel");
const Fighter = require("../models/fighterModel");
const fighterService = require("../services/fighterService");
const { calculateOverall } = require("../utils/overallRating");

const EMAIL = "pvp@test.com";
const PASSWORD = "pvptest123";
const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log(`Connected → ${mongoose.connection.name}`);

    // ── Idempotent cleanup: only this test account ──
    const prior = await User.findOne({ email: EMAIL });
    if (prior) {
        if (prior.fighterId) await Fighter.deleteOne({ _id: prior.fighterId });
        await User.deleteOne({ _id: prior._id });
        console.log("Removed prior test account.");
    }

    // ── Create a valid fighter via the real path, then tune it ──
    const created = await fighterService.createFighter({
        firstName: "PVP",
        lastName: "Tester",
        nickname: "Lab Rat",
        weightClass: "Middleweight",
        style: "Boxer",
    });

    const fighter = await Fighter.findById(created._id);

    // OVR 45 exactly: OVR is a weighted average, so equal stats average to that value
    // regardless of style weighting.
    for (const s of STAT_KEYS) fighter[s] = 45;
    fighter.overallRating = calculateOverall(fighter);

    fighter.promotionTier = "National";              // OVR 45 = National threshold
    fighter.record = { ...(fighter.record || {}), wins: 3, losses: 1, draws: 0 };
    fighter.iron = 5000;
    fighter.health = 100;
    fighter.energy = {
        current: fighter.energy?.max ?? 100,
        max: fighter.energy?.max ?? 100,
        lastSyncedAt: new Date(),
    };
    fighter.tutorial = { ...(fighter.tutorial?.toObject?.() ?? fighter.tutorial ?? {}), completed: true, completed_at: new Date() };
    // Proving Ground unlocked, placement skipped (Open Season 1 behaviour).
    fighter.pvpOnboarding = {
        unlocked: true,
        placementComplete: true,
        placementWins: 0,
        placementFights: 0,
        shieldExpiresAt: null,
        firstSeasonComplete: false,
    };
    fighter.markModified("record");
    fighter.markModified("tutorial");
    fighter.markModified("pvpOnboarding");
    await fighter.save();

    // ── Create the login-able account (email pre-confirmed to skip verification) ──
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await User.create({
        email: EMAIL,
        passwordHash,
        emailConfirmed: true,
        fighterId: fighter._id,
    });
    fighter.userId = user._id;
    await fighter.save();

    console.log("\n========== TEST ACCOUNT READY ==========");
    console.log(`  Email:    ${EMAIL}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log(`  Fighter:  ${fighter.firstName} "${fighter.nickname}" ${fighter.lastName} (${fighter.weightClass}, ${fighter.style})`);
    console.log(`  OVR:      ${fighter.overallRating}   Tier: ${fighter.promotionTier}   Record: ${fighter.record.wins}-${fighter.record.losses}`);
    console.log(`  PvP:      unlocked — active Open season + ladder bots already present`);
    console.log("========================================\n");

    await mongoose.disconnect();
    console.log("Done.");
}

run().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
