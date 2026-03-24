const Fighter = require("../models/fighterModel");
const Gym = require("../models/gymModel");
const { TRAINING_SESSIONS, GYM_TIERS, BACKSTORIES } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");
const { applyXpToStat, STAT_TO_XP_KEY, STAT_TO_VAL_KEY } = require("../utils/statProgression");
const fighterService = require("./fighterService");
const energyService = require("./energyService");
const questService = require("./questService");
const {
    rollForSparringInjury,
    buildInjury,
    applyInjuryToFighter,
    isSparringBlocked,
    isBagWorkBlocked,
    processRecoverySession,
} = require("../utils/injuryUtils");

/**
 * Run a training session for a fighter at a gym.
 * Deducts energy, applies XP to stats (respecting gym cap), optionally raises max stamina or reduces injury.
 * @param {string} fighterId
 * @param {string} gymId
 * @param {string} sessionType - Key of TRAINING_SESSIONS (e.g. bag_work, sparring)
 * @returns {Promise<{ fighter: Object, message: string, xpGained: Object, statLevelUps: string[] }>}
 */
async function doTraining(fighterId, gymId, sessionType) {
    const config = TRAINING_SESSIONS[sessionType];
    if (!config) throw new Error("Unknown training session type");

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    // Reconcile time-based energy regen IN-PLACE on the same document instance.
    // This is the ONLY save that may happen before our final save — it uses the
    // same doc reference, so the version stays in sync.
    await fighterService.reconcileEnergy(fighter);

    const gym = await Gym.findById(gymId);
    if (!gym) throw new Error("Gym not found");
    // Keep fighter's enrolled gym aligned with where they are actively training.
    fighter.gymId = gym._id;

    if ((fighter.energy?.current ?? fighter.energy ?? 0) < config.energy) throw new Error("Not enough energy");

    // GDD 8.9: Block sessions based on active injuries
    if (sessionType === "sparring") {
        const blocked = isSparringBlocked(fighter);
        if (blocked) throw new Error(`Cannot spar: ${blocked.label} (${blocked.effect})`);
    }
    if (sessionType === "bag_work" || sessionType === "pad_work") {
        const blocked = isBagWorkBlocked(fighter);
        if (blocked) throw new Error(`Cannot do ${sessionType}: ${blocked.label} (${blocked.effect})`);
    }

    const tierConfig = GYM_TIERS[gym.tier];
    if (!tierConfig) throw new Error("Invalid gym tier");
    const statCap = tierConfig.statCap;
    const xpMultiplier = tierConfig.xpMultiplier;

    // Membership check: T2+ gyms require monthly iron payment
    if (gym.monthlyIron > 0) {
        const membership = (fighter.gymMemberships || []).find(
            (m) => String(m.gymId) === String(gymId)
        );
        const paid = membership && new Date(membership.paidUntil) > new Date();
        if (!paid) {
            throw new Error(`Gym membership required: ${gym.monthlyIron} ⊗/month`);
        }
    }

    if (config.minGymTier && config.minGymTier !== gym.tier) {
        const tierOrder = ["T1", "T2", "T3", "T4", "T5"];
        if (tierOrder.indexOf(gym.tier) < tierOrder.indexOf(config.minGymTier)) {
            throw new Error(`This training requires ${config.minGymTier} gym or higher`);
        }
    }

    // Deduct energy in Redis (authoritative), then mirror on this document.
    const nextEnergy = await energyService.deductEnergy(fighterId, config.energy);
    fighter.energy = {
        ...(fighter.energy && typeof fighter.energy === "object" ? fighter.energy : {}),
        current: nextEnergy.current,
        max: nextEnergy.max,
        lastSyncedAt: new Date(),
    };

    // GDD 7.4: Coach's Test quest grants +3 to stat cap at this gym on completion
    const statCapBonus = await questService.getStatCapBonus(fighterId, gymId);
    const effectiveStatCap = statCap + statCapBonus;
    const injuryLockedStats = new Set(fighterService.getInjuryLockedStats(fighter));

    if (config.raisesMaxStamina) {
        const currentMax = fighter.maxStamina || 100;
        if (currentMax < 120) {
            fighter.maxStamina = Math.min(120, currentMax + 1);
        }
        await fighter.save();
        await questService.onTraining(fighterId, gymId, sessionType, fighter, gym);
        return { fighter, message: "Strength & conditioning completed. Max Stamina increased.", xpGained: {}, statLevelUps: [] };
    }

    if (config.reducesInjuryTimer) {
        const healedLabels = processRecoverySession(fighter);
        await fighter.save();
        await questService.onTraining(fighterId, gymId, sessionType, fighter, gym);
        const healMsg = healedLabels.length ? ` Healed: ${healedLabels.join(", ")}.` : "";
        return { fighter, message: `Recovery session completed. Injury timer reduced.${healMsg}`, xpGained: {}, statLevelUps: [] };
    }

    const backstoryMod = fighter.backstory && BACKSTORIES[fighter.backstory] && BACKSTORIES[fighter.backstory].trainingXpMod
        ? BACKSTORIES[fighter.backstory].trainingXpMod
        : 0;

    // GDD 7.4: Apex Regimen perk → +20% XP on all sessions
    const apexMod = fighter.activePerks?.apexRegimen ? 0.2 : 0;
    const totalXpMod = 1 + backstoryMod + apexMod;

    let baseXp = config.xpBase * xpMultiplier * totalXpMod;
    const specialtyBonus = gym.specialtyStats && gym.specialtyStats.length ? 0.25 : 0;
    const xpGained = {};
    const statLevelUps = [];

    for (const statName of config.stats) {
        // Injury-penalized stats are locked from training progression until healed.
        if (injuryLockedStats.has(statName)) {
            xpGained[statName] = 0;
            continue;
        }
        const xpKey = STAT_TO_XP_KEY[statName];
        const valKey = STAT_TO_VAL_KEY[statName];
        if (!xpKey || !valKey) continue;

        const isSpecialty = gym.specialtyStats && gym.specialtyStats.includes(statName);

        // GDD 7.4: Specialist perk → +10% XP when training the specialty stat
        const specialistBonus = fighter.activePerks?.specialistStat === statName ? 0.1 : 0;
        const xp = baseXp * (1 + (isSpecialty ? specialtyBonus : 0) + specialistBonus) / config.stats.length;

        const currentStat = fighter[valKey] || 10;
        const currentXp = fighter[xpKey] || 0;
        const { newStat, newXp } = applyXpToStat(currentStat, currentXp, xp, effectiveStatCap);

        fighter[valKey] = newStat;
        fighter[xpKey] = newXp;
        xpGained[statName] = Math.round(xp);
        if (newStat > currentStat) statLevelUps.push(statName);
    }

    fighter.overallRating = calculateOverall(fighter);

    // GDD 8.9: Roll for sparring injury (3% minor, 0.3% major)
    const injurySustained = [];
    if (sessionType === "sparring") {
        const injuryType = rollForSparringInjury(fighter.fiq || 10);
        if (injuryType) {
            const inj = buildInjury(injuryType);
            if (inj) {
                applyInjuryToFighter(fighter, inj);
                fighter.injuries = [...(fighter.injuries || []), inj];
                injurySustained.push(inj.label);
            }
        }
    }

    // Single save for everything: XP, energy, overallRating, and any injury
    await fighter.save();

    // Quest hook: update progress and check for completions
    const completedQuests = await questService.onTraining(fighterId, gymId, sessionType, fighter, gym);

    const xpParts = Object.entries(xpGained)
        .filter(([, v]) => v > 0)
        .map(([stat, v]) => `${v} XP to ${stat}`);
    let message = xpParts.length
        ? `Trained ${sessionType}. Gained ${xpParts.join(", ")}.`
        : `Training (${sessionType}) completed.`;
    if (injurySustained.length > 0) {
        message += ` Injury sustained: ${injurySustained.join(", ")}!`;
    }
    if (completedQuests.length > 0) {
        message += ` Quest completed: ${completedQuests.map((q) => q.title).join(", ")}!`;
    }

    return {
        fighter: fighterService.toPublicFighter(fighter),
        message,
        xpGained,
        statLevelUps,
        completedQuests,
        injurySustained,
    };
}

module.exports = { doTraining };
