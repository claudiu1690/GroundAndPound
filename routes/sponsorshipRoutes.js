const express = require("express");
const router = express.Router();
const sponsorshipController = require("../controllers/sponsorshipController");

/** GET /sponsorships/:fighterId — bundled payload for the Contracts tab. */
router.get("/:fighterId", sponsorshipController.getOverview);

/** POST /sponsorships/:fighterId/accept — { sponsorId } */
router.post("/:fighterId/accept", sponsorshipController.acceptOffer);

/** POST /sponsorships/:fighterId/drop/:sponsorshipId — walk away (fame penalty). */
router.post("/:fighterId/drop/:sponsorshipId", sponsorshipController.dropContract);

module.exports = router;
