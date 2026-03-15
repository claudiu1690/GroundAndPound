const { differenceInMinutes } = require("date-fns");
const Fighter = require("../models/fighterModel");
const Gym = require("../models/gymModel");
const { STYLES, BACKSTORIES, ENERGY } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");
const { xpRequiredForNextPoint } = require("../utils/statProgression");

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const STAT_NAMES = ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"];
const STAT_TO_XP = { str: "strXp", spd: "spdXp", leg: "legXp", wre: "wreXp", gnd: "gndXp", sub: "subXp", chn: "chnXp", fiq: "fiqXp" };

/**
 * Build stat progress for API: value, xp, xpToNext per stat (for XP meters in frontend).
 */
function buildStatProgress(fighter) {
    const progress = {};
    for (const name of STAT_NAMES) {
        const key = name.toLowerCase();
        const value = fighter[key] != null ? fighter[key] : 10;
        const xp = fighter[STAT_TO_XP[key]] != null ? fighter[STAT_TO_XP[key]] : 0;
        const xpToNext = xpRequiredForNextPoint(value);
        progress[name] = { value, xp, xpToNext: xpToNext ?? null };
    }
    return progress;
}

/**
 * Build starting stats from style and optional backstory.
 */
function buildStartingStats(style, backstory) {
    const start = STYLES[style] && STYLES[style].start ? { ...STYLES[style].start } : {};
    const stats = {};
    for (const s of STAT_NAMES) {
        const key = s.toLowerCase();
        stats[key] = Math.min(100, Math.max(1, start[s] || 10));
    }
    if (backstory && BACKSTORIES[backstory]) {
        const bonus = BACKSTORIES[backstory];
        if (bonus.allStats) {
            STAT_KEYS.forEach(k => { stats[k] = Math.min(100, stats[k] + bonus.allStats); });
        }
        STAT_NAMES.forEach(s => {
            const key = s.toLowerCase();
            if (bonus[key] || bonus[s]) stats[key] = Math.min(100, stats[key] + (bonus[key] || bonus[s] || 0));
        });
        if (bonus.maxStaminaBonus) stats.maxStaminaBonus = bonus.maxStaminaBonus;
    }
    return stats;
}

/**
 * Create a new fighter (character creation). Applies style starting stats and backstory bonuses.
 */
async function createFighter(data) {
    const { firstName, lastName, nickname, weightClass, style, backstory } = data;
    if (!firstName || !lastName || !weightClass || !style) {
        throw new Error("firstName, lastName, weightClass, and style are required");
    }
    const built = buildStartingStats(style, backstory || null);
    const maxStamina = 100 + (built.maxStaminaBonus || 0);
    delete built.maxStaminaBonus;

    const fighter = new Fighter({
        firstName,
        lastName,
        nickname: nickname || null,
        weightClass,
        style,
        backstory: backstory || null,
        ...built,
        maxStamina,
        stamina: 100,
        health: 100,
        energy: ENERGY.max,
        energyUpdatedAt: new Date(),
        iron: 0,
        notoriety: 0,
        promotionTier: "Amateur",
        overallRating: 14
    });
    fighter.overallRating = calculateOverall(fighter);
    await fighter.save();
    return fighter;
}

async function listFighters(limit = 50) {
    const fighters = await Fighter.find({}).limit(limit).select("firstName lastName nickname weightClass style overallRating energy record").lean();
    return fighters;
}

async function getFighterById(id) {
    const fighter = await Fighter.findById(id).populate("gymId");
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    return fighter;
}

async function updateFighter(id, data) {
    const fighter = await Fighter.findByIdAndUpdate(id, data, { new: true });
    if (!fighter) throw new Error("Fighter not found");
    fighter.overallRating = calculateOverall(fighter);
    await fighter.save();
    return fighter;
}

/**
 * Reconcile energy from elapsed time (GDD: 1 Energy per minute, server-side).
 * Call before reading or using energy. Updates fighter in DB if energy changed.
 * @param {Object} fighter - Mongoose document with energy, energyUpdatedAt
 * @returns {Promise<Object>} Updated fighter
 */
async function reconcileEnergy(fighter) {
    const now = new Date();
    const updatedAt = fighter.energyUpdatedAt ? new Date(fighter.energyUpdatedAt) : now;
    const minutesPassed = differenceInMinutes(now, updatedAt);
    if (minutesPassed <= 0 || fighter.energy >= ENERGY.max) return fighter;
    const maxAdd = ENERGY.max - fighter.energy;
    const toAdd = Math.min(minutesPassed, maxAdd);
    fighter.energy += toAdd;
    fighter.energyUpdatedAt = now;
    await fighter.save();
    return fighter;
}

/**
 * Reconcile energy for all fighters under cap (for cron: makes energy "tick" in DB while user is idle).
 * Uses same time-based logic as reconcileEnergy; safe to run every minute.
 */
async function reconcileAllFightersEnergy() {
    const fighters = await Fighter.find({ energy: { $lt: ENERGY.max } }).limit(5000);
    let updated = 0;
    for (const f of fighters) {
        const before = f.energy;
        await reconcileEnergy(f);
        if (f.energy !== before) updated++;
    }
    return updated;
}

/**
 * Replenish energy for all fighters (legacy/bulk; prefer time-based reconcile).
 */
async function replenishEnergyAll(amount = 1) {
    const updated = await Fighter.updateMany(
        { energy: { $lt: ENERGY.max } },
        { $inc: { energy: amount }, $min: { energy: ENERGY.max } }
    );
    return updated;
}

/**
 * Deduct energy from a fighter. Throws if not enough. Reconciles energy first (1/min since last update).
 */
async function deductEnergy(fighterId, amount) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    if (fighter.energy < amount) throw new Error("Not enough energy");
    fighter.energy -= amount;
    fighter.energyUpdatedAt = new Date();
    await fighter.save();
    return fighter;
}

/**
 * GDD 8.9: Doctor visit — spend energy + iron to clear an injury that requires medical attention.
 * Instantly heals the injury and reverses its stat penalties.
 */
async function doctorVisit(fighterId, injuryType) {
    const { reverseInjuryFromFighter } = require("../utils/injuryUtils");
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);

    const idx = (fighter.injuries || []).findIndex(
        (inj) => inj.type === injuryType && inj.requiresDoctorVisit && !inj.doctorVisited
    );
    if (idx === -1) throw new Error("Injury not found or does not require a doctor visit");

    const inj = fighter.injuries[idx];
    if (fighter.energy < inj.docVisitEnergy) {
        throw new Error(`Not enough energy (doctor visit costs ${inj.docVisitEnergy})`);
    }
    if (fighter.iron < inj.docVisitIron) {
        throw new Error(`Not enough Iron (doctor visit costs ${inj.docVisitIron} ⊗)`);
    }

    fighter.energy -= inj.docVisitEnergy;
    fighter.energyUpdatedAt = new Date();
    fighter.iron -= inj.docVisitIron;
    reverseInjuryFromFighter(fighter, inj);
    fighter.injuries.splice(idx, 1);
    await fighter.save();
    return fighter;
}

/**
 * GDD 8.5: Mental Reset — spend 5 Energy to clear mentalResetRequired after 3 consecutive losses.
 */
const MENTAL_RESET_ENERGY = 5;
async function mentalReset(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    if (!fighter.mentalResetRequired) throw new Error("Mental Reset is not required");
    if (fighter.energy < MENTAL_RESET_ENERGY) throw new Error(`Not enough energy (Mental Reset costs ${MENTAL_RESET_ENERGY})`);
    fighter.energy -= MENTAL_RESET_ENERGY;
    fighter.energyUpdatedAt = new Date();
    fighter.mentalResetRequired = false;
    fighter.consecutiveLosses = 0;
    await fighter.save();
    return fighter;
}

/**
 * Pay monthly membership fee for a gym.
 * Sets paidUntil = now + 30 days for that gym in the fighter's gymMemberships array.
 */
async function payGymMembership(fighterId, gymId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const gym = await Gym.findById(gymId);
    if (!gym) throw new Error("Gym not found");

    if (!gym.monthlyIron || gym.monthlyIron === 0) {
        throw new Error("This gym has no membership fee");
    }
    if (fighter.iron < gym.monthlyIron) {
        throw new Error(`Not enough Iron — need ${gym.monthlyIron} ⊗`);
    }

    fighter.iron -= gym.monthlyIron;

    const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    if (!fighter.gymMemberships) fighter.gymMemberships = [];
    const idx = fighter.gymMemberships.findIndex((m) => String(m.gymId) === String(gymId));
    if (idx >= 0) {
        fighter.gymMemberships[idx].paidUntil = paidUntil;
    } else {
        fighter.gymMemberships.push({ gymId, paidUntil });
    }
    await fighter.save();
    return fighter;
}

/** GDD: Rest/Recovery — spend 3 Energy to restore 25 Health and 25 Stamina (capped at max). */
const REST_ENERGY_COST = 3;
const REST_HEALTH = 25;
const REST_STAMINA = 25;

async function rest(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    if (fighter.energy < REST_ENERGY_COST) throw new Error("Not enough energy (Rest costs 3)");
    fighter.energy -= REST_ENERGY_COST;
    fighter.energyUpdatedAt = new Date();
    const maxStamina = fighter.maxStamina ?? 100;
    fighter.health = Math.min(100, (fighter.health ?? 100) + REST_HEALTH);
    fighter.stamina = Math.min(maxStamina, (fighter.stamina ?? maxStamina) + REST_STAMINA);
    await fighter.save();
    return fighter;
}

module.exports = {
    createFighter,
    listFighters,
    getFighterById,
    updateFighter,
    reconcileEnergy,
    reconcileAllFightersEnergy,
    replenishEnergyAll,
    deductEnergy,
    rest,
    doctorVisit,
    mentalReset,
    payGymMembership,
    buildStartingStats,
    buildStatProgress
};
