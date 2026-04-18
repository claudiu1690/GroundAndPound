const Fighter = require("../models/fighterModel");
const Gym = require("../models/gymModel");
const { TRAINING_SESSIONS, BACKSTORIES, PROMOTION_TIERS } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");
const { applyXpToStat, roundStatXp, STAT_TO_XP_KEY, STAT_TO_VAL_KEY } = require("../utils/statProgression");
const fighterService = require("./fighterService");
const energyService = require("./energyService");
const gymRankService = require("./gymRankService");
const {
    rollForSparringInjury,
    buildInjury,
    applyInjuryToFighter,
    isSparringBlocked,
    isBagWorkBlocked,
    processRecoverySession,
} = require("../utils/injuryUtils");

// Rank 2 unique sessions — not in base TRAINING_SESSIONS, added by gym rank unlock
const RANK2_SESSIONS = {
    combination_drilling:   { energy: 5, stats: ["STR", "SPD"], xpBase: 10, xpBonus: 0.15, label: "Combination Drilling" },
    switch_kick_mastery:    { energy: 5, stats: ["LEG", "SPD"], xpBase: 10, xpBonus: 0.15, label: "Switch Kick Mastery" },
    chain_wrestling:        { energy: 6, stats: ["WRE", "GND"], xpBase: 10, xpBonus: 0.15, label: "Chain Wrestling" },
    advanced_guard_work:    { energy: 6, stats: ["GND", "SUB"], xpBase: 10, xpBonus: 0.15, label: "Advanced Guard Work" },
    clinch_knees:           { energy: 5, stats: ["LEG", "CHN"], xpBase: 10, xpBonus: 0.15, label: "Clinch Knees" },
    transition_mastery:     { energy: 6, stats: ["SUB", "FIQ"], xpBase: 10, xpBonus: 0.15, label: "Transition Mastery" },
    counter_timing:         { energy: 5, stats: ["SPD", "FIQ"], xpBase: 10, xpBonus: 0.15, label: "Counter Timing" },
    power_wrestling:        { energy: 6, stats: ["STR", "WRE"], xpBase: 10, xpBonus: 0.15, label: "Power Wrestling" },
    strategic_sparring:     { energy: 7, stats: ["FIQ", "GND"], xpBase: 10, xpBonus: 0.15, label: "Strategic Sparring" },
    championship_rounds:    { energy: 8, stats: ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"], xpBase: 12, xpBonus: 0.10, label: "Championship Rounds" },
};

// Tier order for availability check
const TIER_ORDER = Object.keys(PROMOTION_TIERS);

function isTierUnlocked(fighterTier, requiredTier) {
    return TIER_ORDER.indexOf(fighterTier) >= TIER_ORDER.indexOf(requiredTier);
}

/**
 * Run a training session for a fighter at a gym.
 */
async function doTraining(fighterId, gymId, sessionType) {
    // Resolve session config — check base sessions first, then rank 2 sessions
    let config = TRAINING_SESSIONS[sessionType];
    let isRank2Session = false;
    if (!config && RANK2_SESSIONS[sessionType]) {
        config = RANK2_SESSIONS[sessionType];
        isRank2Session = true;
    }
    if (!config) throw new Error("Unknown training session type");

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    await fighterService.reconcileEnergy(fighter);

    const gym = await Gym.findById(gymId);
    if (!gym) throw new Error("Gym not found");

    // Tier gate: check fighter's promotion tier meets gym requirement
    if (!isTierUnlocked(fighter.promotionTier ?? "Amateur", gym.availableFrom)) {
        throw new Error(`This gym requires ${gym.availableFrom} tier or higher`);
    }

    // Membership check: paid gyms require active membership
    if (!gym.isFreeGym) {
        const isActiveMember = String(fighter.activeGymId) === String(gymId)
            && fighter.activeGymPaidUntil
            && new Date(fighter.activeGymPaidUntil) > new Date();
        if (!isActiveMember) {
            throw new Error(`Active membership required at ${gym.name} (${gym.weeklyCost} iron/week)`);
        }
    }

    // Session availability check
    const rank2SessionKey = gymRankService.getRank2Session(fighter, gym);
    const availableSessions = [...(gym.sessions || [])];
    if (rank2SessionKey) availableSessions.push(rank2SessionKey);

    if (!availableSessions.includes(sessionType)) {
        if (isRank2Session) {
            throw new Error("This session requires Rank 2 at this gym");
        }
        throw new Error("This session is not available at this gym");
    }

    if ((fighter.energy?.current ?? fighter.energy ?? 0) < config.energy) {
        throw new Error("Not enough energy");
    }

    // Injury blocks
    if (sessionType === "sparring" || sessionType === "strategic_sparring" || sessionType === "championship_rounds") {
        const blocked = isSparringBlocked(fighter);
        if (blocked) throw new Error(`Cannot spar: ${blocked.label} (${blocked.effect})`);
    }
    if (sessionType === "bag_work" || sessionType === "pad_work" || sessionType === "combination_drilling") {
        const blocked = isBagWorkBlocked(fighter);
        if (blocked) throw new Error(`Cannot do ${sessionType}: ${blocked.label} (${blocked.effect})`);
    }

    // Deduct energy
    const nextEnergy = await energyService.deductEnergy(fighterId, config.energy);
    fighter.energy = {
        ...(fighter.energy && typeof fighter.energy === "object" ? fighter.energy : {}),
        current: nextEnergy.current,
        max: nextEnergy.max,
        lastSyncedAt: new Date(),
    };

    const injuryLockedStats = new Set(fighterService.getInjuryLockedStats(fighter));

    // Handle special sessions (conditioning, recovery)
    if (config.raisesMaxStamina) {
        const currentMax = fighter.maxStamina || 100;
        if (currentMax < 120) {
            fighter.maxStamina = Math.min(120, currentMax + 1);
        }
        if (!gym.isFreeGym) gymRankService.incrementTrainingSessions(fighter, gym.slug);
        await fighter.save();
        return { fighter: fighterService.toPublicFighter(fighter), message: "Strength & conditioning completed. Max Stamina increased.", xpGained: {}, statLevelUps: [] };
    }

    if (config.reducesInjuryTimer) {
        const healedLabels = processRecoverySession(fighter);
        if (!gym.isFreeGym) gymRankService.incrementTrainingSessions(fighter, gym.slug);
        await fighter.save();
        const healMsg = healedLabels.length ? ` Healed: ${healedLabels.join(", ")}.` : "";
        return { fighter: fighterService.toPublicFighter(fighter), message: `Recovery session completed.${healMsg}`, xpGained: {}, statLevelUps: [] };
    }

    // ── XP Calculation ──
    const backstoryMod = fighter.backstory && BACKSTORIES[fighter.backstory]?.trainingXpMod || 0;
    const rank2Bonus = isRank2Session ? (config.xpBonus || 0) : 0;
    const totalXpMod = 1 + backstoryMod + rank2Bonus;

    // Gym rank 3 bonus: +5% XP to focus stats permanently
    const gymProgress = gym.isFreeGym ? null : gymRankService.getGymProgress(fighter, gym);
    const rank3BonusPct = gymProgress?.hasXpBonus ? (gymProgress.xpBonusPct / 100) : 0;

    const xpGained = {};
    const statLevelUps = [];

    for (const statName of config.stats) {
        if (injuryLockedStats.has(statName)) {
            xpGained[statName] = 0;
            continue;
        }
        const xpKey = STAT_TO_XP_KEY[statName];
        const valKey = STAT_TO_VAL_KEY[statName];
        if (!xpKey || !valKey) continue;

        const isFocus = gym.focusStats.includes(statName);
        const gymMult = isFocus ? gym.focusXpMultiplier : gym.xpMultiplier;
        const rank3Mult = isFocus ? rank3BonusPct : 0;

        const xp = config.xpBase * gymMult * totalXpMod * (1 + rank3Mult) / config.stats.length;

        const currentStat = fighter[valKey] || 10;
        const currentXp = fighter[xpKey] || 0;
        // No stat cap — XP speed only differentiation
        const { newStat, newXp } = applyXpToStat(currentStat, currentXp, xp, 100);

        fighter[valKey] = newStat;
        fighter[xpKey] = roundStatXp(newXp);
        xpGained[statName] = Math.round(xp);
        if (newStat > currentStat) statLevelUps.push(statName);
    }

    fighter.overallRating = calculateOverall(fighter);

    // Sparring injury risk
    const injurySustained = [];
    if (sessionType === "sparring" || sessionType === "strategic_sparring" || sessionType === "championship_rounds") {
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

    // Increment gym rank training sessions
    if (!gym.isFreeGym) {
        gymRankService.incrementTrainingSessions(fighter, gym.slug);
    }

    await fighter.save();

    // Check rank-up after training
    let rankUpResult = null;
    if (!gym.isFreeGym) {
        rankUpResult = gymRankService.checkRankUp(fighter, gym);
        if (rankUpResult) await fighter.save();
    }

    const xpParts = Object.entries(xpGained)
        .filter(([, v]) => v > 0)
        .map(([stat, v]) => `${v} XP to ${stat}`);
    let message = xpParts.length
        ? `Trained ${config.label || sessionType}. Gained ${xpParts.join(", ")}.`
        : `Training (${config.label || sessionType}) completed.`;
    if (injurySustained.length > 0) message += ` Injury sustained: ${injurySustained.join(", ")}!`;
    if (rankUpResult) message += ` ${rankUpResult.unlockDescription}!`;

    return {
        fighter: fighterService.toPublicFighter(fighter),
        message,
        xpGained,
        statLevelUps,
        injurySustained,
        rankUp: rankUpResult,
    };
}

module.exports = { doTraining, RANK2_SESSIONS };
