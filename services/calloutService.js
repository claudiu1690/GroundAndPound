const Fighter = require("../models/fighterModel");
const Opponent = require("../models/opponentModel");
const notorietyService = require("./notorietyService");
const personaService = require("./personaService");
const rankingService = require("./rankingService");
const {
    computeCalloutCost,
    stretchTierFor,
} = require("../consts/calloutConfig");

const ROSTER_LIMIT_PER_TIER = 12; // show up to 12 callable targets per section

/**
 * Build the roster of callable opponents for a fighter.
 *
 * v1.1 — Rank-gated targets:
 *   - Player must be ranked top 15 (1-15) for callouts to be available at all.
 *   - Same-tier targets: only NPCs ranked ABOVE the player (lower fixedRank), excluding
 *     rank 1 (champion — handled via title shot, not callouts).
 *   - Stretch-tier targets: all NPCs in the next tier up (no rank filter).
 *
 * Returns { eligible, currentRank, sameTier, stretchTier, ... }. When ineligible,
 * sameTier and stretchTier are empty arrays.
 */
async function listRoster(fighterId) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    const playerRank = fighter.ranking?.rank ?? null;
    const eligible = rankingService.isCalloutEligible(fighter);
    const stretch = stretchTierFor(fighter.promotionTier);
    const excludeIds = [];
    if (fighter.nemesis?.opponentId) excludeIds.push(fighter.nemesis.opponentId);
    if (fighter.activeCallout?.opponentId) excludeIds.push(fighter.activeCallout.opponentId);

    const baseQuery = {
        weightClass: fighter.weightClass,
        isChampion: { $ne: true },
    };
    if (excludeIds.length) baseQuery._id = { $nin: excludeIds };

    // Persona (Villain) callout-cost multiplier applied to displayed costs.
    const calloutCostMult = personaService.getModifiers(fighter).calloutCostMult || 1;

    let sameTierList = [];
    let stretchList = [];

    if (eligible) {
        // Same-tier: rank above the player (lower fixedRank), excluding the champion (rank 1).
        const sameTierQuery = {
            ...baseQuery,
            promotionTier: fighter.promotionTier,
            fixedRank: { $gt: 1, $lt: playerRank },
        };
        const stretchPromise = stretch
            ? Opponent.find({ ...baseQuery, promotionTier: stretch })
                .sort({ fixedRank: 1 })
                .limit(ROSTER_LIMIT_PER_TIER)
                .lean()
            : Promise.resolve([]);
        const [same, str] = await Promise.all([
            Opponent.find(sameTierQuery)
                .sort({ fixedRank: 1 })
                .limit(ROSTER_LIMIT_PER_TIER)
                .lean(),
            stretchPromise,
        ]);
        sameTierList = same;
        stretchList = str;
    }

    const shape = (o, isStretch) => ({
        id: String(o._id),
        name: o.name,
        nickname: o.nickname,
        style: o.style,
        overallRating: o.overallRating,
        promotionTier: o.promotionTier,
        // Display rank: NPC at/below player's rank shifts +1; stretch tier opponents
        // keep their own tier's fixedRank (cross-tier shift doesn't apply). Then shift
        // to display rank (champion → null, contenders shift down by 1).
        rank: rankingService.toDisplayRank(
            isStretch
                ? (o.fixedRank ?? null)
                : rankingService.displayRankForNpc(o.fixedRank, playerRank)
        ),
        record: o.record || { wins: 0, losses: 0, draws: 0 },
        cost: Math.round(computeCalloutCost(fighter, o) * calloutCostMult),
        isStretch,
    });

    const displayPlayerRank = rankingService.toDisplayRank(playerRank);
    const displayThreshold = rankingService.CALLOUT_RANK_THRESHOLD - 1;
    return {
        fame: fighter?.notoriety?.score || 0,
        eligible,
        currentRank: displayPlayerRank,
        rankThreshold: displayThreshold,
        lockedReason: eligible
            ? null
            : (playerRank == null
                ? "Reach the rankings first (fight at least 3 fights in your tier)"
                : `Reach top ${displayThreshold} to unlock callouts — currently #${displayPlayerRank}`),
        active: fighter.activeCallout?.opponentId ? {
            opponentId: String(fighter.activeCallout.opponentId),
            opponentName: fighter.activeCallout.opponentName,
            cost: fighter.activeCallout.cost,
            calledAt: fighter.activeCallout.calledAt,
            isStretch: fighter.activeCallout.isStretch,
        } : null,
        sameTier:    sameTierList.map((o) => shape(o, false)),
        stretchTier: stretchList.map((o) => shape(o, true)),
        stretchLabel: stretch,
    };
}

/**
 * Spend fame to create an active callout. Throws on validation errors.
 */
async function createCallout(fighterId, opponentId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    if (fighter.activeCallout?.opponentId) {
        throw new Error("You already have an active callout — cancel it first");
    }

    // v1.1 — rank gate. Player must be top 15 (DB rank ≤ 15) to call out anyone.
    if (!rankingService.isCalloutEligible(fighter)) {
        const rank = fighter.ranking?.rank;
        const displayThreshold = rankingService.CALLOUT_RANK_THRESHOLD - 1;
        throw new Error(
            rank == null
                ? "Callouts unlock after you enter the rankings (3 fights in your tier)"
                : `Callouts require top ${displayThreshold} — currently #${rankingService.toDisplayRank(rank)}`
        );
    }

    const opponent = await Opponent.findById(opponentId).lean();
    if (!opponent) throw new Error("Opponent not found");
    if (opponent.weightClass !== fighter.weightClass) throw new Error("Wrong weight class");
    if (opponent.isChampion) throw new Error("Cannot call out a champion");

    const stretch = stretchTierFor(fighter.promotionTier);
    const isStretch = opponent.promotionTier !== fighter.promotionTier;
    if (isStretch) {
        if (opponent.promotionTier !== stretch) throw new Error("Opponent is outside your callable tier range");
    } else {
        // v1.1 — same-tier callouts must target a higher-ranked opponent.
        const playerRank = fighter.ranking.rank;
        const oppRank = opponent.fixedRank;
        if (typeof oppRank !== "number" || oppRank >= playerRank) {
            throw new Error("Same-tier callouts must target a fighter ranked above you");
        }
        if (oppRank === 1) {
            throw new Error("Cannot call out the champion — use a title shot instead");
        }
    }

    // Persona (Villain) callout-cost multiplier — must match the listRoster display.
    const calloutCostMult = personaService.getModifiers(fighter).calloutCostMult || 1;
    const cost = Math.round(computeCalloutCost(fighter, opponent) * calloutCostMult);
    if ((fighter.notoriety?.score || 0) < cost) {
        throw new Error(`Not enough fame — need ${cost.toLocaleString()}`);
    }

    // Spend fame (logs a SPEND event via applyNotorietyDelta). skipFloor: true so a Legend
    // calling out a premium target isn't stopped by their tier floor.
    const { applied } = notorietyService.applyNotorietyDelta(fighter, -cost, {
        skipFloor: true,
        code: "CALLOUT_COST",
        reason: `Called out ${opponent.name}`,
        meta: { opponentId: opponent._id },
    });
    notorietyService.touchLastEvent(fighter);

    fighter.activeCallout = {
        opponentId: opponent._id,
        opponentName: opponent.name,
        cost: Math.abs(applied),
        isStretch,
        calledAt: new Date(),
    };
    await fighter.save();

    return {
        activeCallout: {
            opponentId: String(opponent._id),
            opponentName: opponent.name,
            cost: Math.abs(applied),
            isStretch,
            calledAt: fighter.activeCallout.calledAt,
        },
        fameAfter: fighter.notoriety.score,
    };
}

/**
 * Cancel an active callout. Refunds the fame in full (minus nothing — spending already
 * triggered the SPEND event, so we just credit back).
 */
async function cancelCallout(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    if (!fighter.activeCallout?.opponentId) throw new Error("No active callout");

    const refund = fighter.activeCallout.cost || 0;
    const name = fighter.activeCallout.opponentName || "opponent";
    if (refund > 0) {
        notorietyService.applyNotorietyDelta(fighter, refund, {
            skipFreezeBlock: true,
            code: "CALLOUT_REFUND",
            reason: `Cancelled callout on ${name}`,
            meta: { opponentId: fighter.activeCallout.opponentId },
        });
    }
    fighter.activeCallout = {
        opponentId: null,
        opponentName: null,
        cost: 0,
        isStretch: false,
        calledAt: null,
    };
    await fighter.save();
    return { refunded: refund, fameAfter: fighter.notoriety.score };
}

/**
 * In-memory helper used by generateOffers: swap the called-out opponent into the
 * Hard slot. If the opponent is already present in the offers, do nothing.
 * @param {object} fighter mongoose doc
 * @param {Array} offers
 * @returns {Promise<Array>} possibly-modified offers
 */
async function injectIntoOffers(fighter, offers) {
    const ac = fighter?.activeCallout;
    if (!ac?.opponentId) return offers;
    // Skip if already present (sometimes the random roll lands on them).
    if (offers.some((o) => String(o.opponent?._id) === String(ac.opponentId))) return offers;

    const opp = await Opponent.findById(ac.opponentId).lean();
    if (!opp) return offers;

    const hardSlotIdx = offers.findIndex((o) => o.type === "Hard");
    const calloutOffer = {
        type: "Hard",
        opponent: opp,
        context: null, // built by caller via buildOfferContext
        isCallout: true,
        calloutMeta: {
            cost: ac.cost,
            isStretch: !!ac.isStretch,
            calledAt: ac.calledAt,
        },
    };
    if (hardSlotIdx >= 0) {
        const replaced = [...offers];
        replaced[hardSlotIdx] = { ...calloutOffer, context: offers[hardSlotIdx].context };
        return replaced;
    }
    return [...offers, calloutOffer];
}

/** Clear an active callout (used by fightService when the called fight resolves). */
async function clearActiveCallout(fighter) {
    if (!fighter?.activeCallout?.opponentId) return;
    fighter.activeCallout = {
        opponentId: null,
        opponentName: null,
        cost: 0,
        isStretch: false,
        calledAt: null,
    };
}

module.exports = {
    listRoster,
    createCallout,
    cancelCallout,
    injectIntoOffers,
    clearActiveCallout,
};
