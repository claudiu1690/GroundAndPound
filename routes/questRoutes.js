const express = require("express");
const router = express.Router();
const questController = require("../controllers/questController");

/**
 * GET /quests/:fighterId/:gymId
 * Returns quest progress for a fighter at a specific gym.
 */
router.get("/:fighterId/:gymId", questController.getGymQuests);

module.exports = router;
