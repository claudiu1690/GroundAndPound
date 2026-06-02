const Fighter = require("../models/fighterModel");
const Gym = require("../models/gymModel");
const { TRAINING_SESSIONS, BACKSTORIES, PROMOTION_TIERS } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");
const { applyXpToStat, roundStatXp, STAT_TO_XP_KEY, STAT_TO_VAL_KEY } = require("../utils/statProgression");
const fighterService = require("./fighterService");
const energyService = require("./energyService");
const gymRankService = require("./gymRankService");
const { rollSessionXp, tierForRoll } = require("../utils/trainingRng");
const {
    rollForSparringInjury,
    buildInjury,
    applyInjuryToFighter,
    isSparringBlocked,
    isBagWorkBlocked,
    injuryGraceActive,
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

// Hard ceiling on batch size, independent of energy/client request.
const MAX_BATCH = 25;

function isTierUnlocked(fighterTier, requiredTier) {
    return TIER_ORDER.indexOf(fighterTier) >= TIER_ORDER.indexOf(requiredTier);
}

/**
 * Daily reset for the per-day training session counter. Mirrors the
 * calendar-day (toDateString, server local time) idiom used by
 * fightService.ensureDailyFightTierState. Called once per train.
 */
function ensureDailyTrainingState(fighter) {
    const today = new Date().toDateString();
    if (fighter.trainingDayKey !== today) {
        fighter.trainingSessionsToday = 0;
        fighter.trainingDayKey = today;
    }
}

/**
 * PURE: derive the stop reason for a finished batch (no injury case).
 * k < clampedQ means the live-energy clamp reduced the funded count.
 */
function deriveStopReason(k, clampedQ) {
    return k === clampedQ ? "completed" : "out_of_energy";
}

/**
 * PURE: refund accounting. Energy is only ever refunded when fewer sessions
 * completed than were funded — which can only happen on an injury early-stop.
 */
function computeRefund(funded, completed, costPerSession) {
    return (funded - completed) * costPerSession;
}

/**
 * Run up to `quantity` training sessions for a fighter at a gym, resolved
 * atomically into one aggregated result. quantity=1 is byte-identical to the
 * historical single-session behavior (same message string, same xpGained /
 * statLevelUps / injurySustained / rankUp / fighter payload).
 *
 * @param {string} fighterId
 * @param {string} gymId
 * @param {string} sessionType
 * @param {number} [quantity=1]
 */
async function doTraining(fighterId, gymId, sessionType, quantity = 1) {
    // ── PRE-FLIGHT (once, unchanged order; all throws map to existing 400/404) ──
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
    ensureDailyTrainingState(fighter);

    const gym = await Gym.findById(gymId);
    if (!gym) throw new Error("Gym not found");

    if (!isTierUnlocked(fighter.promotionTier ?? "Amateur", gym.availableFrom)) {
        throw new Error(`This gym requires ${gym.availableFrom} tier or higher`);
    }

    if (!gym.isFreeGym) {
        const isActiveMember = String(fighter.activeGymId) === String(gymId)
            && fighter.activeGymPaidUntil
            && new Date(fighter.activeGymPaidUntil) > new Date();
        if (!isActiveMember) {
            throw new Error(`Active membership required at ${gym.name} (${gym.weeklyCost} cash/week)`);
        }
    }

    const rank2SessionKey = gymRankService.getRank2Session(fighter, gym);
    const availableSessions = [...(gym.sessions || [])];
    if (rank2SessionKey) availableSessions.push(rank2SessionKey);

    if (!availableSessions.includes(sessionType)) {
        if (isRank2Session) {
            throw new Error("This session requires Rank 2 at this gym");
        }
        throw new Error("This session is not available at this gym");
    }

    // Injury blocks (whole batch is rejected up-front, as a single session is today).
    const isSparringFamily = sessionType === "sparring" || sessionType === "strategic_sparring" || sessionType === "championship_rounds";
    const isBagFamily = sessionType === "bag_work" || sessionType === "pad_work" || sessionType === "combination_drilling";
    if (isSparringFamily) {
        const blocked = isSparringBlocked(fighter);
        if (blocked) throw new Error(`Cannot spar: ${blocked.label} (${blocked.effect})`);
    }
    if (isBagFamily) {
        const blocked = isBagWorkBlocked(fighter);
        if (blocked) throw new Error(`Cannot do ${sessionType}: ${blocked.label} (${blocked.effect})`);
    }

    // ── ENERGY: atomically fund up to clampedQ sessions ──
    const requestedRaw = Math.max(1, Math.floor(quantity) || 1);
    const clampedQ = Math.min(requestedRaw, MAX_BATCH);

    const energyBefore = fighter.energy?.current ?? 0;
    const { funded: k } = await energyService.deductBatchEnergy(fighterId, config.energy, clampedQ);
    if (k === 0) {
        // Nothing written, nothing to refund.
        throw new Error("Not enough energy");
    }

    const isBatch = requestedRaw > 1;
    const events = [];

    // ── CONDITIONING (raisesMaxStamina) batch path ──
    if (config.raisesMaxStamina) {
        const hasIronConditioning = (fighter.gymPerks || []).includes("iron_conditioning");
        const perGain = hasIronConditioning ? 2 : 1;

        let maxStaminaGained = 0;
        let staminaCapHit = false;
        let completed = 0;

        for (let i = 1; i <= k; i++) {
            const currentMax = fighter.maxStamina || 100;
            let nextMax = currentMax;
            if (currentMax < 120) nextMax = Math.min(120, currentMax + perGain);
            const actualGain = nextMax - currentMax;
            fighter.maxStamina = nextMax;
            maxStaminaGained += actualGain;
            if (actualGain === 0 && !staminaCapHit) {
                staminaCapHit = true;
                events.push({ type: "stamina_cap_hit", sessionIndex: i });
            }
            if (!gym.isFreeGym) gymRankService.incrementTrainingSessions(fighter, gym.slug);
            completed += 1;
        }

        const stopReason = deriveStopReason(k, clampedQ);

        // Snapshot live (post-deduct) energy onto the doc before saving so the
        // Mongo backup can't persist the stale pre-deduct value.
        const snap = await energyService.getEnergy(fighterId);
        fighter.energy = {
            ...(fighter.energy && typeof fighter.energy === "object" ? fighter.energy : {}),
            current: snap.current,
            max: snap.max,
            lastSyncedAt: new Date(),
        };
        const energyAfter = snap.current;
        const energySpent = completed * config.energy;

        fighter.trainingSessionsToday += completed;

        await fighter.save();

        let rankUpResult = null;
        if (!gym.isFreeGym) {
            rankUpResult = gymRankService.checkRankUp(fighter, gym);
            if (rankUpResult) await fighter.save();
        }

        // Backward-compatible single-session message.
        let message = maxStaminaGained > 0
            ? `Strength & conditioning completed. Max Stamina +${maxStaminaGained}.`
            : "Strength & conditioning completed. Max Stamina already at cap.";
        if (isBatch) {
            message = maxStaminaGained > 0
                ? `Strength & conditioning ×${completed}. Max Stamina +${maxStaminaGained}.`
                : `Strength & conditioning ×${completed}. Max Stamina already at cap.`;
            if (stopReason === "out_of_energy") message += " Stopped early (out of energy).";
        }
        if (rankUpResult) message += ` ${rankUpResult.unlockDescription}!`;

        return {
            requested: clampedQ,
            completed,
            stopReason,
            xpGained: {},
            statChanges: [],
            statLevelUps: [],
            energyBefore,
            energyAfter,
            energySpent,
            events,
            injurySustained: [],
            rankUp: rankUpResult,
            maxStaminaGained,
            staminaCapHit,
            sessionsToday: fighter.trainingSessionsToday,
            rollTier: null,
            rollTierCounts: { great: 0, normal: 0, sluggish: 0 },
            fighter: fighterService.toPublicFighter(fighter),
            message,
        };
    }

    // ── XP batch path ──
    const backstoryMod = fighter.backstory && BACKSTORIES[fighter.backstory]?.trainingXpMod || 0;
    const rank2Bonus = isRank2Session ? (config.xpBonus || 0) : 0;
    const totalXpMod = 1 + backstoryMod + rank2Bonus;

    const gymProgress = gym.isFreeGym ? null : gymRankService.getGymProgress(fighter, gym);
    const rank3BonusPct = gymProgress?.hasXpBonus ? (gymProgress.xpBonusPct / 100) : 0;

    const injuryLockedStats = new Set(fighterService.getInjuryLockedStats(fighter));

    // Capture per-stat value before the batch, for statChanges reporting.
    const valueBefore = {};
    for (const statName of config.stats) {
        const valKey = STAT_TO_VAL_KEY[statName];
        if (valKey) valueBefore[statName] = fighter[valKey] || 10;
    }

    const xpGained = {};        // accumulated rounded xp per stat (applied)
    const wasted = {};          // accumulated rounded xp lost to the 95 cap per stat
    const statCapEmitted = new Set();

    let completed = 0;
    let stopReason = "completed";
    const injurySustained = [];

    // Per-session XP roll tally (a session is drawn once, shared across stats).
    const rollTierCounts = { great: 0, normal: 0, sluggish: 0 };
    let lastTier = null;

    for (let i = 1; i <= k; i++) {
        // Draw ONCE per session, before any stat math, so a session that ends
        // in an injury (still counts as completed) is still tallied.
        const sessionRoll = rollSessionXp();
        const sessionTier = tierForRoll(sessionRoll);
        rollTierCounts[sessionTier] += 1;
        lastTier = sessionTier;

        // Apply one session of XP per stat (exact single-session math).
        for (const statName of config.stats) {
            if (injuryLockedStats.has(statName)) {
                if (xpGained[statName] === undefined) xpGained[statName] = 0;
                continue;
            }
            const xpKey = STAT_TO_XP_KEY[statName];
            const valKey = STAT_TO_VAL_KEY[statName];
            if (!xpKey || !valKey) continue;

            const isFocus = gym.focusStats.includes(statName);
            const gymMult = isFocus ? gym.focusXpMultiplier : gym.xpMultiplier;
            const rank3Mult = isFocus ? rank3BonusPct : 0;

            const xp = config.xpBase * sessionRoll * gymMult * totalXpMod * (1 + rank3Mult) / config.stats.length;

            const currentStat = fighter[valKey] || 10;

            // 95-cap wastage: if already at/over the training cap, the whole computed
            // xp is wasted (applyXpToStat would return it unchanged anyway).
            if (currentStat >= 95) {
                wasted[statName] = (wasted[statName] || 0) + Math.round(xp);
                if (xpGained[statName] === undefined) xpGained[statName] = 0;
                if (!statCapEmitted.has(statName)) {
                    statCapEmitted.add(statName);
                    events.push({ type: "stat_cap_hit", sessionIndex: i, stat: statName });
                }
                continue;
            }

            const currentXp = fighter[xpKey] || 0;
            const { newStat, newXp } = applyXpToStat(currentStat, currentXp, xp, 100);
            fighter[valKey] = newStat;
            fighter[xpKey] = roundStatXp(newXp);
            xpGained[statName] = (xpGained[statName] || 0) + Math.max(1, Math.round(xp));
        }

        // Increment gym rank training sessions (one per completed session).
        if (!gym.isFreeGym) {
            gymRankService.incrementTrainingSessions(fighter, gym.slug);
        }

        // Sparring injury roll happens per-session; an applied injury stops the batch.
        if (isSparringFamily) {
            const injuryType = rollForSparringInjury(fighter.fiq || 10);
            if (injuryType) {
                const inj = buildInjury(injuryType);
                if (inj && !(injuryGraceActive(fighter) && inj.cannotFight)) {
                    applyInjuryToFighter(fighter, inj);
                    fighter.injuries = [...(fighter.injuries || []), inj];
                    injurySustained.push(inj.label);
                    events.push({ type: "injury", sessionIndex: i, label: inj.label });
                    completed = i; // injuring round counts as completed
                    stopReason = "injury";
                    break;
                }
            }
        }

        completed = i;
    }

    if (stopReason !== "injury") {
        stopReason = deriveStopReason(k, clampedQ);
    }

    // Single-session tier label (null for batches; the counts carry batch detail).
    const rollTier = isBatch ? null : lastTier;

    // Refund energy for funded-but-not-completed sessions (only on injury stop).
    const refund = computeRefund(k, completed, config.energy);
    if (refund > 0) {
        await energyService.addEnergy(fighterId, refund);
    }

    const energySpent = completed * config.energy;

    // Build statChanges + statLevelUps (stats whose VALUE increased).
    const statLevelUps = [];
    const statChanges = [];
    for (const statName of config.stats) {
        const valKey = STAT_TO_VAL_KEY[statName];
        const before = valueBefore[statName] ?? (valKey ? (fighter[valKey] || 10) : 10);
        const after = valKey ? (fighter[valKey] || 10) : before;
        statChanges.push({
            stat: statName,
            before,
            after,
            xp: xpGained[statName] || 0,
            wasted: wasted[statName] || 0,
        });
        if (after > before) statLevelUps.push(statName);
    }

    fighter.overallRating = calculateOverall(fighter);

    // Snapshot live energy onto the doc, then one save.
    const energySnap = await energyService.getEnergy(fighterId);
    fighter.energy = {
        ...(fighter.energy && typeof fighter.energy === "object" ? fighter.energy : {}),
        current: energySnap.current,
        max: energySnap.max,
        lastSyncedAt: new Date(),
    };
    const energyAfter = energySnap.current;

    fighter.trainingSessionsToday += completed;

    await fighter.save();

    // Rank-up check once after the batch (mirrors the historical 2-save pattern).
    let rankUpResult = null;
    if (!gym.isFreeGym) {
        rankUpResult = gymRankService.checkRankUp(fighter, gym);
        if (rankUpResult) await fighter.save();
    }

    // ── Message: identical to today for N=1; suffixed only when batched. ──
    const xpParts = Object.entries(xpGained)
        .filter(([, v]) => v > 0)
        .map(([stat, v]) => `${v} XP to ${stat}`);
    let message = xpParts.length
        ? `Trained ${config.label || sessionType}. Gained ${xpParts.join(", ")}.`
        : `Training (${config.label || sessionType}) completed.`;
    if (isBatch) {
        // Re-state with the batch count up front but keep the same XP phrasing.
        message = xpParts.length
            ? `Trained ${config.label || sessionType} ×${completed}. Gained ${xpParts.join(", ")}.`
            : `Training (${config.label || sessionType}) ×${completed} completed.`;
        if (stopReason === "out_of_energy") message += " Stopped early (out of energy).";
    }
    if (injurySustained.length > 0) {
        message += ` Injury sustained: ${injurySustained.join(", ")}!`;
        if (isBatch && stopReason === "injury") message += " Stopped early (injury).";
    }
    if (rankUpResult) message += ` ${rankUpResult.unlockDescription}!`;

    return {
        requested: k,
        completed,
        stopReason,
        xpGained,
        statChanges,
        statLevelUps,
        energyBefore,
        energyAfter,
        energySpent,
        events,
        injurySustained,
        rankUp: rankUpResult,
        maxStaminaGained: 0,
        staminaCapHit: false,
        sessionsToday: fighter.trainingSessionsToday,
        rollTier,
        rollTierCounts,
        fighter: fighterService.toPublicFighter(fighter),
        message,
    };
}

module.exports = {
    doTraining,
    doTrainingBatch: doTraining,
    RANK2_SESSIONS,
    // Exported for unit tests of pure batch logic.
    _deriveStopReason: deriveStopReason,
    _computeRefund: computeRefund,
    MAX_BATCH,
};
