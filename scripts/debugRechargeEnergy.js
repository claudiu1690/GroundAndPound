/**
 * DEBUG: refill a fighter's energy to max (Redis + Mongo snapshot).
 *
 * Usage:
 *   node scripts/debugRechargeEnergy.js <fighterObjectId>
 *
 * Allowed when NODE_ENV is not production, or when DEBUG_ALLOW_ENERGY_RECHARGE=1.
 */
const mongoose = require("mongoose");
const config = require("../config");
const fighterService = require("../services/fighterService");
const { redis } = require("../lib/redis");

function isAllowed() {
    return process.env.NODE_ENV !== "production" || process.env.DEBUG_ALLOW_ENERGY_RECHARGE === "1";
}

async function main() {
    if (!isAllowed()) {
        console.error("Refused: set NODE_ENV!=production or DEBUG_ALLOW_ENERGY_RECHARGE=1");
        process.exit(1);
    }

    const id = process.argv[2];
    if (!id) {
        console.error("Usage: node scripts/debugRechargeEnergy.js <fighterObjectId>");
        process.exit(1);
    }

    await mongoose.connect(config.database.url, config.database.options);
    try {
        const fighter = await fighterService.debugRefillEnergyToMax(id);
        console.log("Energy refilled:", fighter.energy);
    } finally {
        await mongoose.disconnect();
        await redis.quit();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
