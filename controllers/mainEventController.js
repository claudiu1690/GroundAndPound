const mainEventService = require("../services/mainEventService");

/**
 * GET /events/current?fighterId=... — current event + your prediction (if any) + history.
 * fighterId is optional; when missing, prediction/history come back empty.
 */
async function getCurrent(req, res) {
    try {
        const fighterId = req.query.fighterId || null;
        const { current, justResolved } = await mainEventService.getCurrentEvent();
        const myPrediction = fighterId && current
            ? await mainEventService.getFighterPredictionForEvent(fighterId, current.id)
            : null;
        const history = fighterId ? await mainEventService.listHistory(fighterId, 10) : [];
        res.json({ current, justResolved, myPrediction, history });
    } catch (err) {
        if (err.message?.startsWith("Not enough opponents")
            || err.message?.startsWith("Insufficient opponents")) {
            return res.status(503).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/** POST /events/:eventId/predict — body: { fighterId, pickedSide, pickedMethod } */
async function postPrediction(req, res) {
    try {
        const { eventId } = req.params;
        const { fighterId, pickedSide, pickedMethod } = req.body || {};
        if (!fighterId || !pickedSide) {
            return res.status(400).json({ message: "fighterId and pickedSide are required" });
        }
        const pred = await mainEventService.submitPrediction(fighterId, eventId, pickedSide, pickedMethod);
        res.status(201).json({ prediction: pred });
    } catch (err) {
        if (err.message === "Event not found") return res.status(404).json({ message: err.message });
        const client = [
            "Invalid side",
            "Invalid method",
            "Event already resolved",
            "You have already predicted this event",
        ];
        if (client.includes(err.message)) return res.status(400).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/** GET /events/history?fighterId=...&limit=10 — history for a fighter. */
async function getHistory(req, res) {
    try {
        const { fighterId } = req.query;
        if (!fighterId) return res.status(400).json({ message: "fighterId is required" });
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));
        const history = await mainEventService.listHistory(fighterId, limit);
        res.json({ history });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getCurrent, postPrediction, getHistory };
