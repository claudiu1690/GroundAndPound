const fightCardService = require("../services/mainEventService");
const Fighter = require("../models/fighterModel");

/**
 * GET /events/current?fighterId=... — current card + your bets on it + history +
 * the bet limits for your tier (so the UI can clamp the bet input).
 */
async function getCurrent(req, res) {
    try {
        const fighterId = req.query.fighterId || null;
        const { current, justResolved } = await fightCardService.getCurrentEvent();
        const myPredictions = fighterId && current
            ? await fightCardService.listFighterPredictionsForCard(fighterId, current.id)
            : [];
        const history = fighterId ? await fightCardService.listHistory(fighterId, 20) : [];
        let betLimits = null;
        if (fighterId) {
            const fighter = await Fighter.findById(fighterId).select("promotionTier").lean();
            if (fighter) betLimits = fightCardService.getBetLimitsForFighter(fighter);
        }
        res.json({ current, justResolved, myPredictions, history, betLimits });
    } catch (err) {
        if (err.message?.startsWith("Not enough GCS fighters")
            || err.message?.startsWith("Failed to assemble")) {
            return res.status(503).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * POST /events/:cardId/predict
 * body: { fighterId, fightIndex, betType, pickedSide, pickedMethod, stake }
 *   betType — "WINNER" or "EXACT"
 *   pickedMethod required for EXACT (ignored for WINNER)
 *   stake — iron amount, must be within tier limits + ≤ current balance
 */
async function postPrediction(req, res) {
    try {
        const { cardId } = req.params;
        const { fighterId, fightIndex, betType, pickedSide, pickedMethod, stake } = req.body || {};
        if (!fighterId || !pickedSide || fightIndex == null || !betType || stake == null) {
            return res.status(400).json({ message: "fighterId, fightIndex, betType, pickedSide, and stake are required" });
        }
        const pred = await fightCardService.submitPrediction(
            fighterId, cardId, Number(fightIndex), betType, pickedSide, pickedMethod, stake
        );
        res.status(201).json({ prediction: pred });
    } catch (err) {
        if (err.message === "Card not found") return res.status(404).json({ message: err.message });
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        const clientErrPatterns = [
            /^Invalid (side|method|bet type|fight index)$/,
            /^Card already resolved$/,
            /^You have already bet on this fight$/,
            /^Stake must be /,
            /^Minimum bet at this tier /,
            /^Maximum bet at this tier /,
            /^Not enough iron /,
        ];
        if (clientErrPatterns.some((re) => re.test(err.message))) {
            return res.status(400).json({ message: err.message });
        }
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
