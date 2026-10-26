/**
 * Persisted fight offer board: lifecycle, liveness and slot resolution.
 *
 * fightService keeps the matchmaking rules (pickOfferSlots / hydrateOffers); this file
 * owns everything about the stored board on the fighter document (fighter.offerBoard).
 *
 * THIS JSDoc BLOCK IS THE SINGLE SOURCE OF TRUTH FOR THE SHARED BOARD TYPES.
 * GET /fights/offers/:fighterId and the dashboard `offers` block both reference these;
 * do not re-describe them elsewhere.
 *
 * @typedef {Object} OfferBoardMeta
 * @property {?string} generatedAt   ISO, null when there is no board
 * @property {?string} expiresAt     ISO, null when there is no board
 * @property {boolean} frozen        a fight is booked (fighter.acceptedFightId)
 * @property {?string} blockedReason player-facing text, set with blockedCode
 * @property {?("INJURY"|"POOL_EMPTY")} blockedCode
 *
 * @typedef {Object} BoardOffer
 * The element shape the old generateOffers returned, plus `acceptable`:
 * @property {"Easy"|"Even"|"Hard"|"TitleShot"} type
 * @property {Object} opponent       full lean Opponent + displayRank (TitleShot OVR is x1.05).
 *           opponent.displayRank is DISPLAY-READY: the number the Rankings tab prints
 *           (rankingService.npcDisplayRank), null for the champion and for an unranked
 *           opponent. Render it as-is; never apply toDisplayRank to it.
 * @property {{record:{wins:number,losses:number,draws:number},
 *            streak:?{result:string,count:number}, lastThree:Array}} context
 *           recomputed from the opponent's current fightHistory at every read
 * @property {?{lossCount:number,setAt:?Date}} [nemesisMeta]
 * @property {boolean} [isCallout]   the active callout overlay (Hard slot)
 * @property {{cost:number,isStretch:boolean,calledAt:?Date}} [calloutMeta]
 * @property {{targetTier:?string, tier:string, titleDefense:boolean, gcsTitleWins:number}} [titleShotMeta]
 *           TitleShot only. targetTier: the promotion on a win (null at GCS); tier: the
 *           fighter's tier (whose belt is on the line); titleDefense: GCS and the player
 *           already holds the belt (gcsTitleWins > 0); gcsTitleWins: career GCS belt wins.
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
 *     fingerprint (otherwise create/cancel callout would turn the board over).
 *   - Every write to fighter.offerBoard is a conditional Fighter.updateOne with
 *     runValidators. Never fighter.save() with a modified offerBoard.
 *   - Expiry is checked lazily on read. No Redis, no BullMQ.
 */

const Fighter = require("../models/fighterModel");
const fightService = require("./fightService");
const { OFFER_BOARD_TTL_HOURS } = require("../consts/offerBoardConfig");
const { isFightBlocked } = require("../utils/injuryUtils");

const TTL_MS = OFFER_BOARD_TTL_HOURS * 60 * 60 * 1000;
const POOL_EMPTY_MESSAGE = "No opponents are available in your division right now. Check back soon.";

/** code -> [status, message]. FIGHT_BLOCKED_INJURY takes a runtime message. */
const BOARD_ERRORS = {
    OFFER_NOT_ON_BOARD:   [409, "That bout is no longer on your board."],
    FIGHT_ALREADY_BOOKED: [409, "You already have a fight booked."],
    TITLE_SHOT_LOCKED:    [400, "Your title shot is still locked."],
    FIGHT_BLOCKED_INJURY: [400, null],
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

const toIso = (d) => {
    if (!d) return null;
    const t = new Date(d).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Plain joined string of every field that decides which opponents are on the board.
 * activeCallout, titleShotCooldown, topFiveWinsInTier and gcsTitleWins are deliberately
 * NOT in it. The fourth segment is the contender token: the pending destination tier,
 * the top tier for a GCS fighter (always a contender), "-" otherwise.
 * @returns {string}
 */
function boardFingerprint(fighter) {
    const f = fighter || {};
    const nemesisId = f.nemesis?.opponentId ?? "-";
    const pending = fightService.isTitleContender(f) ? (f.pendingPromotion ?? fightService.TOP_TIER) : "-";
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

/** @returns {OfferBoardMeta} */
function emptyBoardMeta() {
    return {
        generatedAt: null,
        expiresAt: null,
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
 * @param {?Object} p.board     the board the offers came from (null when none)
 * @param {boolean} [p.frozen]
 * @param {?string} [p.blockedCode]
 * @param {?string} [p.blockedReason]
 * @returns {OfferBoardMeta}
 */
function buildMeta({ board, frozen = false, blockedCode = null, blockedReason = null }) {
    return {
        generatedAt: toIso(board && board.generatedAt),
        expiresAt: toIso(board && board.expiresAt),
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

function newBoardDoc(fighter, slots, now) {
    return {
        slots,
        generatedAt: now,
        expiresAt: new Date(now.getTime() + TTL_MS),
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
                board, frozen: true,
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
            meta: buildMeta({ board: null, blockedCode: "INJURY", blockedReason: injuryReason }),
        };
    }

    // Live board: hydrate. A vanished opponent falls through to regeneration.
    if (isBoardLive(board, fighter, now)) {
        const { offers, missing } = await fightService.hydrateOffers(fighter, slotsOf(board));
        if (!missing) {
            return { offers: markAcceptable(offers, false), meta: buildMeta({ board }) };
        }
    }

    return generateAndStore(fighter, board ? board.generatedAt : null, now);
}

async function generateAndStore(fighter, seenGeneratedAt, now) {
    const slots = await fightService.pickOfferSlots(fighter);
    if (!slots.length) {
        return {
            offers: [],
            meta: buildMeta({ board: null, blockedCode: "POOL_EMPTY", blockedReason: POOL_EMPTY_MESSAGE }),
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
                        meta: buildMeta({ board: freshBoard, frozen }),
                    };
                }
            }
            // Fall back to the local board, unpersisted.
            const { offers } = await fightService.hydrateOffers(fresh, slots);
            return {
                offers: markAcceptable(offers, frozen),
                meta: buildMeta({ board, frozen }),
            };
        }
        const { offers } = await fightService.hydrateOffers(fighter, slots);
        return { offers: markAcceptable(offers, false), meta: buildMeta({ board }) };
    }

    const { offers } = await fightService.hydrateOffers(fighter, slots);
    return { offers: markAcceptable(offers, false), meta: buildMeta({ board }) };
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
    resolveBoardOffer,
    boardFingerprint,
    isBoardLive,
    emptyBoardMeta,
    boardError,
};
