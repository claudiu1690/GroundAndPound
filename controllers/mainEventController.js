const fightCardService = require("../services/mainEventService");

/**
 * GET /events/current?fighterId=... — current card + your predictions on it + history.
 */
async function getCurrent(req, res) {
    try {
        const fighterId = req.query.fighterId || null;
        const { current, justResolved } = await fightCardService.getCurrentEvent();
        const myPredictions = fighterId && current
            ? await fightCardService.listFighterPredictionsForCard(fighterId, current.id)
            : [];
        const history = fighterId ? await fightCardService.listHistory(fighterId, 20) : [];
        res.json({ current, justResolved, myPredictions, history });
    } catch (err) {
        if (err.message?.startsWith("Not enough GCS fighters")
            || err.message?.startsWith("Failed to assemble")) {
            return res.status(503).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/** POST /events/:cardId/predict — body: { fighterId, fightIndex, pickedSide, pickedMethod } */
async function postPrediction(req, res) {
    try {
        const { cardId } = req.params;
        const { fighterId, fightIndex, pickedSide, pickedMethod } = req.body || {};
        if (!fighterId || !pickedSide || fightIndex == null) {
            return res.status(400).json({ message: "fighterId, fightIndex, and pickedSide are required" });
        }
        const pred = await fightCardService.submitPrediction(
            fighterId, cardId, Number(fightIndex), pickedSide, pickedMethod
        );
        res.status(201).json({ prediction: pred });
    } catch (err) {
        if (err.message === "Card not found") return res.status(404).json({ message: err.message });
        const client = [
            "Invalid side",
            "Invalid method",
            "Invalid fight index",
            "Card already resolved",
            "You have already predicted this fight",
        ];
        if (client.includes(err.message)) return res.status(400).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/** GET /events/history?fighterId=...&limit=20 */
async function getHistory(req, res) {
    try {
        const { fighterId } = req.query;
        if (!fighterId) return res.status(400).json({ message: "fighterId is required" });
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
        const history = await fightCardService.listHistory(fighterId, limit);
        res.json({ history });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getCurrent, postPrediction, getHistory };
