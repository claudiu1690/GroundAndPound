const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");

router.get("/:fighterId", mediaController.getState);
router.get("/:fighterId/division-roster", mediaController.getDivisionRoster);
router.get("/:fighterId/archive", mediaController.getArchive);
router.post("/:fighterId/podcast", mediaController.postPodcast);
router.post("/:fighterId/documentary", mediaController.postDocumentary);

module.exports = router;
