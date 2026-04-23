const Fighter = require("../models/fighterModel");
const Opponent = require("../models/opponentModel");
const notorietyService = require("./notorietyService");
const {
    computeCalloutCost,
    stretchTierFor,
} = require("../consts/calloutConfig");

const ROSTER_LIMIT_PER_TIER = 8; // show up to 8 same-tier + 8 stretch-tier

/**
 * Build the roster of callable opponents for a fighter.
 * Returns { sameTier: [...], stretchTier: [...] } each decorated with cost + isStretch.
 */
async function listRoster(fighterId) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    const stretch = stretchTierFor(fighter.promotionTier);
    const excludeIds = [];
    if (fighter.nemesis?.opponentId) excludeIds.push(fighter.nemesis.opponentId);
    if (fighter.activeCallout?.opponentId) excludeIds.push(fighter.activeCallout.opponentId);

    const baseQuery = {
        weightClass: fighter.weightClass,
        isChampion: { $ne: true },
    };
    if (excludeIds.length) baseQuery._id = { $nin: excludeIds };

    const [same, stretchList] = await Promise.all([
        Opponent.find({ ...baseQuery, promotionTier: fighter.promotionTier })
            .sort({ overallRating: -1 })
            .limit(ROSTER_LIMIT_PER_TIER)
            .lean(),
        stretch
            ? Opponent.find({ ...baseQuery, promotionTier: stretch })
                .sort({ overallRating: -1 })
                .limit(ROSTER_LIMIT_PER_TIER)
                .lean()
            : Promise.resolve([]),
    ]);

    const shape = (o, isStretch) => ({
        id: String(o._id),
        name: o.name,
        nickname: o.nickname,
        style: o.style,
        overallRating: o.overallRating,
        promotionTier: o.promotionTier,
        record: o.record || { wins: 0, losses: 0, draws: 0 },
        cost: computeCalloutCost(fighter, o),
        isStretch,
    });

    return {
        fame: fighter?.notoriety?.score || 0,
        active: fighter.activeCallout?.opponentId ? {
            opponentId: String(fighter.activeCallout.opponentId),
            opponentName: fighter.activeCallout.opponentName,
            cost: fighter.activeCallout.cost,
            calledAt: fighter.activeCallout.calledAt,
            isStretch: fighter.activeCallout.isStretch,
        } : null,
        sameTier:    same.map((o) => shape(o, false)),
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

    const opponent = await Opponent.findById(opponentId).lean();
    if (!opponent) throw new Error("Opponent not found");
    if (opponent.weightClass !== fighter.weightClass) throw new Error("Wrong weight class");
    if (opponent.isChampion) throw new Error("Cannot call out a champion");

    const stretch = stretchTierFor(fighter.promotionTier);
    const isStretch = opponent.promotionTier !== fighter.promotionTier;
    if (isStretch) {
        if (opponent.promotionTier !== stretch) throw new Error("Opponent is outside your callable tier range");
    }

    const cost = computeCalloutCost(fighter, opponent);
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
