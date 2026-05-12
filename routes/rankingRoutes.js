const express = require("express");
const router = express.Router();
const rankingController = require("../controllers/rankingController");

/**
 * @swagger
 * /rankings/{tier}:
 *   get:
 *     summary: Get the fixed NPC roster for a tier + weight class, plus the player's row if same tier/wc.
 *     tags: [Rankings]
 *     parameters:
 *       - in: path
 *         name: tier
 *         required: true
 *         schema: { type: string, enum: [Amateur, "Regional Pro", National, "GCS Contender", GCS] }
 *       - in: query
 *         name: weightClass
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: fighterId
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200: { description: Roster + optional player row }
 */
router.get("/:tier", rankingController.getRankings);

module.exports = router;
