const express = require("express");
const router = express.Router();
const tutorialController = require("../controllers/tutorialController");
const { ownFighterParam } = require("../middleware/ownFighterMiddleware");

// Every tutorial route acts on the caller's own fighter only (mounted after authMiddleware).
const ownFighter = ownFighterParam("fighterId");

/**
 * @swagger
 * /tutorial/{fighterId}:
 *   get:
 *     summary: Get the first-session (debut) tutorial state for a fighter.
 *     tags: [Tutorial]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "TutorialState { completed, current_step (debut_home|debut_offer|debut_report|debut_camp|complete), version: 2, tipsSeen: string[] }."
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: Fighter not found
 */
router.get("/:fighterId", ownFighter, tutorialController.getTutorial);

/**
 * @swagger
 * /tutorial/{fighterId}/advance:
 *   post:
 *     summary: Advance the debut flow to the next step (validated server-side; "complete" is rejected).
 *     tags: [Tutorial]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               step: { type: string }
 *     responses:
 *       200:
 *         description: TutorialState
 *       400:
 *         description: "{ message, code: TUTORIAL_INVALID_STEP } | { message: 'Missing step' } | { message: 'Tutorial already completed' }"
 *       403:
 *         description: Not your fighter
 */
router.post("/:fighterId/advance", ownFighter, tutorialController.advanceTutorial);

/**
 * @swagger
 * /tutorial/{fighterId}/complete:
 *   post:
 *     summary: End the tutorial. Credits nothing (ironRewarded is always 0; the signing bonus is paid by the first fight). Idempotent.
 *     tags: [Tutorial]
 *     responses:
 *       200:
 *         description: "{ completed: true, current_step: 'complete', ironRewarded: 0, iron: number }"
 *       403:
 *         description: Not your fighter
 */
router.post("/:fighterId/complete", ownFighter, tutorialController.completeTutorial);

/**
 * @swagger
 * /tutorial/{fighterId}/tips/seen:
 *   post:
 *     summary: Record a section or moment tip as seen.
 *     tags: [Tutorial]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key: { type: string, description: "One of consts/tutorialConfig TIP_KEYS" }
 *     responses:
 *       200:
 *         description: "{ tipsSeen: string[] }"
 *       400:
 *         description: "{ message: 'Invalid tip key', code: 'INVALID_TIP_KEY' }"
 *       403:
 *         description: Not your fighter
 */
router.post("/:fighterId/tips/seen", ownFighter, tutorialController.markTipSeen);

module.exports = router;
