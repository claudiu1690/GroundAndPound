/**
 * DEBUG: reset daily fight limit state for one fighter account.
 *
 * Usage:
 *   node scripts/debugResetDailyFightCap.js --fighterId <fighterObjectId>
 *   node scripts/debugResetDailyFightCap.js --email <user@email.com>
 *
 * Allowed when NODE_ENV is not production, or when DEBUG_ALLOW_CAP_RESET=1.
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const User = require("../models/userModel");

function isAllowed() {
    return process.env.NODE_ENV !== "production" || process.env.DEBUG_ALLOW_CAP_RESET === "1";
}

function getArgValue(flag) {
    const idx = process.argv.indexOf(flag);
    if (idx === -1) return null;
    return process.argv[idx + 1] || null;
}

async function resolveFighterId() {
    const fighterId = getArgValue("--fighterId");
    if (fighterId) return fighterId;

    const email = getArgValue("--email");
    if (!email) return null;

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).lean();
    if (!user || !user.fighterId) return null;
    return String(user.fighterId);
}

async function main() {
    if (!isAllowed()) {
        console.error("Refused: set NODE_ENV!=production or DEBUG_ALLOW_CAP_RESET=1");
        process.exit(1);
    }

    await mongoose.connect(config.database.url, config.database.options);
    try {
        const fighterId = await resolveFighterId();
        if (!fighterId) {
            console.error("Usage: node scripts/debugResetDailyFightCap.js --fighterId <id> OR --email <email>");
            process.exit(1);
        }

        const fighter = await Fighter.findByIdAndUpdate(
            fighterId,
            {
                fightsToday: 0,
                lastFightDate: null,
                fightDayKey: null,
                fightsTodayByTier: {},
            },
            { new: true }
        );
        if (!fighter) {
            console.error("Fighter not found.");
            process.exit(1);
        }

        console.log(`Daily cap reset for ${fighter.firstName} ${fighter.lastName} (${fighter._id}).`);
        console.log("fightsToday:", fighter.fightsToday, "| lastFightDate:", fighter.lastFightDate);
        console.log("fightDayKey:", fighter.fightDayKey, "| fightsTodayByTier:", fighter.fightsTodayByTier);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
