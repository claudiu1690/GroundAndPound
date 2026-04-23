const {
    NOTORIETY_TIERS,
    tierRank,
    calculateTierFromScore,
    purseModifierForTier,
    tierFloor,
    nextTierThreshold,
    tierProgressPercent,
    BASE_FIGHT_NOTORIETY,
    promotionColumn,
    outcomeToNotorietyKey,
    WEIGHT_MISS_NOTORIETY,
    INACTIVITY_DECAY_START_DAYS,
} = require("../consts/notorietyConfig");

const MS_PER_DAY = 86400000;

/**
 * Fire-and-forget fame event log. Never throws — logging must not break gameplay.
 * Called from applyNotorietyDelta when a code is supplied, and from the decay job.
 * @param {string|object} fighterId
 * @param {number} delta
 * @param {string} code
 * @param {string} [reason]
 * @param {object} [meta]
 */
function logFameEvent(fighterId, delta, code, reason = "", meta = {}) {
    if (!fighterId || !code || delta === 0) return;
    try {
        const FameEvent = require("../models/fameEventModel");
        FameEvent.create({ fighterId, delta, code, reason, meta }).catch(() => {});
    } catch (_) {
        // model not registered yet — safe to ignore
    }
}

/**
 * Ensure fighter has notoriety subdocument (in-memory). Call after load.
 * @param {import("mongoose").Document} fighter
 */
function ensureNotorietyShape(fighter) {
    const legacy = fighter.get?.("notoriety") ?? fighter.notoriety;
    if (typeof legacy === "number") {
        const score = Math.max(0, legacy);
        fighter.notoriety = {
            score,
            peakTier: calculateTierFromScore(score),
            isFrozen: false,
            lastEventAt: fighter.lastFightDate || null,
            documentaryUsed: false,
            milestones: {},
            firstFinishPromoTiers: [],
        };
        return;
    }
    if (!fighter.notoriety || typeof fighter.notoriety !== "object") {
        fighter.notoriety = {
            score: 0,
            peakTier: "UNKNOWN",
            isFrozen: false,
            lastEventAt: null,
            documentaryUsed: false,
            milestones: {},
            firstFinishPromoTiers: [],
        };
        return;
    }
    fighter.notoriety.score = Math.max(0, fighter.notoriety.score ?? 0);
    if (!fighter.notoriety.peakTier) fighter.notoriety.peakTier = calculateTierFromScore(fighter.notoriety.score);
    if (fighter.notoriety.isFrozen == null) fighter.notoriety.isFrozen = false;
    if (!fighter.notoriety.milestones) fighter.notoriety.milestones = {};
    if (!Array.isArray(fighter.notoriety.firstFinishPromoTiers)) fighter.notoriety.firstFinishPromoTiers = [];
}

/**
 * Raise peak tier if score qualifies for a higher band than stored peak.
 * @param {import("mongoose").Document} fighter
 */
function syncPeakTier(fighter) {
    ensureNotorietyShape(fighter);
    const fromScore = calculateTierFromScore(fighter.notoriety.score);
    if (tierRank(fromScore) > tierRank(fighter.notoriety.peakTier)) {
        fighter.notoriety.peakTier = fromScore;
    }
}

/**
 * Score cannot drop below floor of peak fame tier.
 * @param {import("mongoose").Document} fighter
 */
function applyPeakTierFloor(fighter) {
    ensureNotorietyShape(fighter);
    const floor = tierFloor(fighter.notoriety.peakTier);
    if (fighter.notoriety.score < floor) {
        fighter.notoriety.score = floor;
    }
}

/**
 * Purse multiplier segment from notoriety tier (additive with other mods in fight service).
 * @param {string} peakTier
 */
function getNotorietyPurseFraction(peakTier) {
    return purseModifierForTier(peakTier);
}

/**
 * Build API payload for dashboard / profile.
 * @param {import("mongoose").Document} fighter
 */
function buildNotorietyPublicState(fighter) {
    ensureNotorietyShape(fighter);
    const score = fighter.notoriety.score;
    const peakTier = fighter.notoriety.peakTier;
    const def = NOTORIETY_TIERS[peakTier] || NOTORIETY_TIERS.UNKNOWN;
    const nextTh = nextTierThreshold(score);
    const nextLabel = nextTh != null ? calculateTierFromScore(nextTh) : null;
    const decayWarning = shouldShowInactivityDecayWarning(fighter);

    return {
        score,
        peakTier,
        tierLabel: def.label,
        purseModifier: def.purseModifier,
        tierFloor: tierFloor(peakTier),
        nextTierThreshold: nextTh,
        nextTierKey: nextLabel,
        progressWithinTier: tierProgressPercent(score),
        isFrozen: !!fighter.notoriety.isFrozen,
        lastEventAt: fighter.notoriety.lastEventAt || null,
        documentaryUsed: !!fighter.notoriety.documentaryUsed,
        decayWarningActive: decayWarning,
    };
}

function shouldShowInactivityDecayWarning(fighter) {
    ensureNotorietyShape(fighter);
    if (fighter.notoriety.isFrozen) return false;
    const last = fighter.notoriety.lastEventAt;
    if (!last) return false;
    const days = Math.floor((Date.now() - new Date(last).getTime()) / MS_PER_DAY);
    return days >= INACTIVITY_DECAY_START_DAYS;
}

/**
 * Apply a signed notoriety delta with floor rules. Does not save.
 * @param {import("mongoose").Document} fighter
 * @param {number} delta
 * @param {{ skipFloor?: boolean, skipFreezeBlock?: boolean, code?: string, reason?: string, meta?: object }} [options]
 * @returns {{ applied: number, blocked: boolean }}
 */
function applyNotorietyDelta(fighter, delta, options = {}) {
    ensureNotorietyShape(fighter);
    if (!options.skipFreezeBlock && fighter.notoriety.isFrozen && delta !== 0) {
        return { applied: 0, blocked: true };
    }
    const before = fighter.notoriety.score;
    let next = before + delta;
    if (delta < 0 && !options.skipFloor) {
        const floor = tierFloor(fighter.notoriety.peakTier);
        next = Math.max(next, floor);
    }
    next = Math.max(0, next);
    fighter.notoriety.score = next;
    syncPeakTier(fighter);
    applyPeakTierFloor(fighter);
    const actualDelta = fighter.notoriety.score - before;
    if (options.code && actualDelta !== 0 && fighter._id) {
        logFameEvent(fighter._id, actualDelta, options.code, options.reason || "", options.meta || {});
    }
    return { applied: delta, blocked: false };
}

function touchLastEvent(fighter) {
    ensureNotorietyShape(fighter);
    fighter.notoriety.lastEventAt = new Date();
}

/**
 * Compute fight notoriety award (before applying). Used for summary / breakdown.
 * @param {object} ctx
 */
function computeFightNotorietyAward(ctx) {
    const {
        promotionTier,
        outcome,
        weightMissed,
        wasFrozenBeforeFight,
        isWin,
        prevConsecutiveLosses,
        winStreakAfterWin,
        firstFinishInThisPromotion,
        fightOfTheNight,
        giantKiller,
        grudgeMatchWin,
        titleFightWin,
        titleDefenceWin,
    } = ctx;

    const col = promotionColumn(promotionTier);
    const key = outcomeToNotorietyKey(outcome);
    const breakdown = [];

    if (wasFrozenBeforeFight && !isWin) {
        return { total: 0, breakdown: [{ code: "FROZEN", amount: 0, note: "Notoriety frozen — no change until you win" }] };
    }

    let base = 0;
    if (key && BASE_FIGHT_NOTORIETY[key]) {
        base = BASE_FIGHT_NOTORIETY[key][col] ?? 0;
    }
    breakdown.push({ code: "BASE", amount: base, note: outcome });

    if (weightMissed) {
        breakdown.push({ code: "WEIGHT_MISS", amount: WEIGHT_MISS_NOTORIETY, note: "Missed weight" });
    }

    let award = base + (weightMissed ? WEIGHT_MISS_NOTORIETY : 0);

    const multMods = [];
    if (ctx.finishedHigherRanked) {
        const extra = Math.round(base * 0.5);
        multMods.push({ code: "TOP10_FINISH", amount: extra, note: "+50% base (higher-ranked)" });
        award += extra;
    }
    if (grudgeMatchWin && base > 0) {
        const extra = Math.round(base * 0.3);
        multMods.push({ code: "GRUDGE", amount: extra, note: "+30% base (grudge)" });
        award += extra;
    }
    breakdown.push(...multMods);

    const flats = [];
    if (titleFightWin) flats.push({ code: "TITLE_WIN", amount: 500, note: "Title fight win" });
    if (titleDefenceWin) flats.push({ code: "TITLE_DEF", amount: 300, note: "Title defence" });
    if (fightOfTheNight) flats.push({ code: "FOTN", amount: 200, note: "Fight of the Night" });
    if (firstFinishInThisPromotion) flats.push({ code: "FIRST_FINISH_TIER", amount: 100, note: "First finish in tier" });
    if (isWin && prevConsecutiveLosses >= 2) flats.push({ code: "COMEBACK_WIN", amount: 150, note: "Comeback win" });
    if (giantKiller) flats.push({ code: "GIANT_KILLER", amount: 300, note: "Giant killer" });

    if (isWin && winStreakAfterWin === 5) flats.push({ code: "STREAK_5", amount: 100, note: "5-fight streak" });
    if (isWin && winStreakAfterWin === 10) flats.push({ code: "STREAK_10", amount: 250, note: "10-fight streak" });
    if (isWin && winStreakAfterWin === 20) flats.push({ code: "STREAK_20", amount: 500, note: "20-fight streak" });

    for (const f of flats) {
        breakdown.push(f);
        award += f.amount;
    }

    return { total: Math.round(award), breakdown };
}

/**
 * One-time milestone notoriety after a win (call after record updated).
 */
function applyWinMilestoneBonuses(fighter) {
    ensureNotorietyShape(fighter);
    const m = fighter.notoriety.milestones || {};
    const wins = fighter.record?.wins ?? 0;
    const koWins = fighter.record?.koWins ?? 0;
    let bonus = 0;
    const notes = [];

    if (wins >= 10 && !m.wins10) {
        m.wins10 = true;
        bonus += 150;
        notes.push("10 wins milestone");
    }
    if (wins >= 25 && !m.wins25) {
        m.wins25 = true;
        bonus += 400;
        notes.push("25 wins milestone");
    }
    if (wins >= 50 && !m.wins50) {
        m.wins50 = true;
        bonus += 800;
        notes.push("50 wins milestone");
    }
    if (koWins >= 10 && !m.ko10) {
        m.ko10 = true;
        bonus += 300;
        notes.push("10 KO/TKO milestone");
    }
    fighter.notoriety.milestones = m;
    if (bonus > 0) {
        applyNotorietyDelta(fighter, bonus, {
            skipFreezeBlock: true,
            code: "MILESTONE",
            reason: notes.join(" + ") || "Career milestone",
        });
        touchLastEvent(fighter);
    }
    return { bonus, notes };
}

/**
 * Register first finish in promotion tier (call after awarding +100 in fight flow).
 * @param {import("mongoose").Document} fighter
 * @param {string} promotionTier
 */
function registerFirstFinishInPromotion(fighter, promotionTier) {
    ensureNotorietyShape(fighter);
    const arr = fighter.notoriety.firstFinishPromoTiers || [];
    if (!arr.includes(promotionTier)) {
        fighter.notoriety.firstFinishPromoTiers = [...arr, promotionTier];
    }
}

/**
 * Daily inactivity decay: -1% of current score per day after day 20, floored by peak tier.
 * @param {import("mongoose").Document} fighter
 * @returns {number} decay amount applied (0 if none)
 */
function applyInactivityDecayOnce(fighter) {
    ensureNotorietyShape(fighter);
    if (fighter.notoriety.isFrozen) return 0;
    const last = fighter.notoriety.lastEventAt;
    if (!last) return 0;
    const daysSince = Math.floor((Date.now() - new Date(last).getTime()) / MS_PER_DAY);
    if (daysSince <= INACTIVITY_DECAY_START_DAYS) return 0;

    const score = fighter.notoriety.score;
    const decay = Math.max(1, Math.round(score * 0.01));
    const floor = tierFloor(fighter.notoriety.peakTier);
    const newScore = Math.max(floor, score - decay);
    const applied = score - newScore;
    if (applied <= 0) return 0;
    fighter.notoriety.score = newScore;
    if (fighter._id) {
        logFameEvent(fighter._id, -applied, "DECAY", `Inactivity decay (${daysSince} days idle)`);
    }
    return applied;
}

/**
 * Daily job: apply -1% decay per day of inactivity after day 20 (each run applies one step).
 * @returns {Promise<number>} fighters updated
 */
async function runNotorietyDecayBatch() {
    const Fighter = require("../models/fighterModel");
    const fighters = await Fighter.find({
        "notoriety.lastEventAt": { $exists: true, $ne: null },
        "notoriety.isFrozen": false,
    });
    let updated = 0;
    for (const fighter of fighters) {
        ensureNotorietyShape(fighter);
        const before = fighter.notoriety.score;
        const decayed = applyInactivityDecayOnce(fighter);
        if (decayed > 0 && fighter.notoriety.score !== before) {
            await fighter.save();
            updated += 1;
        }
    }
    return updated;
}

/**
 * Fetch the latest fame events for a fighter (most recent first).
 * @param {string|object} fighterId
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
async function listRecentFameEvents(fighterId, limit = 10) {
    if (!fighterId) return [];
    try {
        const FameEvent = require("../models/fameEventModel");
        const rows = await FameEvent.find({ fighterId })
            .sort({ createdAt: -1 })
            .limit(Math.max(1, Math.min(50, limit)))
            .lean();
        return rows.map((r) => ({
            id: String(r._id),
            delta: r.delta,
            code: r.code,
            reason: r.reason || "",
            meta: r.meta || {},
            createdAt: r.createdAt,
        }));
    } catch (_) {
        return [];
    }
}

module.exports = {
    ensureNotorietyShape,
    syncPeakTier,
    applyPeakTierFloor,
    getNotorietyPurseFraction,
    buildNotorietyPublicState,
    applyNotorietyDelta,
    touchLastEvent,
    computeFightNotorietyAward,
    applyWinMilestoneBonuses,
    registerFirstFinishInPromotion,
    applyInactivityDecayOnce,
    shouldShowInactivityDecayWarning,
    runNotorietyDecayBatch,
    logFameEvent,
    listRecentFameEvents,
};
