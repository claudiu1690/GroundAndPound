const campService = require("../services/campService");
const { shortfallFields } = require("../utils/energyShortfall");

const CAMP_ERROR_CODES = {
    CAMP_NOT_FOUND:          "CAMP_NOT_FOUND",
    CAMP_FINALISED:          "CAMP_FINALISED",
    CAMP_INJURED:            "CAMP_INJURED",
    CAMP_NO_SLOTS:           "CAMP_NO_SLOTS",
    CAMP_INVALID_SESSION:    "CAMP_INVALID_SESSION",
    CAMP_INVALID_CHOICE:     "CAMP_INVALID_CHOICE",
    CAMP_INVALID_SLOT:       "CAMP_INVALID_SLOT",
    NOT_ENOUGH_ENERGY:       "CAMP_NOT_ENOUGH_ENERGY",
    FIGHT_NOT_FOUND:         "CAMP_FIGHT_NOT_FOUND",
    FIGHT_LOCKED:            "CAMP_FIGHT_LOCKED",
    FORBIDDEN:               "CAMP_FORBIDDEN",
};

function handleError(err, res) {
    const msg = (err && err.message) || "Internal server error";
    if (msg === "Fight not found or not accepted" || msg === "Fight not found" || msg === "Camp not found" || msg === "Opponent not found" || msg === "Fighter not found")
        return res.status(404).json({ message: msg, code: CAMP_ERROR_CODES.FIGHT_NOT_FOUND });
    if (msg === "Fight is resolving or already resolved")
        return res.status(409).json({ message: msg, code: CAMP_ERROR_CODES.FIGHT_LOCKED });
    if (msg === "Forbidden")
        return res.status(403).json({ message: "Access denied", code: CAMP_ERROR_CODES.FORBIDDEN });
    if (msg === "Camp is already finalised")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_FINALISED });
    if (msg === "No slots remaining")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_NO_SLOTS });
    if (msg.startsWith("Invalid session type"))
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_INVALID_SESSION });
    if (msg === "Invalid slot index")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_INVALID_SLOT });
    if (msg === "Resolve camp injury before adding more sessions" || msg === "Resolve camp injury before removing sessions" || msg === "Resolve camp injury before finalising")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_INJURED });
    if (msg === "Invalid choice — must be STOP or PUSH_THROUGH" || msg === "No active camp injury" || msg === "Injury already resolved")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_INVALID_CHOICE });
    if (msg === "Not enough energy")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.NOT_ENOUGH_ENERGY, ...shortfallFields(err) });
    // Shop v1.0: pre-fight supplement selection errors.
    if (msg === "You don't own that supplement" || msg === "Unknown supplement")
        return res.status(400).json({ message: msg });
    console.error("[CampController]", err);
    return res.status(500).json({ message: "Internal server error" });
}

/**
 * Every camp route runs ownFightParam("fightId") first, so the fight belongs to the
 * authenticated fighter. The service always receives req.user.fighterId; any fighterId
 * the client sends in the query or body is accepted and ignored.
 */
function ownFighterId(req) {
    return req.user && req.user.fighterId;
}

/** A missing or non-object body is treated as {} so a missing field is a 400, not a 500. */
function bodyOf(req) {
    return req.body && typeof req.body === "object" ? req.body : {};
}

async function getReport(req, res) {
    try {
        const { fightId } = req.params;
        const report = await campService.getFighterReport(fightId);
        res.json(report);
    } catch (err) {
        handleError(err, res);
    }
}

async function getCampState(req, res) {
    try {
        const { fightId } = req.params;
        const state = await campService.getCampState(fightId, ownFighterId(req));
        res.json(state);
    } catch (err) {
        handleError(err, res);
    }
}

async function addSession(req, res) {
    try {
        const { fightId } = req.params;
        const { sessionType } = bodyOf(req);
        if (!sessionType) return res.status(400).json({ message: "sessionType is required" });
        const result = await campService.addCampSession(fightId, ownFighterId(req), sessionType);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

async function removeSession(req, res) {
    try {
        const { fightId } = req.params;
        const { slotIndex } = bodyOf(req);
        if (slotIndex === undefined) return res.status(400).json({ message: "slotIndex is required" });
        const result = await campService.removeSession(fightId, ownFighterId(req), slotIndex);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

async function resolveInjury(req, res) {
    try {
        const { fightId } = req.params;
        const { choice } = bodyOf(req);
        if (!choice) return res.status(400).json({ message: "choice is required" });
        const camp = await campService.resolveInjury(fightId, ownFighterId(req), choice);
        res.json(camp);
    } catch (err) {
        handleError(err, res);
    }
}

async function finaliseCamp(req, res) {
    try {
        const { fightId } = req.params;
        const { skip } = bodyOf(req);
        const result = await campService.finaliseCamp(fightId, ownFighterId(req), !!skip);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

async function selectBuff(req, res) {
    try {
        const { fightId } = req.params;
        const { buffId } = bodyOf(req);
        // buffId is either a string id or null (clears the selection).
        const result = await campService.selectBuff(fightId, ownFighterId(req), buffId ?? null);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

module.exports = { getReport, getCampState, addSession, removeSession, resolveInjury, finaliseCamp, selectBuff };
