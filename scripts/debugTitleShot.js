/**
 * DEBUG: Advance a fighter to be near a title shot.
 * Sets OVR above Regional Pro threshold, gives 2 wins in tier (1 away from title shot),
 * boosts stats to ~32 OVR range, sets pendingPromotion, full health/energy.
 *
 * Usage:
 *   node scripts/debugTitleShot.js <fighterObjectId>
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const { calculateOverall } = require("../utils/overallRating");

async function main() {
    const id = process.argv[2];
    if (!id) {
        console.error("Usage: node scripts/debugTitleShot.js <fighterObjectId>");
        process.exit(1);
    }

    await mongoose.connect(config.database.url, config.database.options);

    try {
        const fighter = await Fighter.findById(id);
        if (!fighter) {
            console.error("Fighter not found:", id);
            process.exit(1);
        }

        console.log("Before:");
        console.log(`  Name: ${fighter.firstName} ${fighter.lastName}`);
        console.log(`  Tier: ${fighter.promotionTier} | OVR: ${fighter.overallRating}`);
        console.log(`  Record: ${fighter.record.wins}W-${fighter.record.losses}L-${fighter.record.draws}D`);
        console.log(`  winsInCurrentTier: ${fighter.winsInCurrentTier ?? 0}`);
        console.log(`  pendingPromotion: ${fighter.pendingPromotion ?? "none"}`);
        console.log(`  titleShotCooldown: ${fighter.titleShotCooldown ?? 0}`);

        // Tier requirements: OVR must exceed the NEXT tier's minOverall for pendingPromotion
        const TIER_OVR_TARGET = {
            "Amateur":        { targetStat: 38, promoteTo: "Regional Pro", autoPromote: true },
            "Regional Pro":   { targetStat: 55, promoteTo: "National",     autoPromote: false },
            "National":       { targetStat: 65, promoteTo: "GCS Contender", autoPromote: false },
            "GCS Contender":  { targetStat: 68, promoteTo: "GCS",          autoPromote: true },
            "GCS":            { targetStat: 70, promoteTo: null,            autoPromote: false },
        };

        // Set tier to Regional Pro if still Amateur (skip the amateur grind)
        if (fighter.promotionTier === "Amateur") {
            fighter.promotionTier = "Regional Pro";
            console.log("  -> Promoted to Regional Pro");
        }

        const tierCfg = TIER_OVR_TARGET[fighter.promotionTier];
        const TARGET_STAT = tierCfg?.targetStat ?? 55;

        // Boost stats high enough that OVR exceeds the next tier's threshold
        const statKeys = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
        for (const k of statKeys) {
            if ((fighter[k] ?? 10) < TARGET_STAT) {
                fighter[k] = TARGET_STAT + Math.floor(Math.random() * 5);
            }
        }

        // Set 2 wins in current tier (1 more needed for title shot at 3)
        fighter.winsInCurrentTier = 2;

        // Set pendingPromotion for gated tiers
        if (tierCfg && tierCfg.promoteTo && !tierCfg.autoPromote) {
            fighter.pendingPromotion = tierCfg.promoteTo;
        }

        // Clear any cooldown
        fighter.titleShotCooldown = 0;

        // Give a decent record
        if (fighter.record.wins < 8) {
            fighter.record.wins = 8;
            fighter.record.koWins = 3;
            fighter.record.subWins = 2;
            fighter.record.decisionWins = 3;
        }
        if (fighter.record.losses < 2) {
            fighter.record.losses = 2;
        }

        // Full health, stamina, energy
        fighter.health = 100;
        fighter.stamina = fighter.maxStamina ?? 100;
        fighter.energy = { current: 100, max: 100, lastSyncedAt: new Date() };

        // Clear blocking states
        fighter.mentalResetRequired = false;
        fighter.consecutiveLosses = 0;
        fighter.acceptedFightId = null;

        // Recalculate OVR
        fighter.overallRating = calculateOverall(fighter);

        await fighter.save();

        console.log("\nAfter:");
        console.log(`  Tier: ${fighter.promotionTier} | OVR: ${fighter.overallRating}`);
        console.log(`  Record: ${fighter.record.wins}W-${fighter.record.losses}L-${fighter.record.draws}D`);
        console.log(`  winsInCurrentTier: ${fighter.winsInCurrentTier}`);
        console.log(`  pendingPromotion: ${fighter.pendingPromotion ?? "none"}`);
        console.log(`  titleShotCooldown: ${fighter.titleShotCooldown}`);
        console.log(`  Stats: STR ${fighter.str} SPD ${fighter.spd} LEG ${fighter.leg} WRE ${fighter.wre} GND ${fighter.gnd} SUB ${fighter.sub} CHN ${fighter.chn} FIQ ${fighter.fiq}`);
        console.log("\n  -> Win 1 more fight to unlock the title shot offer!");
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
