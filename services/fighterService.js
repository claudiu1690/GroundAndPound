const Fighter = require("../models/fighterModel");
const Gym = require("../models/gymModel");
const { STYLES, BACKSTORIES, ENERGY } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");
const { xpRequiredForNextPoint } = require("../utils/statProgression");
const notorietyService = require("./notorietyService");
const energyService = require("./energyService");

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const STAT_NAMES = ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"];
const STAT_TO_XP = { str: "strXp", spd: "spdXp", leg: "legXp", wre: "wreXp", gnd: "gndXp", sub: "subXp", chn: "chnXp", fiq: "fiqXp" };
const KEY_TO_STAT = { str: "STR", spd: "SPD", leg: "LEG", wre: "WRE", gnd: "GND", sub: "SUB", chn: "CHN", fiq: "FIQ" };

/**
 * Read a fighter's energy shape safely (supports legacy numeric energy).
 * @param {Object} fighter
 * @returns {{ current: number, max: number, lastSyncedAt: Date }}
 */
function energySnapshot(fighter) {
    if (fighter?.energy && typeof fighter.energy === "object") {
        return {
            current: Number.isFinite(fighter.energy.current) ? fighter.energy.current : ENERGY.max,
            max: Number.isFinite(fighter.energy.max) ? fighter.energy.max : ENERGY.max,
            lastSyncedAt: fighter.energy.lastSyncedAt || new Date(),
        };
    }
    if (Number.isFinite(fighter?.energy)) {
        return { current: fighter.energy, max: ENERGY.max, lastSyncedAt: new Date() };
    }
    return { current: ENERGY.max, max: ENERGY.max, lastSyncedAt: new Date() };
}

/**
 * Apply an energy snapshot to the fighter mongoose document.
 * @param {Object} fighter
 * @param {{ current: number, max: number }} snapshot
 */
function setEnergySnapshot(fighter, snapshot) {
    fighter.energy = {
        current: snapshot.current,
        max: snapshot.max,
        lastSyncedAt: new Date(),
    };
}

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
 * Stats that are currently injury-penalized (negative effect active).
 * Used by training UI/service to lock progression while injured.
 */
function getInjuryLockedStats(fighter) {
    const locked = new Set();
    for (const inj of fighter.injuries || []) {
        const effects = inj.appliedStatEffects || {};
        for (const [key, statName] of Object.entries(KEY_TO_STAT)) {
            if ((effects[key] || 0) < 0) locked.add(statName);
        }
    }
    return Array.from(locked);
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
        energy: { current: ENERGY.max, max: ENERGY.max, lastSyncedAt: new Date() },
        iron: 0,
        winStreak: 0,
        notoriety: {
            score: 0,
            peakTier: "UNKNOWN",
            isFrozen: false,
            lastEventAt: null,
            documentaryUsed: false,
            milestones: {},
            firstFinishPromoTiers: [],
        },
        promotionTier: "Amateur",
        overallRating: 14
    });
    fighter.overallRating = calculateOverall(fighter);
    await fighter.save();
    return getFighterById(fighter._id);
}

/**
 * List fighters for selection screens and admin views.
 * @param {number} limit
 * @returns {Promise<Array<Object>>}
 */
async function listFighters(limit = 50) {
    const fighters = await Fighter.find({}).limit(limit).select("firstName lastName nickname weightClass style overallRating energy record").lean();
    return fighters;
}

/**
 * Plain fighter JSON for API: energy reconciled + notoriety public state.
 * @param {import("mongoose").Document} fighter
 */
function toPublicFighter(fighter) {
    notorietyService.ensureNotorietyShape(fighter);
    const out = fighter.toObject ? fighter.toObject() : { ...fighter };
    out.notoriety = notorietyService.buildNotorietyPublicState(fighter);
    out.injuryLockedStats = getInjuryLockedStats(fighter);
    return out;
}

/**
 * Get one fighter and refresh in-memory energy from Redis.
 * @param {string} id
 * @returns {Promise<Object>}
 */
async function getFighterById(id) {
    const fighter = await Fighter.findById(id).populate("gymId");
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    return toPublicFighter(fighter);
}

/**
 * Update fighter profile fields and recalculate overall rating.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function updateFighter(id, data) {
    const fighter = await Fighter.findByIdAndUpdate(id, data, { new: true }).populate("gymId");
    if (!fighter) throw new Error("Fighter not found");
    fighter.overallRating = calculateOverall(fighter);
    await fighter.save();
    await reconcileEnergy(fighter);
    return toPublicFighter(fighter);
}

/**
 * Reconcile energy from Redis (authoritative) onto the fighter document in memory.
 * Cold start fallback is handled inside energyService.getEnergy().
 */
async function reconcileEnergy(fighter) {
    const snap = await energyService.getEnergy(String(fighter._id));
    setEnergySnapshot(fighter, snap);
    return fighter;
}

/**
 * Legacy compatibility wrapper. Energy ticking is now handled by BullMQ + Redis.
 */
async function reconcileAllFightersEnergy() {
    return 0;
}

/**
 * Legacy compatibility wrapper. Prefer addEnergy() from energyService.
 */
async function replenishEnergyAll() {
    return { acknowledged: true, modifiedCount: 0 };
}

/**
 * Deduct energy from a fighter. Throws if not enough. Reconciles energy first (1/min since last update).
 */
async function deductEnergy(fighterId, amount) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    const snap = await energyService.deductEnergy(fighterId, amount);
    setEnergySnapshot(fighter, snap);
    await fighter.save();
    return toPublicFighter(fighter);
}

/**
 * DEBUG: set energy to max (testing only). Gated by route / env in non-production.
 */
async function debugRefillEnergyToMax(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    const { current, max } = await energyService.getEnergy(fighterId);
    const snap = await energyService.addEnergy(fighterId, Math.max(0, max - current));
    setEnergySnapshot(fighter, snap);
    await fighter.save();
    return toPublicFighter(fighter);
}

/**
 * GDD 8.9: Doctor visit — spend energy to clear an injury that requires medical attention.
 * Iron cost temporarily disabled (no ⊗ check or deduction).
 * Instantly heals the injury and reverses its stat penalties.
 */
async function doctorVisit(fighterId, injuryType) {
    const { reverseInjuryFromFighter } = require("../utils/injuryUtils");
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    const currentEnergy = energySnapshot(fighter).current;

    const idx = (fighter.injuries || []).findIndex(
        (inj) => inj.type === injuryType && inj.requiresDoctorVisit && !inj.doctorVisited
    );
    if (idx === -1) throw new Error("Injury not found or does not require a doctor visit");

    const inj = fighter.injuries[idx];
    if (currentEnergy < inj.docVisitEnergy) {
        throw new Error(`Not enough energy (doctor visit costs ${inj.docVisitEnergy})`);
    }

    const updatedEnergy = await energyService.deductEnergy(fighterId, inj.docVisitEnergy);
    setEnergySnapshot(fighter, updatedEnergy);
    reverseInjuryFromFighter(fighter, inj);
    fighter.injuries.splice(idx, 1);
    await fighter.save();
    return toPublicFighter(fighter);
}

/**
 * GDD 8.5: Mental Reset — spend 5 Energy to clear mentalResetRequired after 3 consecutive losses.
 */
const MENTAL_RESET_ENERGY = 5;
async function mentalReset(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    const currentEnergy = energySnapshot(fighter).current;
    if (!fighter.mentalResetRequired) throw new Error("Mental Reset is not required");
    if (currentEnergy < MENTAL_RESET_ENERGY) throw new Error(`Not enough energy (Mental Reset costs ${MENTAL_RESET_ENERGY})`);
    const updatedEnergy = await energyService.deductEnergy(fighterId, MENTAL_RESET_ENERGY);
    setEnergySnapshot(fighter, updatedEnergy);
    fighter.mentalResetRequired = false;
    fighter.consecutiveLosses = 0;
    await fighter.save();
    return toPublicFighter(fighter);
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
    return toPublicFighter(fighter);
}

/** GDD: Rest/Recovery — spend 3 Energy to restore 25 Health and 25 Stamina (capped at max). */
const REST_ENERGY_COST = 3;
const REST_HEALTH = 25;
const REST_STAMINA = 25;

/**
 * Spend energy to restore health and stamina.
 * @param {string} fighterId
 * @returns {Promise<Object>}
 */
async function rest(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    const currentEnergy = energySnapshot(fighter).current;
    if (currentEnergy < REST_ENERGY_COST) throw new Error("Not enough energy (Rest costs 3)");
    const maxStamina = fighter.maxStamina ?? 100;
    const healthNow = fighter.health ?? 100;
    const staminaNow = fighter.stamina ?? maxStamina;
    if (healthNow >= 100 && staminaNow >= maxStamina) {
        throw new Error("Health and stamina are already full.");
    }
    const updatedEnergy = await energyService.deductEnergy(fighterId, REST_ENERGY_COST);
    setEnergySnapshot(fighter, updatedEnergy);
    fighter.health = Math.min(100, (fighter.health ?? 100) + REST_HEALTH);
    fighter.stamina = Math.min(maxStamina, (fighter.stamina ?? maxStamina) + REST_STAMINA);
    await fighter.save();
    return toPublicFighter(fighter);
}

module.exports = {
    createFighter,
    listFighters,
    getFighterById,
    toPublicFighter,
    updateFighter,
    reconcileEnergy,
    deductEnergy,
    debugRefillEnergyToMax,
    rest,
    doctorVisit,
    mentalReset,
    payGymMembership,
    buildStatProgress,
    getInjuryLockedStats
};
