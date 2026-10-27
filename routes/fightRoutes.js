const express = require("express");
const router = express.Router();
const fightController = require("../controllers/fightController");
const campController = require("../controllers/campController");
const { ownFighterParam } = require("../middleware/ownFighterMiddleware");
const { ownFightParam } = require("../middleware/ownFightMiddleware");

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
// :fightId = Fight document _id (not the fighter's id). Every camp route runs
// ownFightParam("fightId") first: the fight must belong to req.user.fighterId. Any
// fighterId in the query or body is ignored; the controller uses req.user.fighterId.
// /camp/:fightId/report stays registered before /camp/:fightId.

/**
 * @swagger
 * /fights/camp/{fightId}/report:
 *   get:
 *     summary: Read the Fighter Report on this fight's opponent
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fightId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Fighter Report
 *       403:
 *         description: No fighter on this account / the fight belongs to another fighter
 *       404:
 *         description: Fight not found (also for a malformed fightId) / Opponent not found
 *       500:
 *         description: Internal server error
 */
router.get("/camp/:fightId/report", ownFightParam("fightId"), campController.getReport);

/**
 * @swagger
 * /fights/camp/{fightId}:
 *   get:
 *     summary: Read the camp state for this fight (a query fighterId is ignored)
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fightId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Camp state plus slotsUsed, slotsRemaining, previewRating, isTitleFight
 *       403:
 *         description: No fighter on this account / the fight belongs to another fighter
 *       404:
 *         description: Fight not found (also for a malformed fightId) / CAMP_FIGHT_NOT_FOUND
 *       500:
 *         description: Internal server error
 */
router.get("/camp/:fightId", ownFightParam("fightId"), campController.getCampState);

/**
 * @swagger
 * /fights/camp/{fightId}/session:
 *   post:
 *     summary: Add a camp session (spends energy). A body fighterId is ignored.
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fightId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { sessionType: { type: string } }, required: ['sessionType'] }
 *     responses:
 *       200:
 *         description: "{ camp, slotsUsed, slotsRemaining, previewRating, injuryTriggered }"
 *       400:
 *         description: sessionType is required / CAMP_FINALISED / CAMP_INJURED / CAMP_NO_SLOTS / CAMP_INVALID_SESSION / CAMP_NOT_ENOUGH_ENERGY
 *       403:
 *         description: No fighter on this account / the fight belongs to another fighter
 *       404:
 *         description: Fight not found (also for a malformed fightId) / CAMP_FIGHT_NOT_FOUND
 *       409:
 *         description: CAMP_FIGHT_LOCKED (the fight is resolving or already resolved)
 *       500:
 *         description: Internal server error
 */
router.post("/camp/:fightId/session", ownFightParam("fightId"), campController.addSession);

/**
 * @swagger
 * /fights/camp/{fightId}/remove-session:
 *   post:
 *     summary: Remove a camp session and refund its energy. A body fighterId is ignored.
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fightId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { slotIndex: { type: integer } }, required: ['slotIndex'] }
 *     responses:
 *       200:
 *         description: "{ camp, slotsUsed, slotsRemaining, previewRating }"
 *       400:
 *         description: slotIndex is required / CAMP_FINALISED / CAMP_INJURED / CAMP_INVALID_SLOT
 *       403:
 *         description: No fighter on this account / the fight belongs to another fighter
 *       404:
 *         description: Fight not found (also for a malformed fightId) / CAMP_FIGHT_NOT_FOUND
 *       409:
 *         description: CAMP_FIGHT_LOCKED (the fight is resolving or already resolved)
 *       500:
 *         description: Internal server error
 */
router.post("/camp/:fightId/remove-session", ownFightParam("fightId"), campController.removeSession);

/**
 * @swagger
 * /fights/camp/{fightId}/injury-choice:
 *   post:
 *     summary: Choose the camp injury response (STOP or PUSH_THROUGH). A body fighterId is ignored.
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fightId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { choice: { type: string, enum: ['STOP', 'PUSH_THROUGH'] } }, required: ['choice'] }
 *     responses:
 *       200:
 *         description: Updated camp
 *       400:
 *         description: choice is required / CAMP_INVALID_CHOICE
 *       403:
 *         description: No fighter on this account / the fight belongs to another fighter
 *       404:
 *         description: Fight not found (also for a malformed fightId) / CAMP_FIGHT_NOT_FOUND
 *       409:
 *         description: CAMP_FIGHT_LOCKED (the fight is resolving or already resolved)
 *       500:
 *         description: Internal server error
 */
router.post("/camp/:fightId/injury-choice", ownFightParam("fightId"), campController.resolveInjury);

/**
 * @swagger
 * /fights/camp/{fightId}/finalise:
 *   post:
 *     summary: Finalise the camp (skip is optional). A body fighterId is ignored.
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fightId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { skip: { type: boolean } } }
 *     responses:
 *       200:
 *         description: "{ campRating, campBreakdown, sessionBonuses, wasSkipped, injuryPenalty, injuryChoice, sessions }"
 *       400:
 *         description: CAMP_FINALISED / CAMP_INJURED
 *       403:
 *         description: No fighter on this account / the fight belongs to another fighter
 *       404:
 *         description: Fight not found (also for a malformed fightId) / CAMP_FIGHT_NOT_FOUND
 *       409:
 *         description: CAMP_FIGHT_LOCKED (the fight is resolving or already resolved)
 *       500:
 *         description: Internal server error
 */
router.post("/camp/:fightId/finalise", ownFightParam("fightId"), campController.finaliseCamp);

/**
 * @swagger
 * /fights/camp/{fightId}/buff:
 *   put:
 *     summary: Select, or clear with buffId null, the pre-fight supplement for this fight's camp (Shop v1.0)
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fightId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { buffId: { type: string, nullable: true } } }
 *     responses:
 *       200:
 *         description: "{ selectedBuffId, message }"
 *       400:
 *         description: Unknown supplement / You don't own that supplement
 *       403:
 *         description: No fighter on this account / the fight belongs to another fighter
 *       404:
 *         description: Fight not found (also for a malformed fightId) / CAMP_FIGHT_NOT_FOUND
 *       409:
 *         description: CAMP_FIGHT_LOCKED (the fight is resolving or already resolved)
 *       500:
 *         description: Internal server error
 */
router.put("/camp/:fightId/buff", ownFightParam("fightId"), campController.selectBuff);

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
 *       403:
 *         description: Body fighterId is not your fighter (same guard on PUT /fights/weight-cut)
 *       404:
 *         description: Fight not found
 */
// Body-keyed ownership (fighterId in the body) is checked in the controller.
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
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: Fighter not found / Fight not found / Opponent not found
 *       409:
 *         description: >
 *           FIGHT_ALREADY_RESOLVED. Another resolve of this fight holds the claim or already
 *           completed it; body is { message, code }. Reload the fighter instead of retrying.
 *       500:
 *         description: Internal server error
 */
router.post("/resolve/:fighterId", ownFighterParam("fighterId"), fightController.resolveFight);

// ── Post-fight interview (Phase 1) ─────────────────────────────────────────
router.get("/interview/candidates", fightController.getInterviewCandidates);
router.post("/:fightId/interview", fightController.postInterview);

// ── Fight Description System — derived round-by-round breakdown ─────────────
// Registered AFTER all literal GET segments so the :fightId param does not shadow
// them. Auth-protected via the mount in app.js (actor = req.user.fighterId).
router.get("/:fightId/breakdown", fightController.getFightBreakdown);

module.exports = router;
