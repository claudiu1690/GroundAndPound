const express = require("express");
const c = require("../controllers/pvpController");

const router = express.Router();

// All routes are auth-protected via the mount in app.js (app.use("/pvp", authMiddleware, ...)).
// Actor = req.user.fighterId. /record and /ladder are intentionally public reads (within auth).
// /ladder/position MUST be registered before the bare /ladder so the literal path
// is not shadowed (Express matches in declaration order).
router.get("/ladder/position", c.getLadderPosition);
router.get("/ladder", c.getLadder);
router.get("/challenge-eligibility/:playerId", c.getChallengeEligibility);
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
