const express = require("express");
const router = express.Router();
const fightController = require("../controllers/fightController");
const campController = require("../controllers/campController");
const { ownFighterParam } = require("../middleware/ownFighterMiddleware");

/**
 * @swagger
 * /fights/offers/{fighterId}:
 *   get:
 *     summary: Read the fighter's persisted offer board (generated on a miss)
 *     description: >
 *       Returns the live board (Easy, Even, Hard, plus TitleShot when pending) with the
 *       active callout overlaid on the Hard slot. A blocking injury or an empty division
 *       is a 200 with offers [] and board.blockedReason / board.blockedCode. Shapes:
 *       BoardOffer and OfferBoardMeta in services/offerBoardService.js.
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ offers: BoardOffer[], board: OfferBoardMeta }"
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/OfferBoardResponse' }
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.get("/offers/:fighterId", ownFighterParam("fighterId"), fightController.getOffers);

/**
 * @swagger
 * /fights/offers/{fighterId}:
 *   post:
 *     summary: Create a fight offer for an opponent on the live board (does not deduct energy yet)
 *     description: The offer type always comes from the board slot; a client offerType is ignored.
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateOfferRequest' }
 *     responses:
 *       201:
 *         description: Fight created with status offered
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Fight' }
 *       400:
 *         description: OFFER_INVALID_INPUT / FIGHT_BLOCKED_INJURY / TITLE_SHOT_LOCKED
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: Fighter not found
 *       409:
 *         description: OFFER_NOT_ON_BOARD / FIGHT_ALREADY_BOOKED
 *       500:
 *         description: Internal server error
 */
router.post("/offers/:fighterId", ownFighterParam("fighterId"), fightController.createOffer);

/**
 * @swagger
 * /fights/offers/{fighterId}/reroll:
 *   post:
 *     summary: Replace the live offer board once, for 20% of the tier signing fee
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ offers: BoardOffer[], board: OfferBoardMeta, cashAfter: number }"
 *       400:
 *         description: NOT_ENOUGH_CASH / FIGHT_BLOCKED_INJURY
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: Fighter not found
 *       409:
 *         description: OFFER_BOARD_FROZEN / REROLL_USED / OFFER_BOARD_STALE / OFFER_POOL_EMPTY
 *       500:
 *         description: Internal server error
 */
router.post("/offers/:fighterId/reroll", ownFighterParam("fighterId"), fightController.rerollOffers);

/**
 * @swagger
 * /fights/accept/{fighterId}/{fightId}:
 *   post:
 *     summary: Accept a fight offer (re-validated against the live board; deducts energy; links fight to fighter)
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: fightId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Fight accepted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Fight' }
 *       400:
 *         description: FIGHT_NOT_ENOUGH_ENERGY / FIGHT_BLOCKED_INJURY / TITLE_SHOT_LOCKED
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: Fight not found or not available (also for a malformed fightId) / Fighter not found
 *       409:
 *         description: OFFER_NOT_ON_BOARD (slot left the board or its type changed) / FIGHT_ALREADY_BOOKED
 *       500:
 *         description: Internal server error
 */
router.post("/accept/:fighterId/:fightId", ownFighterParam("fighterId"), fightController.acceptOffer);

// ── Fight Camp v1.1 routes ─────────────────────────────────────────────────
// :fightId = Fight document _id (not the fighter's id)
router.get("/camp/:fightId/report",        campController.getReport);
router.get("/camp/:fightId",               campController.getCampState);
router.post("/camp/:fightId/session",      campController.addSession);
router.post("/camp/:fightId/remove-session", campController.removeSession);
router.post("/camp/:fightId/injury-choice",campController.resolveInjury);
router.post("/camp/:fightId/finalise",     campController.finaliseCamp);
// Shop v1.0 — select/clear the pre-fight supplement for this fight's camp.
router.put("/camp/:fightId/buff",          campController.selectBuff);

/**
 * @swagger
 * /fights/strategy:
 *   put:
 *     summary: Set fight strategy for accepted fight (GDD 8.3). Call before resolve.
 *     tags: [Fights]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { fighterId: { type: string }, fightId: { type: string }, strategy: { type: string } }, required: ['fighterId', 'fightId', 'strategy'] }
 *     responses:
 *       200:
 *         description: Strategy set
 *       400:
 *         description: Invalid strategy
 *       404:
 *         description: Fight not found
 */
router.put("/weight-cut", fightController.setWeightCut);
router.put("/strategy", fightController.setStrategy);

/**
 * @swagger
 * /fights/resolve/{fighterId}:
 *   post:
 *     summary: Resolve the accepted fight (simulation, then apply outcome and rewards)
 *     tags: [Fights]
 *     description: Runs round-by-round resolution, updates fighter record/iron/notoriety/fight XP/comeback mode and daily fight count.
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Fight completed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ResolveFightResult' }
 *       400:
 *         description: No accepted fight / Not enough energy
 *       404:
 *         description: Fighter not found / Fight not found / Opponent not found
 *       500:
 *         description: Internal server error
 */
router.post("/resolve/:fighterId", fightController.resolveFight);

// ── Post-fight interview (Phase 1) ─────────────────────────────────────────
router.get("/interview/candidates", fightController.getInterviewCandidates);
router.post("/:fightId/interview", fightController.postInterview);

// ── Fight Description System — derived round-by-round breakdown ─────────────
// Registered AFTER all literal GET segments so the :fightId param does not shadow
// them. Auth-protected via the mount in app.js (actor = req.user.fighterId).
router.get("/:fightId/breakdown", fightController.getFightBreakdown);

module.exports = router;
