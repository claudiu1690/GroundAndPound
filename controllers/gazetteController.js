/**
 * Octagon Gazette controller.
 *
 * v2.0 — the gazette is a PERSISTED doc on `fighter.gazette`, regenerated after every
 * meaningful career-feed event (see gazetteService.regenerateGazette). This endpoint is
 * a thin read of the saved edition; it does NOT compose or mutate anything. The frontend
 * normally reads `fighter.gazette` straight off the fighter payload — this route exists
 * only as a standalone fetch of the same persisted doc.
 */
const Fighter = require("../models/fighterModel");

/**
 * GET /gazette/:fighterId
 *
 * Returns the persisted gazette doc for the fighter. issueNumber===0 / leadStory===null
 * is the legitimate empty (no-edition-yet) state — returned as-is for the client to
 * display its empty state.
 */
async function getGazette(req, res) {
    try {
        const fighter = await Fighter.findById(req.params.fighterId).lean();
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });
        return res.json(fighter.gazette || null);
    } catch (err) {
        console.error("[gazette] getGazette failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getGazette };
