const Fighter = require("../models/fighterModel");
const Gym = require("../models/gymModel");
const { STYLES, BACKSTORIES, ENERGY } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");
const { xpRequiredForNextPoint, roundStatXp, normalizeBankedXp } = require("../utils/statProgression");
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
        const rawXp = fighter[STAT_TO_XP[key]] != null ? fighter[STAT_TO_XP[key]] : 0;
        const { newStat, newXp } = normalizeBankedXp(value, rawXp);
        const xpToNext = xpRequiredForNextPoint(newStat);
        progress[name] = {
            value: newStat,
            xp: roundStatXp(newXp),
            xpToNext: xpToNext ?? null,
        };
    }
    return progress;
}

/**
 * Persist overflow XP into stat points (same pipeline as fights). Fixes bad rows + quest direct stat bonuses.
 */
async function reconcileStatXpBanks(fighter) {
    let dirty = false;
    for (const name of STAT_NAMES) {
        const key = name.toLowerCase();
        const val = fighter[key] ?? 10;
        const xpKey = STAT_TO_XP[key];
        const xp = fighter[xpKey] ?? 0;
        const { newStat, newXp } = normalizeBankedXp(val, xp);
        const rounded = roundStatXp(newXp);
        if (newStat !== val || Math.abs(rounded - xp) > 1e-6) {
            fighter[key] = newStat;
            fighter[xpKey] = rounded;
            dirty = true;
        }
    }
    if (dirty) {
        fighter.overallRating = calculateOverall(fighter);
        await fighter.save();
    }
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
/** Cheap fingerprint of injury recovery state — changes when any injury ticks or heals. */
function injurySignature(fighter) {
    return (fighter.injuries || [])
        .map((i) => `${i.type}:${i.recoveryDaysLeft || 0}`)
        .join(",");
}

async function getFighterById(id) {
    const { tickRecoveryForFighter } = require("../utils/injuryUtils");
    const fighter = await Fighter.findById(id).populate("gymId");
    if (!fighter) throw new Error("Fighter not found");
    await reconcileStatXpBanks(fighter);
    await reconcileEnergy(fighter);
    const healthBefore = fighter.health;
    reconcileHealth(fighter);
    // Lazily heal injuries based on real elapsed time. This keeps recovery accurate
    // even if the daily background heal job is delayed or not running.
    const injuriesBefore = injurySignature(fighter);
    tickRecoveryForFighter(fighter);
    const injuriesChanged = injurySignature(fighter) !== injuriesBefore;
    if (fighter.health !== healthBefore || injuriesChanged) {
        await fighter.save();
    }
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
 * Passively regenerate health based on elapsed real time.
 * Gains +1 health per 30 minutes since `healthLastRegenAt`, capped at 100.
 * Only advances the timestamp by the amount of time actually consumed — partial
 * intervals are preserved so players don't lose progress between loads.
 */
const HEALTH_REGEN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes per +1 health
const HEALTH_MAX = 100;

function reconcileHealth(fighter) {
    if (!fighter) return fighter;
    const currentHealth = fighter.health ?? HEALTH_MAX;
    if (currentHealth >= HEALTH_MAX) {
        // Keep timestamp fresh so we don't accrue backdated regen after damage.
        fighter.healthLastRegenAt = new Date();
        return fighter;
    }

    const lastRegenAt = fighter.healthLastRegenAt ? new Date(fighter.healthLastRegenAt).getTime() : Date.now();
    const elapsedMs = Math.max(0, Date.now() - lastRegenAt);
    const pointsEarned = Math.floor(elapsedMs / HEALTH_REGEN_INTERVAL_MS);
    if (pointsEarned <= 0) return fighter;

    const capacity = HEALTH_MAX - currentHealth;
    const pointsApplied = Math.min(pointsEarned, capacity);
    fighter.health = currentHealth + pointsApplied;
    // Advance timestamp by exactly the consumed time — preserve partial progress.
    fighter.healthLastRegenAt = new Date(lastRegenAt + pointsApplied * HEALTH_REGEN_INTERVAL_MS);
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
 * GDD 8.9: Doctor visit — spend energy AND iron to clear an injury that requires medical attention.
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
    const energyCost = inj.docVisitEnergy || 0;
    const ironCost = inj.docVisitIron || 0;

    if (currentEnergy < energyCost) {
        throw new Error(`Not enough energy (doctor visit costs ${energyCost})`);
    }
    if ((fighter.iron || 0) < ironCost) {
        throw new Error(`Not enough iron (doctor visit costs ${ironCost})`);
    }

    if (energyCost > 0) {
        const updatedEnergy = await energyService.deductEnergy(fighterId, energyCost);
        setEnergySnapshot(fighter, updatedEnergy);
    }
    if (ironCost > 0) fighter.iron = (fighter.iron || 0) - ironCost;
    reverseInjuryFromFighter(fighter, inj);
    fighter.injuries.splice(idx, 1);
    await fighter.save();
    return toPublicFighter(fighter);
}

/**
 * Hospital — Skip Recovery: pay iron to instantly clear an auto-heal injury (no waiting days).
 * Only works on injuries with requiresDoctorVisit=false and recoveryDaysLeft>0.
 */
async function hospitalSkipRecovery(fighterId, injuryType) {
    const { reverseInjuryFromFighter } = require("../utils/injuryUtils");
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const idx = (fighter.injuries || []).findIndex(
        (inj) => inj.type === injuryType && !inj.requiresDoctorVisit && (inj.recoveryDaysLeft || 0) > 0
    );
    if (idx === -1) throw new Error("Injury not found or not eligible for recovery skip");

    const inj = fighter.injuries[idx];
    const ironCost = inj.recoverySkipIron || 0;
    if ((fighter.iron || 0) < ironCost) {
        throw new Error(`Not enough iron (skip recovery costs ${ironCost})`);
    }

    if (ironCost > 0) fighter.iron = (fighter.iron || 0) - ironCost;
    reverseInjuryFromFighter(fighter, inj);
    fighter.injuries.splice(idx, 1);
    await fighter.save();
    return toPublicFighter(fighter);
}

/**
 * Hospital — Full Recovery Package: heal every active injury in one transaction.
 * Atomically deducts iron + energy for all of them; rejects if either is insufficient.
 */
async function hospitalFullRecovery(fighterId) {
    const { reverseInjuryFromFighter, quoteFullRecovery } = require("../utils/injuryUtils");
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    const currentEnergy = energySnapshot(fighter).current;

    const quote = quoteFullRecovery(fighter);
    if (quote.count === 0) throw new Error("No active injuries to heal");
    if (currentEnergy < quote.energy) {
        throw new Error(`Not enough energy (full recovery costs ${quote.energy})`);
    }
    if ((fighter.iron || 0) < quote.iron) {
        throw new Error(`Not enough iron (full recovery costs ${quote.iron})`);
    }

    if (quote.energy > 0) {
        const updatedEnergy = await energyService.deductEnergy(fighterId, quote.energy);
        setEnergySnapshot(fighter, updatedEnergy);
    }
    if (quote.iron > 0) fighter.iron = (fighter.iron || 0) - quote.iron;

    // Heal every healable injury (doctor-required not yet visited, OR auto-heal in progress).
    const healed = [];
    const remaining = [];
    for (const inj of fighter.injuries || []) {
        const needsDoctor = inj.requiresDoctorVisit && !inj.doctorVisited;
        const autoHealing = !inj.requiresDoctorVisit && (inj.recoveryDaysLeft || 0) > 0;
        if (needsDoctor || autoHealing) {
            reverseInjuryFromFighter(fighter, inj);
            healed.push(inj.label);
        } else {
            remaining.push(inj);
        }
    }
    fighter.injuries = remaining;
    await fighter.save();
    return { fighter: toPublicFighter(fighter), healed, ironPaid: quote.iron, energyPaid: quote.energy };
}

/**
 * Hospital — Quote: returns the iron+energy cost the player would pay for the Full Recovery Package
 * given their current injury state. Also returns the player's current health so the UI can render
 * the Health Restoration buttons with accurate "actual heal" preview values.
 */
async function hospitalQuote(fighterId) {
    const { quoteFullRecovery } = require("../utils/injuryUtils");
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    reconcileHealth(fighter);
    const fullRecovery = quoteFullRecovery(fighter);
    return {
        ...fullRecovery,
        health: {
            current: fighter.health ?? 100,
            max: 100,
        },
    };
}

/**
 * Hospital — Restore Health: pay iron to restore HP via one of the three packages.
 * Iron cost is pro-rated when the package would be capped at 100 HP — the player only
 * pays for the HP actually delivered. No tier gating — all packages available to every fighter.
 */
async function hospitalRestoreHealth(fighterId, packageKey) {
    const { HEALTH_PACKAGES } = require("../consts/injuryDefinitions");
    const pkg = HEALTH_PACKAGES[packageKey];
    if (!pkg) throw new Error("Unknown health package");

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    reconcileHealth(fighter);

    const currentHealth = fighter.health ?? 100;
    if (currentHealth >= 100) throw new Error("Health is already full");

    const restored = Math.min(pkg.hp, 100 - currentHealth);
    // Pro-rate the iron cost so a player at 35 HP missing pays for 35, not the full package.
    const proRatedIron = Math.ceil((restored / pkg.hp) * pkg.iron);

    if ((fighter.iron || 0) < proRatedIron) {
        throw new Error(`Not enough iron (this ${pkg.label} costs ${proRatedIron})`);
    }

    fighter.iron = (fighter.iron || 0) - proRatedIron;
    fighter.health = currentHealth + restored;
    // Reset regen anchor so passive regen continues from the new HP value.
    fighter.healthLastRegenAt = new Date();
    await fighter.save();
    return { fighter: toPublicFighter(fighter), restored, ironPaid: proRatedIron };
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
/**
 * Switch active gym membership. Deducts weekly iron cost, cancels old membership.
 * Initializes gym rank progress if first time at this gym.
 */
async function switchGym(fighterId, gymId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const Gym = require("../models/gymModel");
    const gym = await Gym.findById(gymId);
    if (!gym) throw new Error("Gym not found");

    if (gym.isFreeGym) throw new Error("Community gym is always free — no membership needed");

    // Tier gate check
    const { PROMOTION_TIERS } = require("../consts/gameConstants");
    const TIER_ORDER = Object.keys(PROMOTION_TIERS);
    if (TIER_ORDER.indexOf(fighter.promotionTier ?? "Amateur") < TIER_ORDER.indexOf(gym.availableFrom)) {
        throw new Error(`This gym requires ${gym.availableFrom} tier or higher`);
    }

    if ((fighter.iron ?? 0) < gym.weeklyCost) {
        throw new Error(`Not enough Iron — need ${gym.weeklyCost}`);
    }

    fighter.iron -= gym.weeklyCost;
    fighter.activeGymId = gym._id;
    fighter.activeGymPaidUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    fighter.gymId = gym._id; // also set as home gym for display

    // Initialize rank progress if first time
    const gymRankService = require("./gymRankService");
    gymRankService.getOrInitRank(fighter, gym.slug);

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
    reconcileHealth,
    deductEnergy,
    debugRefillEnergyToMax,
    doctorVisit,
    hospitalSkipRecovery,
    hospitalFullRecovery,
    hospitalQuote,
    hospitalRestoreHealth,
    mentalReset,
    switchGym,
    buildStatProgress,
    getInjuryLockedStats
};
