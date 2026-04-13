/**
 * Generate ~200 opponents across all tiers and weight classes from data/names.json.
 * Programmatic stats based on tier OVR ranges + random style assignment.
 * Usage: node scripts/seedOpponents.js [--reset]
 *   --reset  Clear Opponent collection before inserting.
 */
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const config = require("../config");
const Opponent = require("../models/opponentModel");
const { WEIGHT_CLASSES, STYLES } = require("../consts/gameConstants");
const { ensureChampionsExist } = require("../services/championService");

const NAMES_PATH = path.join(__dirname, "..", "data", "names.json");
const STYLE_KEYS = Object.keys(STYLES);

// Distribution: how many names per tier
const TIER_DISTRIBUTION = [
    { tier: "Amateur",        count: 40, ovrMin: 12, ovrMax: 28 },
    { tier: "Regional Pro",   count: 60, ovrMin: 30, ovrMax: 48 },
    { tier: "National",       count: 50, ovrMin: 45, ovrMax: 65 },
    { tier: "GCS Contender",  count: 20, ovrMin: 60, ovrMax: 68 },
    { tier: "GCS",            count: 30, ovrMin: 65, ovrMax: 95 },
];

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function generateStats(style, targetOvr) {
    const styleDef = STYLES[style];
    const primary = styleDef.primary || [];
    const STAT_KEYS = ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"];
    const stats = {};

    // Generate stats that roughly produce the target OVR
    // Primary stats get higher values, off-stats lower
    for (const key of STAT_KEYS) {
        const isPrimary = primary.includes(key);
        const base = isPrimary
            ? targetOvr * 0.9 + randInt(-8, 8)
            : targetOvr * 0.5 + randInt(-6, 6);
        stats[key.toLowerCase()] = Math.max(5, Math.min(99, Math.round(base)));
    }
    return stats;
}

function generateFightHistory(tier, ovr) {
    const fights = [];
    const numFights = randInt(5, 12);
    // Higher tiers have better win rates
    const winRate = tier === "Amateur" ? 0.5 : tier === "GCS" ? 0.75 : 0.6;
    const methods = ["KO/TKO", "Submission", "Decision"];

    for (let i = 0; i < numFights; i++) {
        const isWin = Math.random() < winRate;
        fights.push({
            result: isWin ? "win" : "loss",
            method: methods[randInt(0, 2)],
            round: randInt(1, 3),
        });
    }
    return fights;
}

function buildRecord(fightHistory) {
    const wins = fightHistory.filter((f) => f.result === "win").length;
    const losses = fightHistory.filter((f) => f.result === "loss").length;
    return { wins, losses, draws: 0 };
}

async function run() {
    const reset = process.argv.includes("--reset");

    if (!fs.existsSync(NAMES_PATH)) {
        console.error("Missing data/names.json — run the names generator first.");
        process.exit(1);
    }

    const names = JSON.parse(fs.readFileSync(NAMES_PATH, "utf8"));
    console.log(`Loaded ${names.length} names`);

    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    if (reset) {
        await Opponent.deleteMany({});
        console.log("Opponent collection cleared (--reset)");
    }

    let nameIdx = 0;
    let created = 0;

    for (const tierDef of TIER_DISTRIBUTION) {
        for (let i = 0; i < tierDef.count && nameIdx < names.length; i++, nameIdx++) {
            const name = names[nameIdx];
            const fullName = `${name.firstName} ${name.lastName}`;
            const style = STYLE_KEYS[randInt(0, STYLE_KEYS.length - 1)];
            const ovr = randInt(tierDef.ovrMin, tierDef.ovrMax);
            const stats = generateStats(style, ovr);
            const fightHistory = generateFightHistory(tierDef.tier, ovr);
            const record = buildRecord(fightHistory);

            // Assign to a random weight class
            const wc = WEIGHT_CLASSES[randInt(0, WEIGHT_CLASSES.length - 1)];

            const existing = await Opponent.findOne({
                name: fullName,
                weightClass: wc,
                promotionTier: tierDef.tier,
            });
            if (existing) continue;

            await Opponent.create({
                name: fullName,
                nickname: name.nickname,
                weightClass: wc,
                style,
                promotionTier: tierDef.tier,
                overallRating: ovr,
                ...stats,
                record,
                fightHistory,
            });
            created++;
        }
        console.log(`  ${tierDef.tier}: assigned ${Math.min(tierDef.count, nameIdx)} names`);
    }

    console.log(`Created ${created} opponents total`);

    // Ensure every tier/weightClass has at least 4 opponents
    // If gaps exist, duplicate from same tier with different weight class
    for (const tierDef of TIER_DISTRIBUTION) {
        for (const wc of WEIGHT_CLASSES) {
            const count = await Opponent.countDocuments({
                promotionTier: tierDef.tier,
                weightClass: wc,
            });
            if (count < 4) {
                // Find opponents in this tier with different weight class
                const donors = await Opponent.find({
                    promotionTier: tierDef.tier,
                    weightClass: { $ne: wc },
                }).limit(4 - count).lean();

                for (const d of donors) {
                    const exists = await Opponent.findOne({
                        name: d.name, weightClass: wc, promotionTier: tierDef.tier,
                    });
                    if (exists) continue;
                    const { _id, __v, createdAt, updatedAt, ...rest } = d;
                    await Opponent.create({ ...rest, weightClass: wc });
                    created++;
                }
            }
        }
    }

    console.log(`Final total: ${await Opponent.countDocuments({})} opponents`);

    // Seed champions
    await ensureChampionsExist();
    console.log("Champions seeded.");

    await mongoose.disconnect();
    console.log("Seed opponents done.");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
