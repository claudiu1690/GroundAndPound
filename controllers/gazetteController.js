/**
 * Octagon Gazette controllers — daily newspaper modal.
 */
const Fighter = require("../models/fighterModel");
const gazetteService = require("../services/gazetteService");

/**
 * GET /gazette/:fighterId
 *
 * Returns the gazette payload for the given fighter. Read-only — does NOT update
 * lastShownDate. The client decides whether to show the modal based on the
 * `alreadyShownToday` flag in the response.
 */
async function getGazette(req, res) {
    try {
        const fighter = await Fighter.findById(req.params.fighterId);
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });

        // First-ever-login guard: brand-new accounts with no fight history don't see
        // the gazette until they have at least one fight under their belt.
        const r = fighter.record || {};
        const totalFights = (r.wins || 0) + (r.losses || 0) + (r.draws || 0);
        if (totalFights < 1) {
            return res.json({
                date: gazetteService.todayUtc(),
                masthead: "The Octagon Gazette",
                stories: [],
                alreadyShownToday: false,
                newPlayer: true,
            });
        }

        const payload = await gazetteService.composeGazette(fighter);
        res.json(payload);
    } catch (err) {
        console.error("[gazette] getGazette failed:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * POST /gazette/:fighterId/dismiss
 *
 * Marks the gazette as read for today. Resets the baselines used for tomorrow's
 * delta calculations (notoriety + fame tier). Idempotent.
 */
async function dismissGazette(req, res) {
    try {
        const result = await gazetteService.dismissGazette(req.params.fighterId);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error("[gazette] dismissGazette failed:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getGazette, dismissGazette };
