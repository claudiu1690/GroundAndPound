const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");

// Media Hub (Phase 6). Base path: /media
router.get("/:fighterId", mediaController.getState);
router.get("/:fighterId/targets", mediaController.getTargets);
router.get("/:fighterId/appearances", mediaController.getAppearances);
router.get("/:fighterId/rivalry", mediaController.getRivalry);
router.get("/:fighterId/archive", mediaController.getArchive);
router.post("/:fighterId/podcast", mediaController.postPodcast);
router.post("/:fighterId/documentary", mediaController.postDocumentary);
router.post("/:fighterId/appearances/:instanceId", mediaController.postAppearance);

module.exports = router;
