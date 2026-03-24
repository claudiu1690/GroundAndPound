/**
 * Seed script: creates one T1 gym and Amateur opponents per weight class.
 * Each opponent gets a random full name (first + last, optional nickname) and a random Style with style-based stats.
 * Run: node scripts/seedOpponentsAndGym.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const Gym = require("../models/gymModel");
const Opponent = require("../models/opponentModel");
const { WEIGHT_CLASSES, STYLES } = require("../consts/gameConstants");
const { generateOpponentName } = require("../utils/opponentNames");
const { buildOpponentStatsFromStyle } = require("../utils/opponentStats");
const { calculateOverall } = require("../utils/overallRating");

const OPPONENTS_PER_WEIGHT_CLASS = 10;
const REGIONAL_PRO_TIERS = ["Regional Pro"];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const existingGym = await Gym.findOne({ tier: "T1" });
    if (!existingGym) {
        await Gym.create({
            name: "Local Fight Club",
            tier: "T1",
            specialtyStats: [],
            monthlyIron: 0
        });
        console.log("Created gym: Local Fight Club (T1)");
    } else {
        console.log("T1 gym already exists:", existingGym.name);
    }

    const styleKeys = Object.keys(STYLES);

    for (const wc of WEIGHT_CLASSES) {
        const count = await Opponent.countDocuments({ weightClass: wc, promotionTier: "Amateur" });
        if (count >= OPPONENTS_PER_WEIGHT_CLASS) {
            console.log(`Amateur opponents for ${wc}: ${count} already exist`);
            continue;
        }

        const toCreate = OPPONENTS_PER_WEIGHT_CLASS - count;
        for (let i = 0; i < toCreate; i++) {
            const { name, nickname } = generateOpponentName(true);
            const style = pickRandom(styleKeys);
            const stats = buildOpponentStatsFromStyle(style);
            await Opponent.create({
                name,
                nickname,
                weightClass: wc,
                style,
                promotionTier: "Amateur",
                overallRating: stats.overallRating,
                str: stats.str,
                spd: stats.spd,
                leg: stats.leg,
                wre: stats.wre,
                gnd: stats.gnd,
                sub: stats.sub,
                chn: stats.chn,
                fiq: stats.fiq,
                record: { wins: 0, losses: 0, draws: 0 }
            });
        }
        console.log(`Created ${toCreate} Amateur opponents for ${wc} (random names & styles)`);
    }

    // Regional Pro (and future tiers): fight offers require opponents with matching promotionTier.
    for (const promoTier of REGIONAL_PRO_TIERS) {
        for (const wc of WEIGHT_CLASSES) {
            const count = await Opponent.countDocuments({ weightClass: wc, promotionTier: promoTier });
            if (count >= OPPONENTS_PER_WEIGHT_CLASS) {
                console.log(`${promoTier} opponents for ${wc}: ${count} already exist`);
                continue;
            }
            const toCreate = OPPONENTS_PER_WEIGHT_CLASS - count;
            for (let i = 0; i < toCreate; i++) {
                const { name, nickname } = generateOpponentName(true);
                const style = pickRandom(styleKeys);
                const base = buildOpponentStatsFromStyle(style);
                const targetOvr = 28 + Math.floor(Math.random() * 21);
                const scale = targetOvr / Math.max(1, base.overallRating);
                const scaled = { ...base };
                ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"].forEach((k) => {
                    scaled[k] = Math.min(100, Math.max(1, Math.round(scaled[k] * scale)));
                });
                scaled.overallRating = calculateOverall({ ...scaled, style });
                await Opponent.create({
                    name,
                    nickname,
                    weightClass: wc,
                    style,
                    promotionTier: promoTier,
                    overallRating: scaled.overallRating,
                    str: scaled.str,
                    spd: scaled.spd,
                    leg: scaled.leg,
                    wre: scaled.wre,
                    gnd: scaled.gnd,
                    sub: scaled.sub,
                    chn: scaled.chn,
                    fiq: scaled.fiq,
                    record: { wins: 0, losses: 0, draws: 0 },
                });
            }
            console.log(`Created ${toCreate} ${promoTier} opponents for ${wc}`);
        }
    }

    await mongoose.disconnect();
    console.log("Done.");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
