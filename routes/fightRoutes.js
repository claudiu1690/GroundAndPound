const express = require("express");
const router = express.Router();
const fightController = require("../controllers/fightController");

/**
 * @swagger
 * /fights/offers/{fighterId}:
 *   get:
 *     summary: Generate 3 fight offers (Easy, Even, Hard) for the fighter
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Array of offers, each with type and opponent
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/FightOffer' }
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.get("/offers/:fighterId", fightController.getOffers);

/**
 * @swagger
 * /fights/offers/{fighterId}:
 *   post:
 *     summary: Create a fight offer (persist; does not deduct energy yet)
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
 *         description: Weight class or promotion tier mismatch
 *       404:
 *         description: Fighter not found / Opponent not found
 *       500:
 *         description: Internal server error
 */
router.post("/offers/:fighterId", fightController.createOffer);

/**
 * @swagger
 * /fights/accept/{fighterId}/{fightId}:
 *   post:
 *     summary: Accept a fight offer (deducts energy; links fight to fighter)
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
 *         description: Not enough energy
 *       404:
 *         description: Fight not found or not available
 *       500:
 *         description: Internal server error
 */
router.post("/accept/:fighterId/:fightId", fightController.acceptOffer);

/**
 * @swagger
 * /fights/camp/{fighterId}:
 *   post:
 *     summary: Add one training camp action (TCA) for the accepted fight
 *     tags: [Fights]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Camp action added
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Fighter' }
 *       400:
 *         description: No accepted fight
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.post("/camp/:fighterId", fightController.addCampAction);

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
 *     description: Deducts fight energy, runs round-by-round resolution, updates fighter record/iron/notoriety/fight XP/comeback mode and daily fight count.
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

module.exports = router;
