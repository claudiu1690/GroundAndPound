const campService = require("../services/campService");

const CAMP_ERROR_CODES = {
    CAMP_NOT_FOUND:          "CAMP_NOT_FOUND",
    CAMP_FINALISED:          "CAMP_FINALISED",
    CAMP_INJURED:            "CAMP_INJURED",
    CAMP_NO_SLOTS:           "CAMP_NO_SLOTS",
    CAMP_INVALID_SESSION:    "CAMP_INVALID_SESSION",
    CAMP_INVALID_CHOICE:     "CAMP_INVALID_CHOICE",
    NOT_ENOUGH_ENERGY:       "CAMP_NOT_ENOUGH_ENERGY",
    FIGHT_NOT_FOUND:         "CAMP_FIGHT_NOT_FOUND",
    FORBIDDEN:               "CAMP_FORBIDDEN",
};

function handleError(err, res) {
    const msg = err.message || "Internal server error";
    if (msg === "Fight not found or not accepted" || msg === "Camp not found" || msg === "Opponent not found")
        return res.status(404).json({ message: msg, code: CAMP_ERROR_CODES.FIGHT_NOT_FOUND });
    if (msg === "Forbidden")
        return res.status(403).json({ message: "Access denied", code: CAMP_ERROR_CODES.FORBIDDEN });
    if (msg === "Camp is already finalised")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_FINALISED });
    if (msg === "No slots remaining")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_NO_SLOTS });
    if (msg.startsWith("Invalid session type"))
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_INVALID_SESSION });
    if (msg === "Resolve camp injury before adding more sessions" || msg === "Resolve camp injury before finalising")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_INJURED });
    if (msg === "Invalid choice — must be STOP or PUSH_THROUGH" || msg === "No active camp injury" || msg === "Injury already resolved")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.CAMP_INVALID_CHOICE });
    if (msg === "Not enough energy")
        return res.status(400).json({ message: msg, code: CAMP_ERROR_CODES.NOT_ENOUGH_ENERGY });
    console.error("[CampController]", err);
    return res.status(500).json({ message: "Internal server error" });
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
        const { fighterId } = req.query;
        if (!fighterId) return res.status(400).json({ message: "fighterId is required" });
        const state = await campService.getCampState(fightId, fighterId);
        res.json(state);
    } catch (err) {
        handleError(err, res);
    }
}

async function addSession(req, res) {
    try {
        const { fightId } = req.params;
        const { fighterId, sessionType } = req.body;
        if (!fighterId || !sessionType)
            return res.status(400).json({ message: "fighterId and sessionType are required" });
        const result = await campService.addCampSession(fightId, fighterId, sessionType);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

async function removeSession(req, res) {
    try {
        const { fightId } = req.params;
        const { fighterId, slotIndex } = req.body;
        if (!fighterId || slotIndex === undefined)
            return res.status(400).json({ message: "fighterId and slotIndex are required" });
        const result = await campService.removeSession(fightId, fighterId, slotIndex);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

async function resolveInjury(req, res) {
    try {
        const { fightId } = req.params;
        const { fighterId, choice } = req.body;
        if (!fighterId || !choice)
            return res.status(400).json({ message: "fighterId and choice are required" });
        const camp = await campService.resolveInjury(fightId, fighterId, choice);
        res.json(camp);
    } catch (err) {
        handleError(err, res);
    }
}

async function finaliseCamp(req, res) {
    try {
        const { fightId } = req.params;
        const { fighterId, skip } = req.body;
        if (!fighterId)
            return res.status(400).json({ message: "fighterId is required" });
        const result = await campService.finaliseCamp(fightId, fighterId, !!skip);
        res.json(result);
    } catch (err) {
        handleError(err, res);
    }
}

module.exports = { getReport, getCampState, addSession, removeSession, resolveInjury, finaliseCamp };
