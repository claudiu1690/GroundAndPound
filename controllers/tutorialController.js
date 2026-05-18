/**
 * Tutorial controllers — onboarding walkthrough state endpoints.
 * See: GnP Onboarding & Tutorial Spec v1.0, section 7.
 */
const tutorialService = require("../services/tutorialService");

/**
 * GET /tutorial/:fighterId
 * Returns { completed, current_step }. Called on login to decide whether to
 * mount the tutorial overlay.
 */
async function getTutorial(req, res) {
    try {
        const state = await tutorialService.getState(req.params.fighterId);
        res.json(state);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error("[tutorial] getTutorial failed:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * POST /tutorial/:fighterId/advance
 * Body: { step: 'step_id' }. Advances to the next step after validating that
 * the incoming step is the correct next step in sequence.
 */
async function advanceTutorial(req, res) {
    try {
        const state = await tutorialService.advance(req.params.fighterId, req.body?.step);
        res.json(state);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.code === "TUTORIAL_INVALID_STEP") {
            return res.status(400).json({ message: err.message, code: err.code });
        }
        if (err.message === "Missing step" || err.message === "Tutorial already completed") {
            return res.status(400).json({ message: err.message });
        }
        console.error("[tutorial] advanceTutorial failed:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * POST /tutorial/:fighterId/complete
 * Marks the tutorial complete, credits 500 iron, stamps completed_at.
 */
async function completeTutorial(req, res) {
    try {
        const result = await tutorialService.complete(req.params.fighterId);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error("[tutorial] completeTutorial failed:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getTutorial, advanceTutorial, completeTutorial };
