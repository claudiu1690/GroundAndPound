const Fighter = require("../models/fighterModel");
const Sponsorship = require("../models/sponsorshipModel");
const {
    SPONSOR_OFFERS,
    SPONSOR_OFFERS_BY_ID,
    SPONSOR_SLOTS_BY_TIER,
    AVAILABLE_OFFERS_PER_WEEK,
    OFFER_ROTATION_MS,
} = require("../consts/sponsorCatalog");
const {
    applyFightToProgress,
    evaluateClause,
    describeClause,
    describeProgress,
} = require("../consts/sponsorClauses");
const { tierRank } = require("../consts/notorietyConfig");
const notorietyService = require("./notorietyService");

/**
 * Deterministic PRNG so available offers stay stable within a week for a given fighter.
 * Not cryptographic — just enough to pseudo-shuffle.
 */
function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}
function seededShuffle(arr, seed) {
    const out = arr.slice();
    const rng = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** Current rotation index (week number since epoch). */
function currentRotation() {
    return Math.floor(Date.now() / OFFER_ROTATION_MS);
}

function maxSlotsFor(fighter) {
    const tier = fighter?.notoriety?.peakTier || "UNKNOWN";
    return SPONSOR_SLOTS_BY_TIER[tier] ?? 0;
}

function offerMeetsFighter(fighter, offer) {
    const req = tierRank(offer.unlockTier);
    const have = tierRank(fighter?.notoriety?.peakTier || "UNKNOWN");
    return have >= req;
}

/**
 * Return the current available-offer pool for a fighter. Pool is deterministic per rotation
 * and excludes sponsors already active or recently broken in the same rotation.
 */
async function listAvailableOffers(fighterId) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    const rotation = currentRotation();
    const rotationEndsAt = new Date((rotation + 1) * OFFER_ROTATION_MS);

    // Exclude sponsors already taken or recently broken in the same rotation.
    const activeIds = await Sponsorship.find({
        fighterId: fighter._id,
        status: "active",
    }).distinct("sponsorId");

    // Anti-farm: a sponsor that was completed, broken, or dropped THIS rotation
    // should not re-appear in the pool until the weekly refresh.
    const recentlyResolved = await Sponsorship.find({
        fighterId: fighter._id,
        status: { $in: ["completed", "broken", "dropped"] },
        resolvedAt: { $gte: new Date(rotation * OFFER_ROTATION_MS) },
    }).distinct("sponsorId");

    const excluded = new Set([...activeIds, ...recentlyResolved]);
    const eligible = SPONSOR_OFFERS.filter((s) => offerMeetsFighter(fighter, s) && !excluded.has(s.id));

    const seed = hashSeed(`${fighter._id}:${rotation}`);
    const shuffled = seededShuffle(eligible, seed).slice(0, AVAILABLE_OFFERS_PER_WEEK);

    return {
        rotation,
        rotationEndsAt,
        offers: shuffled.map((o) => ({
            ...o,
            clauseText: describeClause(o.clause.type, o.clause),
        })),
        slots: {
            used: activeIds.length,
            max: maxSlotsFor(fighter),
        },
    };
}

async function listActive(fighterId) {
    const rows = await Sponsorship.find({ fighterId, status: "active" }).sort({ createdAt: -1 }).lean();
    return rows.map(decorate);
}

async function listHistory(fighterId, limit = 20) {
    const rows = await Sponsorship.find({
        fighterId,
        status: { $in: ["completed", "broken", "expired", "dropped"] },
    })
        .sort({ resolvedAt: -1, updatedAt: -1 })
        .limit(Math.max(1, Math.min(50, limit)))
        .lean();
    return rows.map(decorate);
}

function decorate(row) {
    return {
        ...row,
        id: String(row._id),
        clauseText: describeClause(row.clause?.type, row.clause?.params),
        progressText: describeProgress(row.clause?.type, row.progress, row.clause?.params),
    };
}

async function acceptOffer(fighterId, sponsorId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    const offer = SPONSOR_OFFERS_BY_ID[sponsorId];
    if (!offer) throw new Error("Sponsor not found");
    if (!offerMeetsFighter(fighter, offer)) throw new Error("Fame tier too low for this sponsor");

    const active = await Sponsorship.find({ fighterId, status: "active" });
    if (active.length >= maxSlotsFor(fighter)) {
        throw new Error("No sponsor slots available — drop a contract or raise your fame tier");
    }
    if (active.some((a) => a.sponsorId === sponsorId)) {
        throw new Error("Already have this sponsor");
    }

    // Block accepting a sponsor that was completed, broken, or dropped this rotation.
    // Prevents the sign → complete → sign again farm loop.
    const rotation = currentRotation();
    const rotationStart = new Date(rotation * OFFER_ROTATION_MS);
    const recent = await Sponsorship.findOne({
        fighterId,
        sponsorId,
        status: { $in: ["completed", "broken", "dropped"] },
        resolvedAt: { $gte: rotationStart },
    });
    if (recent) {
        const msg = recent.status === "completed"
            ? "Already fulfilled this week — this sponsor won't re-sign until next rotation"
            : "Recently broken — this sponsor won't re-sign until next rotation";
        throw new Error(msg);
    }

    const contract = await Sponsorship.create({
        fighterId,
        sponsorId: offer.id,
        brand: offer.brand,
        tagline: offer.tagline,
        unlockTier: offer.unlockTier,
        clause: { type: offer.clause.type, params: offer.clause },
        durationFights: offer.durationFights,
        rewardPerFight: offer.rewardPerFight,
        rewardBonus: offer.rewardBonus,
        fameBonusOnComplete: offer.fameBonusOnComplete,
        famePenaltyOnBreak: offer.famePenaltyOnBreak,
        progress: {},
        totals: { ironEarned: 0, fameEarned: 0 },
        status: "active",
    });
    return decorate(contract.toObject());
}

async function dropContract(fighterId, sponsorshipId) {
    const contract = await Sponsorship.findOne({ _id: sponsorshipId, fighterId });
    if (!contract) throw new Error("Contract not found");
    if (contract.status !== "active") throw new Error("Contract is not active");

    // Small fame penalty for walking away — half the break penalty.
    const penalty = Math.round((contract.famePenaltyOnBreak || 0) / 2);
    if (penalty > 0) {
        const fighter = await Fighter.findById(fighterId);
        if (fighter) {
            notorietyService.applyNotorietyDelta(fighter, -penalty, {
                code: "SPONSOR_BREAK",
                reason: `Dropped sponsor: ${contract.brand}`,
                meta: { sponsorshipId: contract._id },
            });
            notorietyService.touchLastEvent(fighter);
            await fighter.save();
        }
    }

    contract.status = "dropped";
    contract.breakReason = "Dropped by fighter";
    contract.resolvedAt = new Date();
    await contract.save();
    return decorate(contract.toObject());
}

/**
 * Post-fight hook. Advances progress on every active contract.
 * - Pays rewardPerFight iron for each completed fight while the contract is active.
 * - Evaluates clause → may complete (bonus iron + fame), break (fame penalty), or expire.
 * Returns summary of what happened for the post-fight screen.
 *
 * Called from fightService after the fight record is saved and outcome is finalised.
 */
async function resolveAfterFight(fighter, fight) {
    if (!fighter || !fight) return { events: [] };
    const contracts = await Sponsorship.find({ fighterId: fighter._id, status: "active" });
    if (contracts.length === 0) return { events: [] };

    const ctx = {
        outcome: fight.outcome,
        weightMissed: fight.weightCut === "moderate" || fight.weightCut === "aggressive"
            ? !!fight._weightMissed // not stored on fight, use fallback below
            : false,
        fightId: fight._id,
    };
    // Fallback: some fights don't store weightMissed; infer from summary if available on caller.
    if (typeof fight.weightMissed === "boolean") ctx.weightMissed = fight.weightMissed;

    const events = [];
    let ironDelta = 0;

    for (const contract of contracts) {
        const prevProgress = contract.progress || {};
        const nextProgress = applyFightToProgress(contract.clause.type, prevProgress, ctx);
        contract.progress = nextProgress;

        const status = evaluateClause(contract.clause.type, nextProgress, contract.clause.params);

        // Per-fight payout (pay for attending the dance, even if it's the break fight).
        if (contract.rewardPerFight > 0) {
            ironDelta += contract.rewardPerFight;
            contract.totals.ironEarned += contract.rewardPerFight;
        }

        if (status === "complete") {
            if (contract.rewardBonus > 0) {
                ironDelta += contract.rewardBonus;
                contract.totals.ironEarned += contract.rewardBonus;
            }
            if (contract.fameBonusOnComplete > 0) {
                notorietyService.applyNotorietyDelta(fighter, contract.fameBonusOnComplete, {
                    code: "SPONSOR_BONUS",
                    reason: `Sponsor clause complete: ${contract.brand}`,
                    meta: { sponsorshipId: contract._id },
                });
                contract.totals.fameEarned += contract.fameBonusOnComplete;
            }
            contract.status = "completed";
            contract.resolvedAt = new Date();
            events.push({
                type: "SPONSOR_COMPLETE",
                brand: contract.brand,
                rewardBonus: contract.rewardBonus,
                fameBonus: contract.fameBonusOnComplete,
            });
        } else if (status === "broken") {
            if (contract.famePenaltyOnBreak > 0) {
                notorietyService.applyNotorietyDelta(fighter, -contract.famePenaltyOnBreak, {
                    code: "SPONSOR_BREAK",
                    reason: `Sponsor clause broken: ${contract.brand}`,
                    meta: { sponsorshipId: contract._id },
                });
            }
            contract.status = "broken";
            contract.breakReason = explainBreak(contract.clause.type, nextProgress);
            contract.resolvedAt = new Date();
            events.push({
                type: "SPONSOR_BREAK",
                brand: contract.brand,
                famePenalty: contract.famePenaltyOnBreak,
                reason: contract.breakReason,
            });
        } else {
            // Check expiry for open-window clauses (WIN_ANY_N): if durationFights hit without completion.
            const fightsCounted = (nextProgress.fights || 0);
            if (contract.durationFights > 0 && fightsCounted >= contract.durationFights) {
                contract.status = "expired";
                contract.resolvedAt = new Date();
                contract.breakReason = "Contract duration reached without completion";
                events.push({
                    type: "SPONSOR_EXPIRED",
                    brand: contract.brand,
                });
            }
        }
        await contract.save();
    }

    if (ironDelta !== 0) {
        fighter.iron = (fighter.iron || 0) + ironDelta;
    }

    return { events, ironDelta };
}

function explainBreak(clauseType, progress) {
    if (clauseType === "WIN_NEXT_N")   return "Did not win the required fight";
    if (clauseType === "FINISH_NEXT_N") return "Fight did not end in a finish";
    if (clauseType === "NO_WEIGHT_MISS") return "Missed weight";
    if (clauseType === "NO_FINISH_LOSS") return "Lost by finish";
    if (clauseType === "LAND_ONE_KO") return "Window closed without a KO";
    return "Clause condition failed";
}

module.exports = {
    listAvailableOffers,
    listActive,
    listHistory,
    acceptOffer,
    dropContract,
    resolveAfterFight,
    maxSlotsFor,
};
