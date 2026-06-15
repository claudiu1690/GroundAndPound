const express = require("express");
const router = express.Router();
const gazetteController = require("../controllers/gazetteController");

/**
 * @swagger
 * /gazette/{fighterId}:
 *   get:
 *     summary: Return the persisted Octagon Gazette for a fighter.
 *     tags: [Gazette]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "Persisted gazette doc (issueNumber, leadStory, sidebarItems, secondaryStories, inBrief, masthead). Null when no edition exists yet."
 */
router.get("/:fighterId", gazetteController.getGazette);

module.exports = router;
