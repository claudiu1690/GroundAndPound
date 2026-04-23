const MainEvent = require("../models/mainEventModel");
const Prediction = require("../models/predictionModel");
const Opponent = require("../models/opponentModel");
const Fighter = require("../models/fighterModel");
const notorietyService = require("./notorietyService");
const {
    EVENT_WINDOW_MS,
    REWARDS,
    METHODS,
    STYLE_METHOD_BIAS,
    DRAW_CHANCE,
    MIN_OVR_FOR_MAIN_EVENT,
} = require("../consts/mainEventConfig");

// ─────────────────────────────────────────────────────────────
// Event lifecycle
// ─────────────────────────────────────────────────────────────

/**
 * Public entry: return the current active event. If none exists, or the latest has
 * passed its `resolvesAt`, resolve that one and spawn a new one, then return both:
 * the now-active upcoming event + the freshly-resolved one (so the UI can announce
 * "last week's result" inline).
 */
async function getCurrentEvent() {
    const latest = await MainEvent.findOne({}).sort({ createdAt: -1 });
    let justResolved = null;

    // Case 1: nothing exists yet → spawn first event.
    if (!latest) {
        const created = await createNewEvent();
        return { current: shape(created), justResolved: null };
    }

    // Case 2: latest is still upcoming but past its window → resolve it.
    if (latest.status === "upcoming" && latest.resolvesAt && latest.resolvesAt.getTime() <= Date.now()) {
        await resolveEvent(latest);
        justResolved = latest;
    }

    // Case 3: latest is now resolved (either by Case 2 above or was already) → spawn next.
    if ((justResolved && latest.status === "resolved") || latest.status === "resolved") {
        const created = await createNewEvent();
        return { current: shape(created), justResolved: justResolved ? shape(justResolved) : shape(latest) };
    }

    // Case 4: latest is still within window.
    return { current: shape(latest), justResolved: null };
}

/** Pick two top-OVR non-champion opponents in the same weight class and create the event. */
async function createNewEvent() {
    // Pick a weight class with at least two eligible opponents.
    const classes = await Opponent.aggregate([
        { $match: { isChampion: { $ne: true }, overallRating: { $gte: MIN_OVR_FOR_MAIN_EVENT } } },
        { $group: { _id: "$weightClass", count: { $sum: 1 } } },
        { $match: { count: { $gte: 2 } } },
    ]);
    if (classes.length === 0) {
        // Fallback: no high-OVR roster yet — skip the MIN_OVR gate and try again.
        const fallbackClasses = await Opponent.aggregate([
            { $match: { isChampion: { $ne: true } } },
            { $group: { _id: "$weightClass", count: { $sum: 1 } } },
            { $match: { count: { $gte: 2 } } },
        ]);
        if (fallbackClasses.length === 0) {
            throw new Error("Not enough opponents in the roster to stage a main event");
        }
        const wc = pickRandom(fallbackClasses)._id;
        const [a, b] = await pickPair(wc, 0);
        return persistEvent(wc, a, b);
    }
    const wc = pickRandom(classes)._id;
    const [a, b] = await pickPair(wc, MIN_OVR_FOR_MAIN_EVENT);
    return persistEvent(wc, a, b);
}

async function pickPair(weightClass, minOvr) {
    // Take the top 6 by OVR then pick 2 randomly — keeps variety between weeks.
    const pool = await Opponent.find({
        weightClass,
        isChampion: { $ne: true },
        overallRating: { $gte: minOvr },
    })
        .sort({ overallRating: -1 })
        .limit(6)
        .lean();
    if (pool.length < 2) throw new Error("Insufficient opponents for main event");
    const shuffled = shuffle(pool);
    return [shuffled[0], shuffled[1]];
}

async function persistEvent(weightClass, a, b) {
    const now = new Date();
    const evt = await MainEvent.create({
        fighterA: toCard(a),
        fighterB: toCard(b),
        weightClass,
        status: "upcoming",
        opensAt: now,
        resolvesAt: new Date(now.getTime() + EVENT_WINDOW_MS),
    });
    return evt;
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

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// Simulation (simple weighted roll — not tied to player fight logic)
// ─────────────────────────────────────────────────────────────

/**
 * Pick a winner weighted by OVR, then pick a method weighted by the winner's style.
 * Occasional draw (DRAW_CHANCE).
 */
function simulate(a, b) {
    if (Math.random() < DRAW_CHANCE) {
        return { winnerSide: "DRAW", method: "Draw" };
    }
    // Weighted by OVR — each point of OVR gap shifts the odds ~5%.
    const aW = Math.max(1, a.overallRating);
    const bW = Math.max(1, b.overallRating);
    const total = aW + bW;
    const aWin = Math.random() * total < aW;
    const winner = aWin ? a : b;
    const loser  = aWin ? b : a;

    const weights = methodWeightsFor(winner.style, loser.style);
    const method = weightedPickMethod(weights);
    return { winnerSide: aWin ? "A" : "B", method };
}

function methodWeightsFor(winnerStyle, loserStyle) {
    const base = STYLE_METHOD_BIAS[winnerStyle] || { "KO/TKO": 40, Submission: 20, Decision: 40 };
    // Grapplers losing to strikers skew KO; strikers losing to grapplers skew Sub.
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

/**
 * Public-odds % ish snapshot for the UI card — shows how people "perceive" the fight
 * without actually running a full simulation.
 */
function publicOddsFor(a, b) {
    const aW = Math.max(1, a.overallRating);
    const bW = Math.max(1, b.overallRating);
    const total = aW + bW;
    const aPct = Math.round((aW / total) * (1 - DRAW_CHANCE) * 100);
    const drawPct = Math.round(DRAW_CHANCE * 100);
    const bPct = Math.max(0, 100 - aPct - drawPct);
    return { A: aPct, B: bPct, DRAW: drawPct };
}

// ─────────────────────────────────────────────────────────────
// Predictions
// ─────────────────────────────────────────────────────────────

async function submitPrediction(fighterId, eventId, pickedSide, pickedMethod) {
    if (!["A", "B", "DRAW"].includes(pickedSide)) throw new Error("Invalid side");
    if (pickedSide === "DRAW") {
        pickedMethod = "Draw";
    } else if (!METHODS.includes(pickedMethod) || pickedMethod === "Draw") {
        throw new Error("Invalid method");
    }

    const evt = await MainEvent.findById(eventId);
    if (!evt) throw new Error("Event not found");
    if (evt.status !== "upcoming") throw new Error("Event already resolved");
    if (evt.resolvesAt.getTime() <= Date.now()) throw new Error("Event already resolved");

    const existing = await Prediction.findOne({ fighterId, mainEventId: evt._id });
    if (existing) throw new Error("You have already predicted this event");

    const pred = await Prediction.create({
        fighterId,
        mainEventId: evt._id,
        pickedSide,
        pickedMethod,
        matchup: { aName: evt.fighterA.name, bName: evt.fighterB.name },
    });

    // Increment prediction counts on the event doc.
    const incKey = `predictionCount.${pickedSide}`;
    await MainEvent.updateOne(
        { _id: evt._id },
        { $inc: { "predictionCount.total": 1, [incKey]: 1 } }
    );

    return shapePrediction(pred.toObject());
}

async function getFighterPredictionForEvent(fighterId, eventId) {
    if (!fighterId || !eventId) return null;
    const pred = await Prediction.findOne({ fighterId, mainEventId: eventId }).lean();
    return pred ? shapePrediction(pred) : null;
}

async function listHistory(fighterId, limit = 10) {
    const rows = await Prediction.find({ fighterId, "resolution.resolved": true })
        .sort({ "resolution.resolvedAt": -1 })
        .limit(Math.max(1, Math.min(50, limit)))
        .lean();
    return rows.map(shapePrediction);
}

// ─────────────────────────────────────────────────────────────
// Resolve
// ─────────────────────────────────────────────────────────────

/**
 * Run simulation, update event, update all predictions, apply fame/iron to predictors.
 * Idempotent: does nothing if already resolved.
 */
async function resolveEvent(eventDoc) {
    if (eventDoc.status === "resolved") return;

    const outcome = simulate(eventDoc.fighterA, eventDoc.fighterB);
    eventDoc.actualOutcome = outcome;
    eventDoc.status = "resolved";
    eventDoc.resolvedAt = new Date();
    await eventDoc.save();

    // Resolve every prediction for this event.
    const predictions = await Prediction.find({ mainEventId: eventDoc._id, "resolution.resolved": false });
    for (const p of predictions) {
        const correctSide = p.pickedSide === outcome.winnerSide;
        const correctExact = correctSide && p.pickedMethod === outcome.method;

        let fameDelta = 0;
        let ironDelta = 0;
        if (correctExact) {
            fameDelta = REWARDS.EXACT_FAME;
            ironDelta = REWARDS.EXACT_IRON;
        } else if (correctSide) {
            fameDelta = REWARDS.WINNER_FAME;
        } else {
            fameDelta = REWARDS.WRONG_FAME;
        }

        // Apply fame + iron to the fighter.
        try {
            const fighter = await Fighter.findById(p.fighterId);
            if (fighter) {
                if (fameDelta !== 0) {
                    notorietyService.applyNotorietyDelta(fighter, fameDelta, {
                        skipFreezeBlock: true,
                        code: fameDelta > 0 ? "PREDICTION_RIGHT" : "PREDICTION_WRONG",
                        reason: `Main event: ${correctExact ? "exact call" : correctSide ? "winner only" : "wrong winner"} (${eventDoc.fighterA.name} vs ${eventDoc.fighterB.name})`,
                        meta: { mainEventId: eventDoc._id },
                    });
                    notorietyService.touchLastEvent(fighter);
                }
                if (ironDelta !== 0) {
                    fighter.iron = (fighter.iron || 0) + ironDelta;
                }
                await fighter.save();
            }
        } catch (e) {
            console.error("[mainEvent] failed to pay out prediction", p._id, e.message);
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

// ─────────────────────────────────────────────────────────────
// Shapers
// ─────────────────────────────────────────────────────────────

function shape(evt) {
    const pc = evt.predictionCount || { total: 0, A: 0, B: 0, DRAW: 0 };
    return {
        id: String(evt._id),
        weightClass: evt.weightClass,
        status: evt.status,
        opensAt: evt.opensAt,
        resolvesAt: evt.resolvesAt,
        resolvedAt: evt.resolvedAt,
        fighterA: evt.fighterA,
        fighterB: evt.fighterB,
        actualOutcome: evt.actualOutcome,
        predictionCount: pc,
        publicOdds: publicOddsFor(evt.fighterA, evt.fighterB),
    };
}

function shapePrediction(p) {
    return {
        id: String(p._id),
        mainEventId: String(p.mainEventId),
        fighterId: String(p.fighterId),
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
    getFighterPredictionForEvent,
    listHistory,
    resolveEvent, // exposed for tests / manual admin
};
