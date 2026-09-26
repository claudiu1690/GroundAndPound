/**
 * Persisted fight offer board: lifecycle, liveness, reroll and slot resolution.
 *
 * fightService keeps the matchmaking rules (pickOfferSlots / hydrateOffers); this file
 * owns everything about the stored board on the fighter document (fighter.offerBoard).
 *
 * THIS JSDoc BLOCK IS THE SINGLE SOURCE OF TRUTH FOR THE SHARED BOARD TYPES.
 * GET /fights/offers/:fighterId, POST /fights/offers/:fighterId/reroll and the dashboard
 * `offers` block all reference these; do not re-describe them elsewhere.
 *
 * @typedef {Object} OfferBoardMeta
 * @property {?string} generatedAt   ISO, null when there is no board
 * @property {?string} expiresAt     ISO, null when there is no board
 * @property {boolean} rerollUsed
 * @property {?number} rerollCost    round(PROMOTION_TIERS[tier].signingFee * 0.2), null for an unknown tier
 * @property {boolean} canReroll     === (rerollBlockedBy === null)
 * @property {?("frozen"|"blocked"|"no_board"|"used"|"cash")} rerollBlockedBy
 *           first match in this order; the cash check uses fighter.iron at read time
 * @property {boolean} frozen        a fight is booked (fighter.acceptedFightId)
 * @property {?string} blockedReason player-facing text, set with blockedCode
 * @property {?("INJURY"|"POOL_EMPTY")} blockedCode
 *
 * @typedef {Object} BoardOffer
 * The element shape the old generateOffers returned, plus `acceptable`:
 * @property {"Easy"|"Even"|"Hard"|"TitleShot"} type
 * @property {Object} opponent       full lean Opponent + displayRank (TitleShot OVR is x1.05)
 * @property {{record:{wins:number,losses:number,draws:number},
 *            streak:?{result:string,count:number}, lastThree:Array}} context
 *           recomputed from the opponent's current fightHistory at every read
 * @property {?{lossCount:number,setAt:?Date}} [nemesisMeta]
 * @property {boolean} [isCallout]   the active callout overlay (Hard slot)
 * @property {{cost:number,isStretch:boolean,calledAt:?Date}} [calloutMeta]
 * @property {{targetTier:?string}} [titleShotMeta]
 * @property {boolean} [locked]      TitleShot only
 * @property {number} [cooldownRemaining]  TitleShot only
 * @property {number} [winsNeeded]   TitleShot only
 * @property {boolean} [rankNeeded]  TitleShot only
 * @property {?number} [currentRank] TitleShot only
 * @property {{source:string,expiresAfterFights:number}} [beefMatch]
 * @property {{source:string,expiresAfterFights:number}} [respectMatch]
 * @property {boolean} acceptable    !frozen && !(TitleShot && locked)
 *
 * Rules:
 *   - Slots store only {offerType, opponentId}; everything else is hydrated live.
 *   - The active callout is a read-time overlay, never stored and never in the
 *     fingerprint (otherwise create/cancel callout would be a free reroll).
 *   - Every write to fighter.offerBoard is a conditional Fighter.updateOne with
 *     runValidators. Never fighter.save() with a modified offerBoard.
 *   - Expiry is checked lazily on read. No Redis, no BullMQ.
 */

const Fighter = require("../models/fighterModel");
const fightService = require("./fightService");
const analyticsService = require("./analyticsService");
const { OFFER_BOARD_TTL_HOURS, OFFER_REROLL_COST_FRAC } = require("../consts/offerBoardConfig");
const { PROMOTION_TIERS } = require("../consts/gameConstants");
const { isFightBlocked } = require("../utils/injuryUtils");

const TTL_MS = OFFER_BOARD_TTL_HOURS * 60 * 60 * 1000;
const DIFFICULTY_TYPES = ["Easy", "Even", "Hard"];
const POOL_EMPTY_MESSAGE = "No opponents are available in your division right now. Check back soon.";

/** code -> [status, message]. FIGHT_BLOCKED_INJURY and NOT_ENOUGH_CASH take a runtime message. */
const BOARD_ERRORS = {
    OFFER_NOT_ON_BOARD:   [409, "That bout is no longer on your board."],
    FIGHT_ALREADY_BOOKED: [409, "You already have a fight booked."],
    TITLE_SHOT_LOCKED:    [400, "Your title shot is still locked."],
    FIGHT_BLOCKED_INJURY: [400, null],
    OFFER_BOARD_FROZEN:   [409, "You can't reroll while a fight is booked."],
    REROLL_USED:          [409, "You've already rerolled this set."],
    OFFER_BOARD_STALE:    [409, "Your offers changed. Load the new set first."],
    NOT_ENOUGH_CASH:      [400, null],
    OFFER_POOL_EMPTY:     [409, "No other opponents are available right now."],
};

/** Same shape as campError in homeCampCoachService: Error + code + status. */
function boardError(code, message, status) {
    const def = BOARD_ERRORS[code] || [400, null];
    const err = new Error(message || def[1] || "Request failed");
    err.code = code;
    err.status = status || def[0];
    return err;
}

function injuryError(injury) {
    return boardError("FIGHT_BLOCKED_INJURY", fightService.fightBlockedMessage(injury), 400);
}

function cashError(cost) {
    return boardError("NOT_ENOUGH_CASH", `Not enough cash (a reroll costs $${cost})`, 400);
}

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const toIso = (d) => {
    if (!d) return null;
    const t = new Date(d).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Plain joined string of every field that decides which opponents are on the board.
 * activeCallout, titleShotCooldown and topFiveWinsInTier are deliberately NOT in it.
 * @returns {string}
 */
function boardFingerprint(fighter) {
    const f = fighter || {};
    const nemesisId = f.nemesis?.opponentId ?? "-";
    const pending = f.pendingPromotion ?? "-";
    const last = f.lastFightDate ? new Date(f.lastFightDate).getTime() : 0;
    return `${f.promotionTier}|${f.weightClass}|${nemesisId}|${pending}|${Number.isFinite(last) ? last : 0}`;
}

/** @returns {boolean} */
function isBoardLive(board, fighter, now = new Date()) {
    return board != null
        && Array.isArray(board.slots) && board.slots.length > 0
        && board.expiresAt != null && now < new Date(board.expiresAt)
        && board.fingerprint === boardFingerprint(fighter);
}

/** @returns {number|null} */
function rerollCostFor(tier) {
    if (typeof tier !== "string" || !hasOwn(PROMOTION_TIERS, tier)) return null;
    const fee = PROMOTION_TIERS[tier].signingFee;
    return Number.isFinite(fee) ? Math.round(fee * OFFER_REROLL_COST_FRAC) : null;
}

/** @returns {OfferBoardMeta} */
function emptyBoardMeta(tier) {
    return {
        generatedAt: null,
        expiresAt: null,
        rerollUsed: false,
        rerollCost: rerollCostFor(tier),
        canReroll: false,
        rerollBlockedBy: "no_board",
        frozen: false,
        blockedReason: null,
        blockedCode: null,
    };
}

/** Stored slots as plain {offerType, opponentId} (subdocs or plain objects). */
function slotsOf(board) {
    return (board && Array.isArray(board.slots) ? board.slots : [])
        .filter((s) => s && s.offerType && s.opponentId)
        .map((s) => ({ offerType: s.offerType, opponentId: s.opponentId }));
}

function hasBoard(board) {
    return !!(board && board.generatedAt);
}

/**
 * @param {Object} p
 * @param {Object} p.fighter
 * @param {?Object} p.board     the board the offers came from (null when none)
 * @param {boolean} p.live      the board is persisted and live (reroll possible)
 * @param {boolean} [p.frozen]
 * @param {?string} [p.blockedCode]
 * @param {?string} [p.blockedReason]
 * @returns {OfferBoardMeta}
 */
function buildMeta({ fighter, board, live, frozen = false, blockedCode = null, blockedReason = null }) {
    const cost = rerollCostFor(fighter.promotionTier);
    const rerollUsed = !!(board && board.rerollUsed);
    let by = null;
    if (frozen) by = "frozen";
    else if (blockedCode) by = "blocked";
    else if (!live || !hasBoard(board) || cost == null) by = "no_board";
    else if (rerollUsed) by = "used";
    else if ((Number(fighter.iron) || 0) < cost) by = "cash";
    return {
        generatedAt: toIso(board && board.generatedAt),
        expiresAt: toIso(board && board.expiresAt),
        rerollUsed,
        rerollCost: cost,
        canReroll: by === null,
        rerollBlockedBy: by,
        frozen: !!frozen,
        blockedReason: blockedReason ?? null,
        blockedCode: blockedCode ?? null,
    };
}

function markAcceptable(offers, frozen) {
    for (const o of offers) {
        o.acceptable = !frozen && !(o.type === "TitleShot" && o.locked);
    }
    return offers;
}

function newBoardDoc(fighter, slots, now, rerollUsed = false) {
    return {
        slots,
        generatedAt: now,
        expiresAt: new Date(now.getTime() + TTL_MS),
        rerollUsed,
        promotionTier: fighter.promotionTier,
        weightClass: fighter.weightClass,
        // AFTER pickOfferSlots: generation can clear a stale nemesis or pendingPromotion.
        fingerprint: boardFingerprint(fighter),
    };
}

async function loadFighter(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    return fighter;
}

// ── getBoard ─────────────────────────────────────────────────────────────────

/**
 * Read (and on a miss, generate and persist) the fighter's offer board.
 * @param {string} fighterId
 * @returns {Promise<{offers: BoardOffer[], meta: OfferBoardMeta}>}
 */
async function getBoard(fighterId) {
    const fighter = await loadFighter(fighterId);
    const now = new Date();
    const board = hasBoard(fighter.offerBoard) ? fighter.offerBoard : null;
    const injury = isFightBlocked(fighter);
    const injuryReason = injury ? fightService.fightBlockedMessage(injury) : null;

    // Frozen: a fight is booked. No generation, no clearing; show what is stored, read-only.
    if (fighter.acceptedFightId) {
        let offers = [];
        if (board && board.slots && board.slots.length) {
            ({ offers } = await fightService.hydrateOffers(fighter, slotsOf(board)));
        }
        return {
            offers: markAcceptable(offers, true),
            meta: buildMeta({
                fighter, board, live: false, frozen: true,
                blockedCode: injury ? "INJURY" : null,
                blockedReason: injuryReason,
            }),
        };
    }

    // Blocked by injury: nothing is shown and nothing persists while blocked.
    if (injury) {
        if (board) {
            try {
                await Fighter.updateOne(
                    { _id: fighter._id, "offerBoard.generatedAt": board.generatedAt },
                    { $set: { offerBoard: null } },
                    { runValidators: true }
                );
            } catch (err) {
                // The response does not depend on the clear; the next blocked read retries it.
                console.error("[offerBoard] clear on injury failed:", err.message);
            }
        }
        return {
            offers: [],
            meta: buildMeta({ fighter, board: null, live: false, blockedCode: "INJURY", blockedReason: injuryReason }),
        };
    }

    // Live board: hydrate. A vanished opponent falls through to regeneration.
    if (isBoardLive(board, fighter, now)) {
        const { offers, missing } = await fightService.hydrateOffers(fighter, slotsOf(board));
        if (!missing) {
            return { offers: markAcceptable(offers, false), meta: buildMeta({ fighter, board, live: true }) };
        }
    }

    return generateAndStore(fighter, board ? board.generatedAt : null, now);
}

async function generateAndStore(fighter, seenGeneratedAt, now) {
    const slots = await fightService.pickOfferSlots(fighter);
    if (!slots.length) {
        return {
            offers: [],
            meta: buildMeta({ fighter, board: null, live: false, blockedCode: "POOL_EMPTY", blockedReason: POOL_EMPTY_MESSAGE }),
        };
    }

    const board = newBoardDoc(fighter, slots, now);
    const res = await Fighter.updateOne(
        { _id: fighter._id, acceptedFightId: null, "offerBoard.generatedAt": seenGeneratedAt ?? null },
        { $set: { offerBoard: board } },
        { runValidators: true }
    );

    if (!res || res.modifiedCount === 0) {
        // Lost the compare-and-set: another request wrote first (or a fight was booked).
        const fresh = await Fighter.findById(fighter._id);
        if (fresh) {
            const freshBoard = hasBoard(fresh.offerBoard) ? fresh.offerBoard : null;
            const frozen = !!fresh.acceptedFightId;
            if (isBoardLive(freshBoard, fresh, now)) {
                const { offers, missing } = await fightService.hydrateOffers(fresh, slotsOf(freshBoard));
                if (!missing) {
                    return {
                        offers: markAcceptable(offers, frozen),
                        meta: buildMeta({ fighter: fresh, board: freshBoard, live: !frozen, frozen }),
                    };
                }
            }
            // Fall back to the local board, unpersisted (no reroll against it).
            const { offers } = await fightService.hydrateOffers(fresh, slots);
            return {
                offers: markAcceptable(offers, frozen),
                meta: buildMeta({ fighter: fresh, board, live: false, frozen }),
            };
        }
        const { offers } = await fightService.hydrateOffers(fighter, slots);
        return { offers: markAcceptable(offers, false), meta: buildMeta({ fighter, board, live: false }) };
    }

    const { offers } = await fightService.hydrateOffers(fighter, slots);
    return { offers: markAcceptable(offers, false), meta: buildMeta({ fighter, board, live: true }) };
}

// ── rerollBoard ──────────────────────────────────────────────────────────────

/**
 * Pay to replace the current board once. Money moves only in the single conditional
 * write below, after generation has succeeded.
 * @param {string} fighterId
 * @param {string} userId analytics only
 * @returns {Promise<{offers: BoardOffer[], meta: OfferBoardMeta, cashAfter: number}>}
 */
async function rerollBoard(fighterId, userId) {
    const fighter = await loadFighter(fighterId);
    const now = new Date();
    const tier = fighter.promotionTier;
    const cost = rerollCostFor(tier);
    const prev = hasBoard(fighter.offerBoard) ? fighter.offerBoard : null;

    if (fighter.acceptedFightId) throw boardError("OFFER_BOARD_FROZEN");
    const injury = isFightBlocked(fighter);
    if (injury) throw injuryError(injury);
    if (cost == null || !isBoardLive(prev, fighter, now)) throw boardError("OFFER_BOARD_STALE");
    if (prev.rerollUsed) throw boardError("REROLL_USED");
    if ((Number(fighter.iron) || 0) < cost) throw cashError(cost);

    // Soft-avoid the previous difficulty picks so the player does not pay for the same three.
    const nemesisId = fighter.nemesis?.opponentId ? String(fighter.nemesis.opponentId) : null;
    const avoidOpponentIds = slotsOf(prev)
        .filter((s) => DIFFICULTY_TYPES.includes(s.offerType) && String(s.opponentId) !== nemesisId)
        .map((s) => s.opponentId);

    const slots = await fightService.pickOfferSlots(fighter, { avoidOpponentIds });
    if (!slots.length) throw boardError("OFFER_POOL_EMPTY");

    const board = newBoardDoc(fighter, slots, now, true);
    const res = await Fighter.updateOne(
        {
            _id: fighter._id,
            acceptedFightId: null,
            iron: { $gte: cost },
            "offerBoard.generatedAt": prev.generatedAt,
            "offerBoard.rerollUsed": false,
        },
        { $inc: { iron: -cost }, $set: { offerBoard: board } },
        { runValidators: true }
    );

    if (!res || res.modifiedCount === 0) {
        const fresh = await Fighter.findById(fighter._id).lean();
        if (!fresh) throw new Error("Fighter not found");
        if (fresh.offerBoard && fresh.offerBoard.rerollUsed) throw boardError("REROLL_USED");
        if ((Number(fresh.iron) || 0) < cost) throw cashError(cost);
        if (fresh.acceptedFightId) throw boardError("OFFER_BOARD_FROZEN");
        throw boardError("OFFER_BOARD_STALE");
    }

    // Fire-and-forget: track() never rejects, but guard anyway so a bug there cannot surface.
    Promise.resolve()
        .then(() => analyticsService.track(userId, "offers_rerolled", { tier, cost }, { fighterId: fighter._id }))
        .catch((err) => console.error("[offerBoard] reroll analytics failed:", err && err.message));

    const cashAfter = (Number(fighter.iron) || 0) - cost;
    const { offers } = await fightService.hydrateOffers(fighter, slots);
    const metaFighter = { promotionTier: tier, iron: cashAfter };
    return {
        offers: markAcceptable(offers, false),
        meta: buildMeta({ fighter: metaFighter, board, live: true }),
        cashAfter,
    };
}

// ── resolveBoardOffer ────────────────────────────────────────────────────────

/**
 * The one gate for createOffer / acceptOffer: the opponent must be on the live board
 * (the callout overlay counts). Never generates.
 * @param {Object} fighterDoc hydrated Fighter doc
 * @param {*} opponentId
 * @returns {Promise<BoardOffer>}
 */
async function resolveBoardOffer(fighterDoc, opponentId) {
    if (fighterDoc.acceptedFightId) throw boardError("FIGHT_ALREADY_BOOKED");
    const injury = isFightBlocked(fighterDoc);
    if (injury) throw injuryError(injury);

    const board = hasBoard(fighterDoc.offerBoard) ? fighterDoc.offerBoard : null;
    if (!isBoardLive(board, fighterDoc)) throw boardError("OFFER_NOT_ON_BOARD");

    const { offers, missing } = await fightService.hydrateOffers(fighterDoc, slotsOf(board));
    if (missing) throw boardError("OFFER_NOT_ON_BOARD");

    const wanted = String(opponentId);
    const offer = offers.find((o) => o.opponent && String(o.opponent._id) === wanted);
    if (!offer) throw boardError("OFFER_NOT_ON_BOARD");
    if (offer.type === "TitleShot" && offer.locked) throw boardError("TITLE_SHOT_LOCKED");

    offer.acceptable = true;
    return offer;
}

module.exports = {
    getBoard,
    rerollBoard,
    resolveBoardOffer,
    boardFingerprint,
    isBoardLive,
    rerollCostFor,
    emptyBoardMeta,
    boardError,
};
