const express = require("express");
const c = require("../controllers/pvpController");

const router = express.Router();

// All routes are auth-protected via the mount in app.js (app.use("/pvp", authMiddleware, ...)).
// Actor = req.user.fighterId. /record and /ladder are intentionally public reads (within auth).
router.get("/ladder/:weightClass/:seasonId", c.getLadder);
router.get("/record/:playerId", c.getRecord);
router.get("/opponents", c.getOpponents);
router.post("/fight", c.postFight);
router.get("/fights/:seasonId", c.getFights);
router.get("/defense-results", c.getDefenseResults);
router.post("/defense-gameplan", c.setDefenseGameplan);
router.get("/hof", c.getHof);
router.get("/season/current/:weightClass", c.getCurrentSeason);
router.post("/acknowledge-season", c.acknowledgeSeason);

module.exports = router;
