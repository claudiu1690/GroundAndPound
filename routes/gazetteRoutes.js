const express = require("express");
const router = express.Router();
const gazetteController = require("../controllers/gazetteController");

/**
 * @swagger
 * /gazette/{fighterId}:
 *   get:
 *     summary: Get today's Octagon Gazette for a fighter (daily newspaper modal payload).
 *     tags: [Gazette]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "Newspaper payload: date, masthead, stories array."
 */
router.get("/:fighterId", gazetteController.getGazette);

/**
 * @swagger
 * /gazette/{fighterId}/dismiss:
 *   post:
 *     summary: Mark today's Gazette as read; updates baselines for tomorrow's deltas.
 *     tags: [Gazette]
 */
router.post("/:fighterId/dismiss", gazetteController.dismissGazette);

module.exports = router;
