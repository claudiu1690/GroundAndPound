/**
 * GDD 7.4 — Gym Side Quest service.
 * Tracks per-fighter-per-gym quest progress and applies rewards on completion.
 */
const Fighter = require("../models/fighterModel");
const Gym = require("../models/gymModel");
const QuestProgress = require("../models/questProgressModel");
const { QUEST_DEFINITIONS, TIER_ORDER, getQuestsForGym } = require("../consts/questDefinitions");
const { GYM_TIERS } = require("../consts/gameConstants");

const NATIONAL_PLUS = ["National", "GCS Contender", "GCS"];

// ─── helpers ────────────────────────────────────────────────────────────────

/** Ensure a QuestProgress doc exists for every applicable quest at this gym. */
async function ensureQuestDocs(fighterId, gymId, gymTier, gymSpecialtyStats) {
    const applicable = getQuestsForGym(gymTier, gymSpecialtyStats);
    for (const q of applicable) {
        await QuestProgress.findOneAndUpdate(
            { fighterId, gymId, questId: q.id },
            { $setOnInsert: { fighterId, gymId, questId: q.id, status: "available", progress: {}, completedAt: null } },
            { upsert: true, new: false }
        );
    }
}

/** Check if all conditions of a quest are met given the current progress doc and fighter snapshot. */
function conditionsMet(quest, progressDoc, fighter, gymStatCap) {
    for (const cond of quest.conditions) {
        const val = progressDoc.progress[cond.key] ?? 0;
        if (cond.key === "specialtyStatAtCap") {
            // snapshot: check whether the fighter's specialty stat is at or near cap
            if (val < cond.target) return false;
        } else if (cond.key === "allStats60Plus") {
            if (val < cond.target) return false;
        } else {
            if (val < cond.target) return false;
        }
    }
    return true;
}

/** Apply the quest reward to the fighter (mutates fighter doc, caller must save). */
async function applyReward(fighter, gym, quest) {
    const reward = quest.reward;
    switch (reward.type) {
        case "perk":
            if (reward.perkId === "ironWill")       fighter.activePerks.ironWill = true;
            if (reward.perkId === "apexRegimen")    fighter.activePerks.apexRegimen = true;
            if (reward.perkId === "specialistStat" && gym.specialtyStats?.length) {
                fighter.activePerks.specialistStat = gym.specialtyStats[0];
            }
            if (reward.perkId === "theGrind") {
                fighter.activePerks.theGrindGymId = gym._id;
            }
            break;
        case "stat_bonus":
            if (reward.stat === "maxStamina") {
                fighter.maxStamina = Math.min(150, (fighter.maxStamina || 100) + reward.value);
                fighter.stamina    = Math.min(fighter.maxStamina, (fighter.stamina || 100) + reward.value);
            } else if (typeof fighter[reward.stat] === "number") {
                fighter[reward.stat] = Math.min(100, fighter[reward.stat] + reward.value);
            }
            break;
        case "stat_cap_bonus":
            // Tracked as a QuestProgress completion + lookup at training time (no fighter field needed).
            break;
        default:
            break;
    }
    if (!fighter.completedQuests) fighter.completedQuests = [];
    if (!fighter.completedQuests.includes(quest.id)) {
        fighter.completedQuests.push(quest.id);
    }
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Call after every training session.
 * @param {string} fighterId
 * @param {string} gymId
 * @param {string} sessionType  - e.g. "sparring", "film_study", "bag_work"
 * @param {Object} fighter      - Mongoose doc (unsaved)
 * @param {Object} gym          - Mongoose doc
 */
async function onTraining(fighterId, gymId, sessionType, fighter, gym) {
    const gymTier = gym.tier;
    const gymStatCap = (GYM_TIERS[gymTier] || {}).statCap || 35;
    await ensureQuestDocs(fighterId, gymId, gymTier, gym.specialtyStats);

    const applicable = getQuestsForGym(gymTier, gym.specialtyStats);
    const completedThisBatch = [];

    for (const quest of applicable) {
        if (fighter.completedQuests?.includes(quest.id)) continue;
        // Don't progress locked quests (prerequisite not completed)
        if (quest.requiresQuest && !fighter.completedQuests?.includes(quest.requiresQuest)) continue;
        const doc = await QuestProgress.findOne({ fighterId, gymId, questId: quest.id });
        if (!doc || doc.status === "completed") continue;

        const update = { $inc: {} };

        // Increment general counters
        update.$inc["progress.gymTotalSessions"]    = 1;
        update.$inc["progress.gymTrainingSessions"] = 1;
        if (sessionType === "sparring")    update.$inc["progress.sparringSessions"]  = 1;
        if (sessionType === "film_study")  update.$inc["progress.filmStudySessions"] = 1;

        // Specialty stat sessions
        const isSpecialty = gym.specialtyStats?.some((s) =>
            (require("../consts/gameConstants").TRAINING_SESSIONS[sessionType]?.stats || []).includes(s)
        );
        if (isSpecialty) update.$inc["progress.specialtyStatSessions"] = 1;

        // Snapshot: specialty stat at cap
        const specialtyStat = gym.specialtyStats?.[0];
        if (specialtyStat) {
            const statKey = specialtyStat.toLowerCase();
            if ((fighter[statKey] || 0) >= gymStatCap) {
                update.$set = { "progress.specialtyStatAtCap": 1 };
            }
        }

        // Snapshot: all stats 60+
        const statKeys = ["str","spd","leg","wre","gnd","sub","chn","fiq"];
        if (statKeys.every((k) => (fighter[k] || 0) >= 60)) {
            update.$set = { ...(update.$set || {}), "progress.allStats60Plus": 1 };
        }

        const updated = await QuestProgress.findOneAndUpdate(
            { fighterId, gymId, questId: quest.id },
            update,
            { new: true }
        );

        if (updated && conditionsMet(quest, updated, fighter, gymStatCap)) {
            await QuestProgress.findOneAndUpdate(
                { fighterId, gymId, questId: quest.id },
                { status: "completed", completedAt: new Date() }
            );
            await applyReward(fighter, gym, quest);
            completedThisBatch.push(quest);
        }
    }

    if (completedThisBatch.length > 0) {
        await fighter.save();
    }

    return completedThisBatch;
}

/**
 * Call after every fight resolution.
 * @param {string} fighterId
 * @param {Object} fighter      - Mongoose doc (already updated with new record)
 * @param {Object} fight        - Mongoose doc (completed, populated opponentId)
 */
async function onFight(fighterId, fighter, fight) {
    const gymId = fighter.gymId;
    if (!gymId) return [];

    const gym = await Gym.findById(gymId);
    if (!gym) return [];

    await ensureQuestDocs(fighterId, gymId, gym.tier, gym.specialtyStats);
    const applicable = getQuestsForGym(gym.tier, gym.specialtyStats);
    const completedThisBatch = [];
    const gymStatCap = (GYM_TIERS[gym.tier] || {}).statCap || 35;

    const isWin  = ["KO/TKO","Submission","Decision (unanimous)","Decision (split)"].includes(fight.outcome);
    const isDecisionWin = ["Decision (unanimous)","Decision (split)"].includes(fight.outcome);
    const isNationalPlus = NATIONAL_PLUS.includes(fight.promotionTier);
    const isGcs  = ["GCS Contender","GCS"].includes(fight.promotionTier);

    for (const quest of applicable) {
        if (fighter.completedQuests?.includes(quest.id)) continue;
        // Don't progress locked quests (prerequisite not completed)
        if (quest.requiresQuest && !fighter.completedQuests?.includes(quest.requiresQuest)) continue;
        const doc = await QuestProgress.findOne({ fighterId, gymId, questId: quest.id });
        if (!doc || doc.status === "completed") continue;

        const update = { $inc: {} };
        update.$inc["progress.fightsCompleted"]    = 1;
        if (isWin)           update.$inc["progress.winsWhileEnrolled"] = 1;
        if (isDecisionWin)   update.$inc["progress.decisionWins"]      = 1;
        if (isNationalPlus)  update.$inc["progress.nationalPlusFights"] = 1;
        if (isGcs)           update.$inc["progress.gcsFights"]          = 1;

        // Snapshot: all stats 60+
        const statKeys = ["str","spd","leg","wre","gnd","sub","chn","fiq"];
        if (statKeys.every((k) => (fighter[k] || 0) >= 60)) {
            update.$set = { "progress.allStats60Plus": 1 };
        }

        const updated = await QuestProgress.findOneAndUpdate(
            { fighterId, gymId, questId: quest.id },
            update,
            { new: true }
        );

        if (updated && conditionsMet(quest, updated, fighter, gymStatCap)) {
            await QuestProgress.findOneAndUpdate(
                { fighterId, gymId, questId: quest.id },
                { status: "completed", completedAt: new Date() }
            );
            await applyReward(fighter, gym, quest);
            completedThisBatch.push(quest);
        }
    }

    if (completedThisBatch.length > 0) {
        await fighter.save();
    }

    return completedThisBatch;
}

/**
 * Get all quest progress for a fighter at a gym, enriched with definition metadata.
 */
async function getQuestProgress(fighterId, gymId) {
    const gym = await Gym.findById(gymId).lean();
    if (!gym) throw new Error("Gym not found");

    await ensureQuestDocs(fighterId, gymId, gym.tier, gym.specialtyStats);

    const docs = await QuestProgress.find({ fighterId, gymId }).lean();
    const applicable = getQuestsForGym(gym.tier, gym.specialtyStats);

    // Build set of completed quest IDs for prerequisite checks
    const completedQuestIds = new Set(docs.filter((d) => d.status === "completed").map((d) => d.questId));

    return applicable.map((quest) => {
        const doc = docs.find((d) => d.questId === quest.id) || { progress: {}, status: "available" };

        // If this quest requires a prerequisite that isn't done yet, mark as locked
        const isLocked = quest.requiresQuest && !completedQuestIds.has(quest.requiresQuest);

        return {
            questId: quest.id,
            title: quest.title,
            description: quest.description,
            reward: quest.reward.description,
            requiresQuest: quest.requiresQuest || null,
            status: isLocked ? "locked" : doc.status,
            conditions: quest.conditions.map((c) => ({
                label: c.label,
                current: isLocked ? 0 : (doc.progress[c.key] ?? 0),
                target: c.target,
                done: !isLocked && (doc.progress[c.key] ?? 0) >= c.target
            })),
            completedAt: doc.completedAt || null
        };
    });
}

/**
 * Get the stat-cap bonus granted by the Coach's Test at a specific gym.
 * Returns 0 or 3 (the only possible value right now).
 */
async function getStatCapBonus(fighterId, gymId) {
    const doc = await QuestProgress.findOne({ fighterId, gymId, questId: "coaches_test", status: "completed" }).lean();
    return doc ? 3 : 0;
}

module.exports = { onTraining, onFight, getQuestProgress, getStatCapBonus };
