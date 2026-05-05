const FightCard = require("../models/mainEventModel");
const Prediction = require("../models/predictionModel");
const Opponent = require("../models/opponentModel");
const Fighter = require("../models/fighterModel");
const notorietyService = require("./notorietyService");
const {
    EVENT_WINDOW_MS,
    CARD_FIGHT_SLOTS,
    ELITE_OVR_THRESHOLD,
    PRELIM_MIN_OVR,
    REWARDS_BY_SLOT,
    METHODS,
    STYLE_METHOD_BIAS,
    DRAW_CHANCE,
    MAX_OVR_GAP_FIGHT,
    MAX_FIGHT_HISTORY,
} = require("../consts/mainEventConfig");

// ─────────────────────────────────────────────────────────────
// Lifecycle entry point
// ─────────────────────────────────────────────────────────────

/**
 * Returns the current upcoming card. If the latest card has passed its window,
 * resolves it inline and spawns a fresh upcoming one.
 */
async function getCurrentEvent() {
    const latest = await FightCard.findOne({}).sort({ createdAt: -1 });
    let justResolved = null;

    if (!latest) {
        const created = await createNewCard();
        return { current: shapeCard(created), justResolved: null };
    }

    if (latest.status === "upcoming" && latest.resolvesAt && latest.resolvesAt.getTime() <= Date.now()) {
        await resolveCard(latest);
        justResolved = latest;
    }

    if (latest.status === "resolved") {
        const created = await createNewCard();
        return { current: shapeCard(created), justResolved: shapeCard(latest) };
    }

    return { current: shapeCard(latest), justResolved: null };
}

// ─────────────────────────────────────────────────────────────
// Card creation
// ─────────────────────────────────────────────────────────────

async function createNewCard() {
    const elitePool = await Opponent.find({
        promotionTier: "GCS",
        isChampion: { $ne: true },
        overallRating: { $gte: ELITE_OVR_THRESHOLD },
    }).lean();

    const prelimPool = await Opponent.find({
        promotionTier: "GCS",
        isChampion: { $ne: true },
        overallRating: { $gte: PRELIM_MIN_OVR, $lt: ELITE_OVR_THRESHOLD },
    }).lean();

    if (elitePool.length < 2 && prelimPool.length < 2) {
        throw new Error("Not enough GCS fighters to assemble a card");
    }

    const used = new Set();
    const fights = [];
    const combinedPool = [...elitePool, ...prelimPool];

    for (const slotDef of CARD_FIGHT_SLOTS) {
        const primary = slotDef.pool === "elite" ? elitePool : prelimPool;
        const fallback = slotDef.pool === "elite" ? prelimPool : elitePool;

        // Try preferred pool, then the other pool, then ALL GCS combined as a final
        // fallback — this guarantees a full 5-fight card whenever the total GCS roster
        // can support it.
        let pair = pickPairWithinClass(primary, used)
                 || pickPairWithinClass(fallback, used)
                 || pickPairWithinClass(combinedPool, used);

        if (!pair) break;

        const [a, b] = pair;
        used.add(String(a._id));
        used.add(String(b._id));
        fights.push({
            slot: slotDef.slot,
            weightClass: a.weightClass,
            fighterA: toCard(a),
            fighterB: toCard(b),
            actualOutcome: { winnerSide: null, method: null },
        });
    }

    if (fights.length === 0) {
        throw new Error("Failed to assemble any matchups for this card");
    }
    if (fights.length < CARD_FIGHT_SLOTS.length) {
        console.warn(`[fightCard] assembled ${fights.length}/${CARD_FIGHT_SLOTS.length} fights — roster too thin or sparse intra-class. elite=${elitePool.length} prelim=${prelimPool.length}`);
    }

    // Promote the highest-combined-OVR pair from the elite slots to the headliner spot.
    sortHeadlinerToBack(fights);

    const lastNumber = await FightCard.findOne({}).sort({ cardNumber: -1 }).select("cardNumber").lean();
    const cardNumber = (lastNumber?.cardNumber || 0) + 1;
    const now = new Date();

    return FightCard.create({
        cardNumber,
        status: "upcoming",
        opensAt: now,
        resolvesAt: new Date(now.getTime() + EVENT_WINDOW_MS),
        fights,
    });
}

/**
 * From a candidate pool, pick a same-weight-class pair within MAX_OVR_GAP_FIGHT
 * that hasn't been used yet. Returns [fighterA, fighterB] or null if none found.
 */
function pickPairWithinClass(pool, used) {
    const available = pool.filter((o) => !used.has(String(o._id)));
    if (available.length < 2) return null;

    // Group by weight class
    const byClass = available.reduce((acc, o) => {
        (acc[o.weightClass] = acc[o.weightClass] || []).push(o);
        return acc;
    }, {});

    // Shuffle classes for variety, then look for the first class with a tight pair.
    const classes = shuffle(Object.keys(byClass));
    for (const wc of classes) {
        const list = byClass[wc];
        if (list.length < 2) continue;

        // Anchor + closest-OVR partner within ±MAX_OVR_GAP_FIGHT
        const shuffled = shuffle(list);
        for (const anchor of shuffled) {
            const partners = list.filter((o) =>
                String(o._id) !== String(anchor._id) &&
                Math.abs(o.overallRating - anchor.overallRating) <= MAX_OVR_GAP_FIGHT
            );
            if (partners.length > 0) {
                return [anchor, partners[Math.floor(Math.random() * partners.length)]];
            }
        }

        // Fallback within this class: pair the two closest by OVR
        const sorted = list.slice().sort((a, b) => a.overallRating - b.overallRating);
        let best = null;
        let bestGap = Infinity;
        for (let i = 0; i < sorted.length - 1; i += 1) {
            const gap = sorted[i + 1].overallRating - sorted[i].overallRating;
            if (gap < bestGap) {
                bestGap = gap;
                best = [sorted[i], sorted[i + 1]];
            }
        }
        if (best) return best;
    }
    return null;
}

/**
 * Headliner is the elite-pool fight with the highest combined OVR.
 * Reorders so it ends up at index 4.
 */
function sortHeadlinerToBack(fights) {
    if (fights.length === 0) return;
    let bestIdx = -1;
    let bestSum = -1;
    fights.forEach((f, i) => {
        if (f.slot !== "MAIN" && f.slot !== "HEADLINER") return;
        const sum = (f.fighterA.overallRating || 0) + (f.fighterB.overallRating || 0);
        if (sum > bestSum) { bestSum = sum; bestIdx = i; }
    });
    if (bestIdx >= 0 && bestIdx !== fights.length - 1) {
        const [headliner] = fights.splice(bestIdx, 1);
        // Ensure the swapped fight gets MAIN slot if headliner had it
        const swappedIdx = fights.length;
        const lastFight = fights[swappedIdx - 1];
        if (lastFight && lastFight.slot === "HEADLINER") lastFight.slot = "MAIN";
        headliner.slot = "HEADLINER";
        fights.push(headliner);
    } else if (bestIdx === fights.length - 1) {
        fights[bestIdx].slot = "HEADLINER";
    }
    // Make sure exactly one HEADLINER exists; demote any others to MAIN.
    let seen = false;
    for (const f of fights) {
        if (f.slot === "HEADLINER") {
            if (seen) f.slot = "MAIN";
            else seen = true;
        }
    }
}

function toCard(o) {
    return {
        opponentId: o._id,
        name: o.name,
        nickname: o.nickname || null,
        style: o.style || null,
        weightClass: o.weightClass,
        overallRating: o.overallRating,
        promotionTier: o.promotionTier || null,
        record: o.record || { wins: 0, losses: 0, draws: 0 },
    };
}

function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// Simulation
// ─────────────────────────────────────────────────────────────

function simulate(a, b) {
    if (Math.random() < DRAW_CHANCE) return { winnerSide: "DRAW", method: "Draw" };
    const aW = Math.max(1, a.overallRating);
    const bW = Math.max(1, b.overallRating);
    // Slightly stronger curve than v1 — square the OVR ratio so a 90 vs 85 favors A more.
    const aSq = aW * aW;
    const bSq = bW * bW;
    const aWin = Math.random() * (aSq + bSq) < aSq;
    const winner = aWin ? a : b;
    const loser  = aWin ? b : a;
    const weights = methodWeightsFor(winner.style, loser.style);
    return { winnerSide: aWin ? "A" : "B", method: weightedPickMethod(weights) };
}

function methodWeightsFor(winnerStyle, loserStyle) {
    const base = STYLE_METHOD_BIAS[winnerStyle] || { "KO/TKO": 40, Submission: 20, Decision: 40 };
    const loserBias = STYLE_METHOD_BIAS[loserStyle] || {};
    return {
        "KO/TKO": base["KO/TKO"] * 0.7 + (loserBias["KO/TKO"] ? (100 - loserBias["KO/TKO"]) * 0.2 : 0),
        Submission: base.Submission * 0.7 + (loserBias.Submission ? (100 - loserBias.Submission) * 0.2 : 0),
        Decision: base.Decision,
    };
}

function weightedPickMethod(weights) {
    const entries = Object.entries(weights);
    const sum = entries.reduce((a, [, v]) => a + v, 0);
    let r = Math.random() * sum;
    for (const [k, v] of entries) {
        r -= v;
        if (r <= 0) return k;
    }
    return entries[0][0];
}

function publicOddsFor(a, b) {
    const aW = Math.max(1, a.overallRating);
    const bW = Math.max(1, b.overallRating);
    const aSq = aW * aW;
    const bSq = bW * bW;
    const aPct = Math.round((aSq / (aSq + bSq)) * (1 - DRAW_CHANCE) * 100);
    const drawPct = Math.round(DRAW_CHANCE * 100);
    const bPct = Math.max(0, 100 - aPct - drawPct);
    return { A: aPct, B: bPct, DRAW: drawPct };
}

// ─────────────────────────────────────────────────────────────
// Resolve card
// ─────────────────────────────────────────────────────────────

/**
 * Run sim for every sub-fight, update NPC records + fightHistory,
 * mark card resolved, settle every prediction.
 */
async function resolveCard(cardDoc) {
    if (cardDoc.status === "resolved") return;

    for (const fight of cardDoc.fights) {
        const outcome = simulate(fight.fighterA, fight.fighterB);
        fight.actualOutcome = outcome;

        // Tier 2: write the result to each NPC's record + fightHistory so the
        // roster stays alive across cards. Capped by MAX_FIGHT_HISTORY.
        await applyResultToOpponent(fight.fighterA.opponentId, outcome, "A");
        await applyResultToOpponent(fight.fighterB.opponentId, outcome, "B");
    }

    cardDoc.status = "resolved";
    cardDoc.resolvedAt = new Date();
    await cardDoc.save();

    // Settle predictions
    const predictions = await Prediction.find({ cardId: cardDoc._id, "resolution.resolved": false });
    for (const p of predictions) {
        const fight = cardDoc.fights[p.fightIndex];
        if (!fight) continue;

        const outcome = fight.actualOutcome;
        const rewards = REWARDS_BY_SLOT[fight.slot] || REWARDS_BY_SLOT.PRELIM;

        const correctSide = p.pickedSide === outcome.winnerSide;
        const correctExact = correctSide && p.pickedMethod === outcome.method;

        let fameDelta = 0;
        let ironDelta = 0;
        if (correctExact) {
            fameDelta = rewards.exactFame;
            ironDelta = rewards.exactIron;
        } else if (correctSide) {
            fameDelta = rewards.winnerFame;
        } else {
            fameDelta = rewards.wrongFame;
        }

        try {
            const fighter = await Fighter.findById(p.fighterId);
            if (fighter) {
                if (fameDelta !== 0) {
                    notorietyService.applyNotorietyDelta(fighter, fameDelta, {
                        skipFreezeBlock: true,
                        code: fameDelta > 0 ? "PREDICTION_RIGHT" : "PREDICTION_WRONG",
                        reason: `${fight.slot.toLowerCase()}: ${correctExact ? "exact call" : correctSide ? "winner only" : "wrong winner"} (${fight.fighterA.name} vs ${fight.fighterB.name})`,
                        meta: { cardId: cardDoc._id, fightIndex: p.fightIndex, slot: fight.slot },
                    });
                    notorietyService.touchLastEvent(fighter);
                }
                if (ironDelta > 0) fighter.iron = (fighter.iron || 0) + ironDelta;
                await fighter.save();
            }
        } catch (e) {
            console.error("[fightCard] payout failed for prediction", p._id, e.message);
        }

        p.resolution = {
            resolved: true,
            correctSide,
            correctExact,
            fameDelta,
            ironDelta,
            actualSide: outcome.winnerSide,
            actualMethod: outcome.method,
            resolvedAt: new Date(),
        };
        await p.save();
    }
}

async function applyResultToOpponent(opponentId, outcome, side) {
    const opp = await Opponent.findById(opponentId);
    if (!opp) return;

    let result;
    if (outcome.winnerSide === "DRAW") result = "draw";
    else if (outcome.winnerSide === side) result = "win";
    else result = "loss";

    opp.fightHistory = opp.fightHistory || [];
    opp.fightHistory.push({
        result,
        method: outcome.method || "Decision",
        round: 1,
    });
    if (opp.fightHistory.length > MAX_FIGHT_HISTORY) {
        opp.fightHistory.splice(0, opp.fightHistory.length - MAX_FIGHT_HISTORY);
    }

    opp.record = opp.record || { wins: 0, losses: 0, draws: 0 };
    if (result === "win") opp.record.wins += 1;
    else if (result === "loss") opp.record.losses += 1;
    else opp.record.draws += 1;

    await opp.save();
}

// ─────────────────────────────────────────────────────────────
// Predictions
// ─────────────────────────────────────────────────────────────

async function submitPrediction(fighterId, cardId, fightIndex, pickedSide, pickedMethod) {
    if (!["A", "B", "DRAW"].includes(pickedSide)) throw new Error("Invalid side");
    if (pickedSide === "DRAW") {
        pickedMethod = "Draw";
    } else if (!METHODS.includes(pickedMethod) || pickedMethod === "Draw") {
        throw new Error("Invalid method");
    }
    if (!Number.isInteger(fightIndex) || fightIndex < 0) throw new Error("Invalid fight index");

    const card = await FightCard.findById(cardId);
    if (!card) throw new Error("Card not found");
    if (card.status !== "upcoming") throw new Error("Card already resolved");
    if (card.resolvesAt.getTime() <= Date.now()) throw new Error("Card already resolved");

    const fight = card.fights[fightIndex];
    if (!fight) throw new Error("Invalid fight index");

    const existing = await Prediction.findOne({ fighterId, cardId, fightIndex });
    if (existing) throw new Error("You have already predicted this fight");

    const pred = await Prediction.create({
        fighterId,
        cardId,
        fightIndex,
        fightSlot: fight.slot,
        pickedSide,
        pickedMethod,
        matchup: { aName: fight.fighterA.name, bName: fight.fighterB.name },
    });
    return shapePrediction(pred.toObject());
}

async function listFighterPredictionsForCard(fighterId, cardId) {
    if (!fighterId || !cardId) return [];
    const rows = await Prediction.find({ fighterId, cardId }).lean();
    return rows.map(shapePrediction);
}

async function listHistory(fighterId, limit = 20) {
    const rows = await Prediction.find({ fighterId, "resolution.resolved": true })
        .sort({ "resolution.resolvedAt": -1 })
        .limit(Math.max(1, Math.min(50, limit)))
        .lean();
    return rows.map(shapePrediction);
}

// ─────────────────────────────────────────────────────────────
// Shapers
// ─────────────────────────────────────────────────────────────

function shapeCard(card) {
    return {
        id: String(card._id),
        cardNumber: card.cardNumber,
        status: card.status,
        opensAt: card.opensAt,
        resolvesAt: card.resolvesAt,
        resolvedAt: card.resolvedAt,
        fights: (card.fights || []).map((f, idx) => ({
            id: String(f._id),
            index: idx,
            slot: f.slot,
            weightClass: f.weightClass,
            fighterA: f.fighterA,
            fighterB: f.fighterB,
            actualOutcome: f.actualOutcome,
            publicOdds: publicOddsFor(f.fighterA, f.fighterB),
        })),
    };
}

function shapePrediction(p) {
    return {
        id: String(p._id),
        cardId: String(p.cardId),
        fighterId: String(p.fighterId),
        fightIndex: p.fightIndex,
        fightSlot: p.fightSlot,
        pickedSide: p.pickedSide,
        pickedMethod: p.pickedMethod,
        matchup: p.matchup,
        resolution: p.resolution,
        createdAt: p.createdAt,
    };
}

module.exports = {
    getCurrentEvent,
    submitPrediction,
    listFighterPredictionsForCard,
    listHistory,
    resolveCard,
};
