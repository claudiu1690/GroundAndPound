const mongoose = require("mongoose");
const fightService = require("../services/fightService");
const offerBoardService = require("../services/offerBoardService");
const interviewService = require("../services/interviewService");

const FIGHT_ERROR_CODES = {
    DOCTOR_VISIT_REQUIRED: "FIGHT_DOCTOR_VISIT_REQUIRED",
    NOT_ENOUGH_ENERGY: "FIGHT_NOT_ENOUGH_ENERGY",
    NO_ACCEPTED_FIGHT: "FIGHT_NO_ACCEPTED_FIGHT",
    INVALID_STRATEGY: "FIGHT_INVALID_STRATEGY",
    INVALID_WEIGHT_CUT: "FIGHT_INVALID_WEIGHT_CUT",
    MENTAL_RESET_REQUIRED: "FIGHT_MENTAL_RESET_REQUIRED",
    // Offer board (services/offerBoardService.js builds these with boardError).
    OFFER_INVALID_INPUT: "OFFER_INVALID_INPUT",
    OFFER_NOT_ON_BOARD: "OFFER_NOT_ON_BOARD",
    FIGHT_ALREADY_BOOKED: "FIGHT_ALREADY_BOOKED",
    TITLE_SHOT_LOCKED: "TITLE_SHOT_LOCKED",
    FIGHT_BLOCKED_INJURY: "FIGHT_BLOCKED_INJURY",
    OFFER_BOARD_FROZEN: "OFFER_BOARD_FROZEN",
    REROLL_USED: "REROLL_USED",
    OFFER_BOARD_STALE: "OFFER_BOARD_STALE",
    NOT_ENOUGH_CASH: "NOT_ENOUGH_CASH",
    OFFER_POOL_EMPTY: "OFFER_POOL_EMPTY",
};

const KNOWN_CODES = new Set(Object.values(FIGHT_ERROR_CODES));

/** A strict 24-hex ObjectId string (isValidObjectId also accepts any 12-char string). */
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * Shared mapper for coded service errors ({code, status}, e.g. boardError). Only known
 * codes with a 4xx status are echoed; anything else is left to the caller's 500 path so
 * internal details never reach the client. Returns true when a response was sent.
 */
function sendCodedError(res, err) {
    if (!err || !err.code || !err.status) return false;
    const status = Number(err.status);
    if (!KNOWN_CODES.has(err.code) || !(status >= 400 && status < 500)) return false;
    res.status(status).json({ message: err.message, code: err.code });
    return true;
}

function sendInternalError(res, err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
}

async function getOffers(req, res) {
    try {
        const { offers, meta } = await offerBoardService.getBoard(req.params.fighterId);
        res.json({ offers, board: meta });
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (sendCodedError(res, err)) return;
        sendInternalError(res, err);
    }
}

async function createOffer(req, res) {
    try {
        const { fighterId } = req.params;
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const { opponentId } = body; // body.offerType is accepted and ignored: the board decides the type
        if (typeof opponentId !== "string" || !OBJECT_ID_RE.test(opponentId)) {
            return res.status(400).json({ message: "opponentId is required", code: FIGHT_ERROR_CODES.OFFER_INVALID_INPUT });
        }
        const fight = await fightService.createOffer(fighterId, opponentId);
        res.status(201).json(fight);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (sendCodedError(res, err)) return;
        sendInternalError(res, err);
    }
}

async function acceptOffer(req, res) {
    try {
        const { fighterId, fightId } = req.params;
        if (!mongoose.isValidObjectId(fightId)) {
            return res.status(404).json({ message: "Fight not found or not available" });
        }
        const fight = await fightService.acceptOffer(fighterId, fightId, req.user.id);
        res.json(fight);
    } catch (err) {
        if (sendCodedError(res, err)) return;
        if (err.message === "Fighter not found" || err.message === "Fight not found or not available") {
            return res.status(404).json({ message: err.message });
        }
        if (err.message === "Not enough energy") {
            return res.status(400).json({ message: err.message, code: FIGHT_ERROR_CODES.NOT_ENOUGH_ENERGY });
        }
        sendInternalError(res, err);
    }
}

async function rerollOffers(req, res) {
    try {
        const { offers, meta, cashAfter } = await offerBoardService.rerollBoard(req.params.fighterId, req.user.id);
        res.json({ offers, board: meta, cashAfter });
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (sendCodedError(res, err)) return;
        sendInternalError(res, err);
    }
}

async function setWeightCut(req, res) {
    try {
        const { fighterId, fightId, weightCut } = req.body;
        if (!fighterId || !fightId || !weightCut) {
            return res.status(400).json({ message: "fighterId, fightId, and weightCut are required" });
        }
        const fight = await fightService.setWeightCut(fighterId, fightId, weightCut);
        res.json(fight);
    } catch (err) {
        if (err.message === "Invalid weight cut strategy") {
            return res.status(400).json({ message: err.message, code: FIGHT_ERROR_CODES.INVALID_WEIGHT_CUT });
        }
        if (err.message === "Fight not found or not accepted") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function setStrategy(req, res) {
    try {
        const { fighterId, fightId, strategy } = req.body;
        if (!fighterId || !fightId || !strategy) {
            return res.status(400).json({ message: "fighterId, fightId, and strategy are required" });
        }
        const fight = await fightService.setStrategy(fighterId, fightId, strategy);
        res.json(fight);
    } catch (err) {
        if (err.message === "Invalid strategy") {
            return res.status(400).json({ message: err.message, code: FIGHT_ERROR_CODES.INVALID_STRATEGY });
        }
        if (err.message === "Fight not found or not accepted") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function resolveFight(req, res) {
    try {
        const result = await fightService.resolveFightAndApply(req.params.fighterId, req.user.id);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found" || err.message === "Fight not found" || err.message === "Opponent not found") return res.status(404).json({ message: err.message });
        if (err.message === "No accepted fight" || err.message === "Not enough energy"
            || err.message?.startsWith("Cannot fight:")
            || err.message?.startsWith("Mental Reset required")) {
            let code = null;
            if (err.message === "No accepted fight") code = FIGHT_ERROR_CODES.NO_ACCEPTED_FIGHT;
            else if (err.message === "Not enough energy") code = FIGHT_ERROR_CODES.NOT_ENOUGH_ENERGY;
            else if (err.message?.startsWith("Cannot fight:")) code = FIGHT_ERROR_CODES.DOCTOR_VISIT_REQUIRED;
            else if (err.message?.startsWith("Mental Reset required")) code = FIGHT_ERROR_CODES.MENTAL_RESET_REQUIRED;
            return res.status(400).json({ message: err.message, code });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getInterviewCandidates(req, res) {
    try {
        const { fighterId, excludeOpponentId } = req.query;
        if (!fighterId) return res.status(400).json({ message: "fighterId is required" });
        // Ownership guard — a caller may only read their own callout candidates.
        if (String(fighterId) !== String(req.user && req.user.fighterId)) {
            return res.status(403).json({ message: "Forbidden — you can only act on your own fighter" });
        }
        const candidates = await interviewService.listCalloutCandidates(fighterId, excludeOpponentId || null);
        res.json({ candidates });
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function postInterview(req, res) {
    try {
        const { fightId } = req.params;
        const { fighterId, choice, targetOpponentId } = req.body;
        if (!fighterId || !choice) {
            return res.status(400).json({ message: "fighterId and choice are required" });
        }
        // Ownership guard — a caller may only resolve their own fighter's interview
        // (this mutates persona/fame/flags/iron). 403 on mismatch.
        if (String(fighterId) !== String(req.user && req.user.fighterId)) {
            return res.status(403).json({ message: "Forbidden — you can only act on your own fighter" });
        }
        const result = await interviewService.resolveInterview({
            fighterId, fightId, choice, targetOpponentId: targetOpponentId || null,
        });
        res.json(result);
    } catch (err) {
        if (err.message === "Fight not found" || err.message === "Fighter not found" || err.message === "Target opponent not found") {
            return res.status(404).json({ message: err.message });
        }
        const clientErrors = [
            "Invalid interview choice",
            "Fight does not belong to this fighter",
            "Fight is not completed",
            "Target opponent required for call-out",
            "Cannot call out the fighter you just beat — pick someone new",
            "Target must share your weight class",
            "Target is outside your callable tier range",
            "Target is outside your callable range — use the Callout tab for stretch-tier targets",
            "Target is too far out of your OVR range — pick someone you can realistically face",
            "You've already beaten this fighter — pick a fresh opponent",
        ];
        if (clientErrors.includes(err.message)) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getFightBreakdown(req, res) {
    try {
        const { fightId } = req.params;
        if (!mongoose.isValidObjectId(fightId)) {
            return res.status(404).json({ message: "Fight not found", code: "fight_not_found" });
        }
        const breakdown = await fightService.getFightBreakdown(fightId, req.user.fighterId);
        if (!breakdown) {
            return res.status(404).json({ message: "Fight not found", code: "fight_not_found" });
        }
        res.json(breakdown);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = {
    getOffers,
    createOffer,
    acceptOffer,
    rerollOffers,
    setWeightCut,
    setStrategy,
    resolveFight,
    getInterviewCandidates,
    postInterview,
    getFightBreakdown,
};
