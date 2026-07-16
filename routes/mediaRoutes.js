const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const { ownFighterParam } = require("../middleware/ownFighterMiddleware");

// Ownership guard for EVERY media route. Runs after the mount-level authMiddleware
// (which populates req.user.fighterId). All media state is private/self-only — reading
// or mutating another fighter's persona/fame/iron/media is a 403. Applies uniformly
// because every route below is scoped by the :fighterId path param.
router.use("/:fighterId", ownFighterParam("fighterId"));

// Media Hub (Phase 6). Base path: /media
router.get("/:fighterId", mediaController.getState);
router.get("/:fighterId/targets", mediaController.getTargets);
router.get("/:fighterId/appearances", mediaController.getAppearances);
router.get("/:fighterId/rivalry", mediaController.getRivalry);
router.get("/:fighterId/archive", mediaController.getArchive);
router.post("/:fighterId/podcast", mediaController.postPodcast);
router.post("/:fighterId/documentary", mediaController.postDocumentary);
router.post("/:fighterId/appearances/:instanceId", mediaController.postAppearance);
router.post("/:fighterId/persona/preview", mediaController.postPersonaPreview);

module.exports = router;
