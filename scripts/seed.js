/**
 * Populate DB from data/seed.json.
 * Usage: node scripts/seed.js [--reset]
 *   --reset  Clear Gym, Opponent (and demo fighter) collections before inserting.
 *
 * Run at start: npm run seed
 */
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const config = require("../config");
const Gym = require("../models/gymModel");
const Opponent = require("../models/opponentModel");
const Fighter = require("../models/fighterModel");
const fighterService = require("../services/fighterService");
const { WEIGHT_CLASSES } = require("../consts/gameConstants");

const SEED_PATH = path.join(__dirname, "..", "data", "seed.json");

function loadSeed() {
    const raw = fs.readFileSync(SEED_PATH, "utf8");
    return JSON.parse(raw);
}

async function run() {
    const reset = process.argv.includes("--reset");

    if (!fs.existsSync(SEED_PATH)) {
        console.error("Missing data/seed.json");
        process.exit(1);
    }

    const seed = loadSeed();
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    if (reset) {
        await Gym.deleteMany({});
        await Opponent.deleteMany({});
        if (seed.demoFighter) {
            await Fighter.deleteOne({
                firstName: seed.demoFighter.firstName,
                lastName: seed.demoFighter.lastName,
            }).catch(() => {});
        }
        console.log("Collections cleared (--reset)");
    }

    // ----- Gyms -----
    const gyms = seed.gyms || [];
    let firstT1GymId = null;
    for (const g of gyms) {
        const existing = await Gym.findOne({ name: g.name, tier: g.tier });
        if (existing) {
            if (g.tier === "T1") firstT1GymId = firstT1GymId || existing._id;
            console.log("Gym already exists:", g.name, g.tier);
            continue;
        }
        const created = await Gym.create({
            name: g.name,
            tier: g.tier,
            specialtyStats: g.specialtyStats || [],
            monthlyIron: g.monthlyIron ?? 0,
        });
        if (g.tier === "T1") firstT1GymId = firstT1GymId || created._id;
        console.log("Created gym:", created.name, created.tier);
    }
    if (gyms.length > 0 && !firstT1GymId) {
        const t1 = await Gym.findOne({ tier: "T1" });
        if (t1) firstT1GymId = t1._id;
    }

    // ----- Opponents -----
    const opponents = seed.opponents || [];
    let createdCount = 0;
    for (const o of opponents) {
        const weightClasses = o.weightClasses || (o.weightClass ? [o.weightClass] : WEIGHT_CLASSES);
        for (const wc of weightClasses) {
            const existing = await Opponent.findOne({
                name: o.name,
                weightClass: wc,
                promotionTier: o.promotionTier,
            });
            if (existing) continue;
            await Opponent.create({
                name: o.name,
                nickname: o.nickname ?? null,
                weightClass: wc,
                style: o.style,
                promotionTier: o.promotionTier,
                overallRating: o.overallRating,
                str: o.str,
                spd: o.spd,
                leg: o.leg,
                wre: o.wre,
                gnd: o.gnd,
                sub: o.sub,
                chn: o.chn,
                fiq: o.fiq,
                record: { wins: o.wins ?? 0, losses: o.losses ?? 0, draws: o.draws ?? 0 },
            });
            createdCount++;
        }
    }
    console.log("Opponents: created", createdCount, "(skipped duplicates)");

    // ----- Demo fighter (optional) -----
    if (seed.demoFighter && firstT1GymId) {
        const df = seed.demoFighter;
        let fighter = await Fighter.findOne({
            firstName: df.firstName,
            lastName: df.lastName,
        });
        if (!fighter) {
            fighter = await fighterService.createFighter({
                firstName: df.firstName,
                lastName: df.lastName,
                nickname: df.nickname ?? null,
                weightClass: df.weightClass,
                style: df.style,
                backstory: df.backstory ?? null,
            });
            fighter = await Fighter.findByIdAndUpdate(fighter._id, { gymId: firstT1GymId }, { new: true });
            console.log("Created demo fighter:", fighter.firstName, fighter.lastName, "(gym assigned)");
        } else {
            if (!fighter.gymId && firstT1GymId) {
                await Fighter.findByIdAndUpdate(fighter._id, { gymId: firstT1GymId });
                console.log("Assigned gym to existing demo fighter:", fighter.firstName, fighter.lastName);
            } else {
                console.log("Demo fighter already exists:", fighter.firstName, fighter.lastName);
            }
        }
    }

    await mongoose.disconnect();
    console.log("Seed done.");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
