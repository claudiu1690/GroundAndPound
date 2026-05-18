const express = require("express");
const router = express.Router();
const tutorialController = require("../controllers/tutorialController");

/**
 * @swagger
 * /tutorial/{fighterId}:
 *   get:
 *     summary: Get the onboarding tutorial state for a fighter.
 *     tags: [Tutorial]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "Tutorial state: { completed, current_step }."
 */
router.get("/:fighterId", tutorialController.getTutorial);

/**
 * @swagger
 * /tutorial/{fighterId}/advance:
 *   post:
 *     summary: Advance the tutorial to the next step (validated server-side).
 *     tags: [Tutorial]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               step: { type: string }
 */
router.post("/:fighterId/advance", tutorialController.advanceTutorial);

/**
 * @swagger
 * /tutorial/{fighterId}/complete:
 *   post:
 *     summary: Mark the tutorial complete and credit the 500-iron signing bonus.
 *     tags: [Tutorial]
 */
router.post("/:fighterId/complete", tutorialController.completeTutorial);

module.exports = router;
