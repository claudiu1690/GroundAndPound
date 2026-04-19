const Gym = require("../models/gymModel");

/**
 * Get or initialize a fighter's rank progress at a gym.
 */
function getOrInitRank(fighter, gymSlug) {
    if (!fighter.gymRanks) fighter.gymRanks = {};
    if (!fighter.gymRanks[gymSlug]) {
        fighter.gymRanks[gymSlug] = {
            rank: 1,
            trainingSessions: 0,
            relevantWins: 0,
        };
        fighter.markModified("gymRanks");
    }
    return fighter.gymRanks[gymSlug];
}

/**
 * Check if a fighter qualifies for the next rank at a gym and apply the rank-up.
 * Returns { rankedUp, newRank, unlockDescription } or null.
 */
function checkRankUp(fighter, gym) {
    if (gym.isFreeGym || !gym.ranks || gym.ranks.length === 0) return null;

    const progress = getOrInitRank(fighter, gym.slug);
    const currentRank = progress.rank;
    if (currentRank >= 4) return null; // max rank

    const nextRankDef = gym.ranks.find((r) => r.rank === currentRank + 1);
    if (!nextRankDef) return null;

    const req = nextRankDef.requirements;
    if (progress.trainingSessions < req.trainingSessions) return null;
    if (progress.relevantWins < req.relevantWins) return null;
    // Iron cost is checked and deducted separately (not automatic)

    // Check if iron cost is 0 (auto rank-up) or needs manual trigger
    if (req.ironCost > 0) return null; // requires manual rank-up with iron payment

    // Auto rank-up (rank 1→2 typically)
    return applyRankUp(fighter, gym, nextRankDef);
}

/**
 * Attempt a manual rank-up (for ranks that require iron payment).
 * Returns { rankedUp, newRank, unlockDescription } or throws.
 */
function attemptManualRankUp(fighter, gym) {
    if (gym.isFreeGym) throw new Error("Free gym has no ranks");

    const progress = getOrInitRank(fighter, gym.slug);
    const currentRank = progress.rank;
    if (currentRank >= 4) throw new Error("Already at maximum rank");

    const nextRankDef = gym.ranks.find((r) => r.rank === currentRank + 1);
    if (!nextRankDef) throw new Error("No next rank defined");

    const req = nextRankDef.requirements;
    if (progress.trainingSessions < req.trainingSessions) {
        throw new Error(`Need ${req.trainingSessions} training sessions (have ${progress.trainingSessions})`);
    }
    if (progress.relevantWins < req.relevantWins) {
        throw new Error(`Need ${req.relevantWins} relevant wins (have ${progress.relevantWins})`);
    }
    if (req.ironCost > 0 && (fighter.iron ?? 0) < req.ironCost) {
        throw new Error(`Need ${req.ironCost} iron (have ${fighter.iron ?? 0})`);
    }

    // Deduct iron
    if (req.ironCost > 0) {
        fighter.iron = (fighter.iron ?? 0) - req.ironCost;
    }

    return applyRankUp(fighter, gym, nextRankDef);
}

/**
 * Apply the rank-up and its unlock.
 */
function applyRankUp(fighter, gym, rankDef) {
    const progress = getOrInitRank(fighter, gym.slug);
    progress.rank = rankDef.rank;
    fighter.markModified("gymRanks");

    let unlockDescription = `Ranked up to ${rankDef.name}`;

    const unlock = rankDef.unlock;
    if (unlock) {
        switch (unlock.type) {
            case "session":
                unlockDescription += ` — unlocked ${unlock.sessionKey} session`;
                break;
            case "xpBonus":
                unlockDescription += ` — +${unlock.xpBonusPct}% XP to focus stats permanently`;
                break;
            case "perk":
                // Grant the perk
                fighter.gymPerks = fighter.gymPerks || [];
                if (!fighter.gymPerks.includes(unlock.perkId)) {
                    fighter.gymPerks.push(unlock.perkId);
                }
                // Grant the badge
                if (unlock.badge) {
                    fighter.badges = fighter.badges || [];
                    if (!fighter.badges.includes(unlock.badge)) {
                        fighter.badges.push(unlock.badge);
                    }
                }
                // Iron Shins grants a one-time permanent +1 Max Stamina on unlock.
                if (unlock.perkId === "iron_shins") {
                    fighter.maxStamina = (fighter.maxStamina || 100) + 1;
                }
                unlockDescription += ` — earned perk: ${unlock.perkName || unlock.perkId} and badge: ${unlock.badge}`;
                break;
        }
    }

    return { rankedUp: true, newRank: rankDef.rank, rankName: rankDef.name, unlockDescription };
}

/**
 * Increment training session count for a gym.
 */
function incrementTrainingSessions(fighter, gymSlug) {
    const progress = getOrInitRank(fighter, gymSlug);
    progress.trainingSessions += 1;
    fighter.markModified("gymRanks");
}

/**
 * After a fight win, increment relevantWins for all gyms where the win type matches.
 */
async function onFightWin(fighter, outcome) {
    if (!fighter.gymRanks) return [];
    // Only the currently active paid gym gets credit for the win
    if (!fighter.activeGymId) return [];
    if (!fighter.activeGymPaidUntil || new Date(fighter.activeGymPaidUntil) <= new Date()) return [];

    const gym = await Gym.findById(fighter.activeGymId).lean();
    if (!gym || gym.isFreeGym) return [];

    const progress = fighter.gymRanks[gym.slug];
    if (!progress) return [];

    // Check if this outcome counts as a relevant win for this gym
    if (!gym.relevantWinTypes || !gym.relevantWinTypes.includes(outcome)) return [];

    progress.relevantWins += 1;
    fighter.markModified("gymRanks");

    const rankUps = [];
    const result = checkRankUp(fighter, gym);
    if (result) rankUps.push({ gym: gym.name, ...result });

    return rankUps;
}

/**
 * Get enriched gym progress for a fighter at a specific gym.
 */
function getGymProgress(fighter, gym) {
    if (gym.isFreeGym) return { rank: 0, rankName: "Free Gym", progress: null, nextRank: null, hasJoined: false };

    // Read-only: don't create rank entries just for display
    const progress = fighter.gymRanks?.[gym.slug];
    if (!progress) {
        // Never joined this gym
        const firstRank = gym.ranks?.find((r) => r.rank === 1);
        const secondRank = gym.ranks?.find((r) => r.rank === 2);
        return {
            rank: 0, rankName: null, trainingSessions: 0, relevantWins: 0,
            hasXpBonus: false, xpBonusPct: 0, hasPerk: false, perkId: null, hasJoined: false,
            nextRank: firstRank ? { rank: 1, name: firstRank.name, requirements: firstRank.requirements, unlock: firstRank.unlock, canRankUp: false, needsIron: false } : null,
        };
    }
    const currentRank = progress.rank;
    const currentRankDef = gym.ranks.find((r) => r.rank === currentRank);
    const nextRankDef = gym.ranks.find((r) => r.rank === currentRank + 1);

    // Check if rank 3 XP bonus is active
    const rank3 = gym.ranks.find((r) => r.rank === 3);
    const hasXpBonus = rank3 && currentRank >= 3;

    return {
        rank: currentRank,
        rankName: currentRankDef?.name ?? `Rank ${currentRank}`,
        trainingSessions: progress.trainingSessions,
        relevantWins: progress.relevantWins,
        hasJoined: true,
        hasXpBonus,
        xpBonusPct: hasXpBonus ? (rank3.unlock?.xpBonusPct ?? 5) : 0,
        hasPerk: currentRank >= 4,
        perkId: currentRank >= 4 ? gym.ranks[3]?.unlock?.perkId : null,
        nextRank: nextRankDef ? {
            rank: nextRankDef.rank,
            name: nextRankDef.name,
            requirements: nextRankDef.requirements,
            unlock: nextRankDef.unlock,
            canRankUp: progress.trainingSessions >= nextRankDef.requirements.trainingSessions
                && progress.relevantWins >= nextRankDef.requirements.relevantWins,
            needsIron: nextRankDef.requirements.ironCost > 0,
        } : null,
    };
}

/**
 * Check if a fighter has a specific gym perk active.
 */
function hasPerk(fighter, perkId) {
    return (fighter.gymPerks || []).includes(perkId);
}

/**
 * Get the rank 2 session key if unlocked at a gym.
 */
function getRank2Session(fighter, gym) {
    if (gym.isFreeGym) return null;
    const progress = fighter.gymRanks?.[gym.slug];
    if (!progress || progress.rank < 2) return null;
    const rank2 = gym.ranks.find((r) => r.rank === 2);
    return rank2?.unlock?.sessionKey ?? null;
}

module.exports = {
    getOrInitRank,
    checkRankUp,
    attemptManualRankUp,
    incrementTrainingSessions,
    onFightWin,
    getGymProgress,
    hasPerk,
    getRank2Session,
};
