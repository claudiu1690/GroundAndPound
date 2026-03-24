/**
 * GDD 7.4 — Gym Side Quest service.
 * Tracks per-fighter-per-gym quest progress and applies rewards on completion.
 */
const Gym = require("../models/gymModel");
const Fighter = require("../models/fighterModel");
const QuestProgress = require("../models/questProgressModel");
const { normalizeBankedXp, roundStatXp } = require("../utils/statProgression");
const { getQuestsForGym } = require("../consts/questDefinitions");
const { GYM_TIERS, TRAINING_SESSIONS } = require("../consts/gameConstants");
const {
    COMBAT_STAT_KEYS,
    DECISION_OUTCOMES,
    WIN_OUTCOMES,
    NATIONAL_PLUS_TIERS,
    GCS_TIERS,
} = require("../consts/questProgressConfig");

const PROGRESS_KEY_PREFIX = "progress.";

/** Build an empty Mongo update payload for progress mutations. */
function emptyUpdate() {
    return { $inc: {}, $set: {} };
}

/** Increment a progress counter in the current update payload. */
function addInc(update, key, amount = 1) {
    update.$inc[`${PROGRESS_KEY_PREFIX}${key}`] = (update.$inc[`${PROGRESS_KEY_PREFIX}${key}`] || 0) + amount;
}

/** Set a binary snapshot progress value in the current update payload. */
function setSnapshot(update, key, value) {
    update.$set[`${PROGRESS_KEY_PREFIX}${key}`] = value;
}

/** Remove empty $inc/$set blocks before sending to Mongo. */
function cleanupUpdate(update) {
    if (Object.keys(update.$inc).length === 0) delete update.$inc;
    if (Object.keys(update.$set).length === 0) delete update.$set;
    return update;
}

/** Check whether a quest is locked because its prerequisite isn't completed yet (global completion). */
function isQuestLockedForFighter(quest, fighter) {
    return !!(quest.requiresQuest && !fighter.completedQuests?.includes(quest.requiresQuest));
}

function hasValidGymMembership(fighter, gym) {
    if (!gym.monthlyIron || gym.monthlyIron === 0) return true;
    return (fighter.gymMemberships || []).some(
        (m) => String(m.gymId) === String(gym._id) && new Date(m.paidUntil) > new Date()
    );
}

/** True when all combat stats are at least 60. */
function allStats60Plus(fighter) {
    return COMBAT_STAT_KEYS.every((k) => (fighter[k] || 0) >= 60);
}

/** True when all quest conditions have reached target values. */
function conditionsMet(quest, progressDoc) {
    return quest.conditions.every((cond) => (progressDoc.progress?.[cond.key] ?? 0) >= cond.target);
}

/** Clamp tracked condition counters so they never exceed their target. */
function getCappedProgressForQuest(quest, progress = {}) {
    const capped = { ...(progress || {}) };
    for (const cond of quest.conditions) {
        const current = capped[cond.key] ?? 0;
        if (typeof current === "number") capped[cond.key] = Math.min(current, cond.target);
    }
    return capped;
}

/** Persist capped counters for a quest progress document if needed. */
async function clampQuestProgressDoc(quest, doc) {
    if (!doc) return doc;
    const cappedProgress = getCappedProgressForQuest(quest, doc.progress);
    const toSet = {};

    for (const cond of quest.conditions) {
        const key = cond.key;
        const before = doc.progress?.[key] ?? 0;
        const after = cappedProgress[key] ?? 0;
        if (before !== after) toSet[`${PROGRESS_KEY_PREFIX}${key}`] = after;
    }

    if (Object.keys(toSet).length === 0) return doc;

    return QuestProgress.findOneAndUpdate(
        { _id: doc._id },
        { $set: toSet },
        { new: true }
    );
}

/** Ensure all applicable quest docs exist for a fighter at the current gym. */
async function ensureQuestDocs(fighterId, gymId, gymTier, gymSpecialtyStats) {
    const applicable = getQuestsForGym(gymTier, gymSpecialtyStats);
    for (const quest of applicable) {
        await QuestProgress.findOneAndUpdate(
            { fighterId, gymId, questId: quest.id },
            {
                $setOnInsert: {
                    fighterId,
                    gymId,
                    questId: quest.id,
                    status: "available",
                    progress: {},
                    completedAt: null,
                },
            },
            { upsert: true, new: false }
        );
    }
    return applicable;
}

/** Apply quest reward effects to fighter data (caller saves fighter). */
async function applyReward(fighter, gym, quest) {
    const reward = quest.reward;
    switch (reward.type) {
        case "perk":
            if (reward.perkId === "ironWill") fighter.activePerks.ironWill = true;
            if (reward.perkId === "apexRegimen") fighter.activePerks.apexRegimen = true;
            if (reward.perkId === "specialistStat" && gym.specialtyStats?.length) {
                fighter.activePerks.specialistStat = gym.specialtyStats[0];
            }
            if (reward.perkId === "theGrind") fighter.activePerks.theGrindGymId = gym._id;
            break;
        case "stat_bonus":
            if (reward.stat === "maxStamina") {
                fighter.maxStamina = Math.min(150, (fighter.maxStamina || 100) + reward.value);
                fighter.stamina = Math.min(fighter.maxStamina, (fighter.stamina || 100) + reward.value);
            } else if (typeof fighter[reward.stat] === "number") {
                fighter[reward.stat] = Math.min(100, fighter[reward.stat] + reward.value);
                const xpKey = `${reward.stat}Xp`;
                const { newStat, newXp } = normalizeBankedXp(fighter[reward.stat], fighter[xpKey] ?? 0);
                fighter[reward.stat] = newStat;
                fighter[xpKey] = roundStatXp(newXp);
            }
            break;
        case "stat_cap_bonus":
        default:
            break;
    }

    if (!fighter.completedQuests) fighter.completedQuests = [];
    if (!fighter.completedQuests.includes(quest.id)) fighter.completedQuests.push(quest.id);
}

/**
 * Shared quest progression pipeline for training/fight events.
 * Handles unlock checks, progress update, capping, completion, and reward apply.
 */
async function processApplicableQuests({ fighterId, gymId, fighter, gym, buildUpdate }) {
    if (!hasValidGymMembership(fighter, gym)) return [];
    const applicable = await ensureQuestDocs(fighterId, gymId, gym.tier, gym.specialtyStats);
    const completedThisBatch = [];

    for (const quest of applicable) {
        if (fighter.completedQuests?.includes(quest.id)) continue;
        if (isQuestLockedForFighter(quest, fighter)) continue;

        let existing = await QuestProgress.findOne({ fighterId, gymId, questId: quest.id });
        if (existing?.status === "completed") continue;
        if (!existing) {
            await QuestProgress.findOneAndUpdate(
                { fighterId, gymId, questId: quest.id },
                {
                    $setOnInsert: {
                        fighterId,
                        gymId,
                        questId: quest.id,
                        status: "available",
                        progress: {},
                        completedAt: null,
                    },
                },
                { upsert: true }
            );
            existing = await QuestProgress.findOne({ fighterId, gymId, questId: quest.id });
        }
        if (!existing || existing.status === "completed") continue;

        const update = cleanupUpdate(buildUpdate(quest));
        if (!update.$inc && !update.$set) continue;

        let updated = await QuestProgress.findOneAndUpdate(
            { fighterId, gymId, questId: quest.id },
            update,
            { new: true }
        );
        updated = await clampQuestProgressDoc(quest, updated);

        if (!updated || !conditionsMet(quest, updated)) continue;

        await QuestProgress.findOneAndUpdate(
            { fighterId, gymId, questId: quest.id },
            { status: "completed", completedAt: new Date() }
        );
        await applyReward(fighter, gym, quest);
        completedThisBatch.push(quest);
    }

    if (completedThisBatch.length > 0) await fighter.save();
    return completedThisBatch;
}

/** Build per-training-session progress mutations. */
function buildTrainingUpdate({ fighter, gym, sessionType }) {
    const gymStatCap = (GYM_TIERS[gym.tier] || {}).statCap || 35;
    const sessionStats = TRAINING_SESSIONS[sessionType]?.stats || [];
    const isSpecialtySession = gym.specialtyStats?.some((s) => sessionStats.includes(s));
    const specialtyStat = gym.specialtyStats?.[0];

    return () => {
        const update = emptyUpdate();
        addInc(update, "gymTotalSessions");
        addInc(update, "gymTrainingSessions");
        if (sessionType === "sparring") addInc(update, "sparringSessions");
        if (sessionType === "film_study") addInc(update, "filmStudySessions");
        if (isSpecialtySession) addInc(update, "specialtyStatSessions");

        if (specialtyStat) {
            const specialtyKey = specialtyStat.toLowerCase();
            if ((fighter[specialtyKey] || 0) >= gymStatCap) setSnapshot(update, "specialtyStatAtCap", 1);
        }
        if (allStats60Plus(fighter)) setSnapshot(update, "allStats60Plus", 1);
        return update;
    };
}

/** Build per-fight progress mutations. */
function buildFightUpdate({ fighter, fight }) {
    const isWin = WIN_OUTCOMES.includes(fight.outcome);
    const isDecisionWin = DECISION_OUTCOMES.includes(fight.outcome);
    const isNationalPlus = NATIONAL_PLUS_TIERS.includes(fight.promotionTier);
    const isGcsTier = GCS_TIERS.includes(fight.promotionTier);

    return () => {
        const update = emptyUpdate();
        addInc(update, "fightsCompleted");
        if (isWin) addInc(update, "winsWhileEnrolled");
        if (isDecisionWin) addInc(update, "decisionWins");
        if (isNationalPlus) addInc(update, "nationalPlusFights");
        if (isGcsTier) addInc(update, "gcsFights");
        if (allStats60Plus(fighter)) setSnapshot(update, "allStats60Plus", 1);
        return update;
    };
}

/** Update quest progress after a training session. */
async function onTraining(fighterId, gymId, sessionType, fighter, gym) {
    return processApplicableQuests({
        fighterId,
        gymId,
        fighter,
        gym,
        buildUpdate: buildTrainingUpdate({ fighter, gym, sessionType }),
    });
}

/** Update quest progress after fight resolution. */
async function onFight(fighterId, fighter, fight) {
    let gymId = fighter.gymId;
    // Backward compatibility: older fighters may have null gymId.
    // In that case, use the most recently updated quest gym so win counters still progress.
    if (!gymId) {
        const lastQuest = await QuestProgress.findOne({ fighterId }).sort({ updatedAt: -1 }).select("gymId").lean();
        gymId = lastQuest?.gymId || null;
    }
    if (!gymId) return [];

    const gym = await Gym.findById(gymId);
    if (!gym) return [];

    return processApplicableQuests({
        fighterId,
        gymId,
        fighter,
        gym,
        buildUpdate: buildFightUpdate({ fighter, fight }),
    });
}

/** Read enriched quest progress for a fighter at a specific gym. */
async function getQuestProgress(fighterId, gymId) {
    const gym = await Gym.findById(gymId).lean();
    if (!gym) throw new Error("Gym not found");

    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    const applicable = await ensureQuestDocs(fighterId, gymId, gym.tier, gym.specialtyStats);
    const docs = await QuestProgress.find({ fighterId, gymId }).lean();
    const hasAccess = hasValidGymMembership(fighter, gym);

    return applicable.map((quest) => {
        const doc = docs.find((d) => d.questId === quest.id) || { progress: {}, status: "available" };
        const isDone = doc.status === "completed";
        const prereqLocked = isQuestLockedForFighter(quest, fighter);
        const membershipLocked = !hasAccess && !isDone;

        let status = doc.status;
        if (isDone) status = "completed";
        else if (membershipLocked) status = "membership_locked";
        else if (prereqLocked) status = "locked";

        const blockProgress = status === "locked" || status === "membership_locked";

        return {
            questId: quest.id,
            title: quest.title,
            description: quest.description,
            reward: quest.reward.description,
            requiresQuest: quest.requiresQuest || null,
            status,
            conditions: quest.conditions.map((cond) => {
                const rawCurrent = doc.progress?.[cond.key] ?? 0;
                const current = Math.min(rawCurrent, cond.target);
                return {
                    label: cond.label,
                    current: blockProgress ? 0 : current,
                    target: cond.target,
                    done: !blockProgress && rawCurrent >= cond.target,
                };
            }),
            completedAt: doc.completedAt || null,
        };
    });
}

/** Return Coach's Test cap bonus at this gym (0 or 3). */
async function getStatCapBonus(fighterId, gymId) {
    const doc = await QuestProgress.findOne({
        fighterId,
        gymId,
        questId: "coaches_test",
        status: "completed",
    }).lean();
    return doc ? 3 : 0;
}

module.exports = { onTraining, onFight, getQuestProgress, getStatCapBonus };
