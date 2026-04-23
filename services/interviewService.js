const Fighter = require("../models/fighterModel");
const Fight = require("../models/fightModel");
const Opponent = require("../models/opponentModel");
const notorietyService = require("./notorietyService");
const {
    INTERVIEW_CHOICES,
    INTERVIEW_CHOICE_KEYS,
    CALLOUT_CANDIDATE_LIMIT,
} = require("../consts/interviewConfig");

/**
 * Promotion tier ordering for stretch-tier lookups.
 */
const TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];

function tierAbove(tier) {
    const idx = TIER_ORDER.indexOf(tier);
    if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
    return TIER_ORDER[idx + 1];
}

/**
 * Candidate opponents for the callout tone — same weight class, same or +1 tier,
 * excluding the opponent just fought.
 * @param {string} fighterId
 * @param {string} excludeOpponentId
 */
async function listCalloutCandidates(fighterId, excludeOpponentId) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    const tiers = [fighter.promotionTier];
    const stretchTier = tierAbove(fighter.promotionTier);
    if (stretchTier) tiers.push(stretchTier);

    const query = {
        weightClass: fighter.weightClass,
        promotionTier: { $in: tiers },
    };
    if (excludeOpponentId) query._id = { $ne: excludeOpponentId };

    const list = await Opponent
        .find(query)
        .sort({ overallRating: -1 })
        .limit(CALLOUT_CANDIDATE_LIMIT)
        .select("name nickname overallRating style promotionTier record")
        .lean();

    return list.map((o) => ({
        id: String(o._id),
        name: o.name,
        nickname: o.nickname,
        overallRating: o.overallRating,
        style: o.style,
        promotionTier: o.promotionTier,
        record: o.record || { wins: 0, losses: 0, draws: 0 },
        isStretch: o.promotionTier !== fighter.promotionTier,
    }));
}

/**
 * Resolve the post-fight interview for a given fight.
 * Idempotent: once `fight.interview.done` is true, further calls return the stored result.
 * @param {object} params
 * @param {string} params.fighterId
 * @param {string} params.fightId
 * @param {"HUMBLE"|"CONFIDENT"|"CALLOUT"|"SKIPPED"} params.choice
 * @param {string} [params.targetOpponentId] required when choice === "CALLOUT"
 */
async function resolveInterview({ fighterId, fightId, choice, targetOpponentId }) {
    if (!INTERVIEW_CHOICE_KEYS.includes(choice) && choice !== "SKIPPED") {
        throw new Error("Invalid interview choice");
    }

    const fight = await Fight.findById(fightId);
    if (!fight) throw new Error("Fight not found");
    if (String(fight.fighterId) !== String(fighterId)) {
        throw new Error("Fight does not belong to this fighter");
    }
    if (fight.status !== "completed") {
        throw new Error("Fight is not completed");
    }
    if (fight.interview?.done) {
        return {
            alreadyDone: true,
            interview: fight.interview,
        };
    }

    // Handle skip early — no rewards, just mark.
    if (choice === "SKIPPED") {
        fight.interview = {
            done: true,
            choice: "SKIPPED",
            targetOpponentId: null,
            fameGained: 0,
            resolvedAt: new Date(),
        };
        await fight.save();
        return {
            alreadyDone: false,
            interview: fight.interview,
            fameDelta: 0,
            fameReason: "Interview skipped",
        };
    }

    const def = INTERVIEW_CHOICES[choice];
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    // CALLOUT needs a valid target opponent (same weight class, same or +1 tier, not the just-fought one).
    let targetOpponent = null;
    if (def.requiresTarget) {
        if (!targetOpponentId) throw new Error("Target opponent required for call-out");
        if (String(targetOpponentId) === String(fight.opponentId)) {
            throw new Error("Cannot call out the fighter you just beat — pick someone new");
        }
        targetOpponent = await Opponent.findById(targetOpponentId).lean();
        if (!targetOpponent) throw new Error("Target opponent not found");
        if (targetOpponent.weightClass !== fighter.weightClass) {
            throw new Error("Target must share your weight class");
        }
        const allowedTiers = [fighter.promotionTier];
        const stretch = tierAbove(fighter.promotionTier);
        if (stretch) allowedTiers.push(stretch);
        if (!allowedTiers.includes(targetOpponent.promotionTier)) {
            throw new Error("Target is outside your callable tier range");
        }
    }

    // Apply fame (obeys freeze — a frozen fighter gets 0 from an interview).
    const fameReason = def.requiresTarget
        ? def.reasonTemplate.replace("{name}", targetOpponent.name)
        : def.reasonTemplate;
    const { applied } = notorietyService.applyNotorietyDelta(fighter, def.fameReward, {
        code: def.fameCode,
        reason: fameReason,
        meta: { fightId: fight._id, interviewChoice: choice },
    });
    notorietyService.touchLastEvent(fighter);

    // Beef / Respect flags
    if (def.emitBeefFlag && targetOpponent) {
        fighter.beefFlags = fighter.beefFlags || [];
        const existing = fighter.beefFlags.find((f) => String(f.opponentId) === String(targetOpponent._id));
        if (existing) {
            existing.expiresAfterFights = def.beefExpiresAfterFights;
            existing.createdAt = new Date();
            existing.source = "INTERVIEW";
        } else {
            fighter.beefFlags.push({
                opponentId: targetOpponent._id,
                opponentName: targetOpponent.name,
                source: "INTERVIEW",
                expiresAfterFights: def.beefExpiresAfterFights,
                createdAt: new Date(),
            });
        }
    }
    if (def.emitRespectFlag) {
        // Only write respect for a win; losing and saying "good fight" is just humble filler with no reward hook.
        const isWin = ["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"].includes(fight.outcome);
        if (isWin && fight.opponentId) {
            const opp = await Opponent.findById(fight.opponentId).lean();
            fighter.respectFlags = fighter.respectFlags || [];
            const existing = fighter.respectFlags.find((f) => String(f.opponentId) === String(fight.opponentId));
            if (!existing) {
                fighter.respectFlags.push({
                    opponentId: fight.opponentId,
                    opponentName: opp?.name || "",
                    source: "INTERVIEW",
                    expiresAfterFights: 6,
                    createdAt: new Date(),
                });
            }
        }
    }

    // Persist fight + fighter
    fight.interview = {
        done: true,
        choice,
        targetOpponentId: targetOpponent?._id || null,
        fameGained: applied,
        resolvedAt: new Date(),
    };
    await fight.save();
    await fighter.save();

    return {
        alreadyDone: false,
        interview: fight.interview,
        fameDelta: applied,
        fameReason,
        targetOpponent: targetOpponent
            ? {
                  id: String(targetOpponent._id),
                  name: targetOpponent.name,
                  nickname: targetOpponent.nickname,
                  overallRating: targetOpponent.overallRating,
              }
            : null,
    };
}

/**
 * Build a lightweight payload describing the interview opportunity for a given fight,
 * or null if the fight is not found / not completed / not yours.
 */
async function getInterviewStateForFight(fighterId, fightId) {
    const fight = await Fight.findById(fightId).lean();
    if (!fight) return null;
    if (String(fight.fighterId) !== String(fighterId)) return null;
    if (fight.status !== "completed") return null;
    return {
        fightId: String(fight._id),
        opponentId: fight.opponentId ? String(fight.opponentId) : null,
        interview: fight.interview || { done: false },
    };
}

module.exports = {
    resolveInterview,
    listCalloutCandidates,
    getInterviewStateForFight,
};
