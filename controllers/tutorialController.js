/**
 * Tutorial controllers: first-session (debut) flow state and seen tips.
 * Contract: docs/first-session-contract.md B.1. Response shapes: services/tutorialService.js
 * `@typedef TutorialState`. All routes are ownership-guarded (routes/tutorialRoutes.js).
 */
const tutorialService = require("../services/tutorialService");

/**
 * GET /tutorial/:fighterId
 * 200 TutorialState { completed, current_step, version, tipsSeen }.
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
 * Body: { step }. Advances to the next debut step after validating the sequence.
 * "complete" is never a valid target here (400 TUTORIAL_INVALID_STEP).
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
 * Marks the tutorial complete ("End tutorial"). Credits nothing: ironRewarded is always 0
 * (the signing bonus is paid by the first PvE fight's resolve). Idempotent.
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

/**
 * POST /tutorial/:fighterId/tips/seen
 * Body: { key } where key is one of consts/tutorialConfig TIP_KEYS. 200 { tipsSeen }.
 */
async function markTipSeen(req, res) {
    try {
        const out = await tutorialService.markTipSeen(req.params.fighterId, req.body?.key);
        res.json(out);
    } catch (err) {
        if (err.code === "INVALID_TIP_KEY") {
            return res.status(400).json({ message: "Invalid tip key", code: "INVALID_TIP_KEY" });
        }
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error("[tutorial] markTipSeen failed:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getTutorial, advanceTutorial, completeTutorial, markTipSeen };
