const express = require("express");
const router = express.Router();
const fighterController = require("../controllers/fighterController");

/**
 * @swagger
 * /fighters:
 *   post:
 *     summary: Create a new fighter (character creation)
 *     tags: [Fighters]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FighterCreate'
 *     responses:
 *       201:
 *         description: Fighter created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Fighter' }
 *       400:
 *         description: Missing required fields (firstName, lastName, weightClass, style)
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /fighters:
 *   get:
 *     summary: List fighters (for demo / pick character)
 *     tags: [Fighters]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: List of fighters (id, name, weightClass, style, overallRating, energy, record)
 */
router.get("/", fighterController.list);

router.get("/leaderboard/notoriety", fighterController.notorietyLeaderboard);

router.post("/", fighterController.create);

/**
 * @swagger
 * /fighters/{id}:
 *   get:
 *     summary: Get a fighter by ID
 *     tags: [Fighters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Fighter found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Fighter' }
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", fighterController.getById);

/**
 * @swagger
 * /fighters/{id}:
 *   put:
 *     summary: Update a fighter (e.g. gymId, nickname)
 *     tags: [Fighters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Fighter' }
 *     responses:
 *       200:
 *         description: Fighter updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Fighter' }
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.put("/:id", fighterController.update);

/**
 * @swagger
 * /fighters/{id}/energy:
 *   patch:
 *     summary: Deduct energy from a fighter (e.g. for testing)
 *     tags: [Fighters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: query
 *         name: amount
 *         schema: { type: integer, default: 1 }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount: { type: integer }
 *     responses:
 *       200:
 *         description: Energy deducted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Fighter' }
 *       400:
 *         description: Not enough energy
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.patch("/:id/energy", fighterController.deductEnergy);
router.post("/:id/debug/recharge-energy", fighterController.debugRechargeEnergy);

/**
 * @swagger
 * /fighters/{id}/train:
 *   post:
 *     summary: Run a training session (costs energy; grants XP to stats)
 *     tags: [Fighters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TrainRequest' }
 *     responses:
 *       200:
 *         description: Training completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fighter: { $ref: '#/components/schemas/Fighter' }
 *                 message: { type: string }
 *                 xpGained: { type: object }
 *       400:
 *         description: Not enough energy / Unknown session type / Gym tier too low for session
 *       404:
 *         description: Fighter not found / Gym not found
 *       500:
 *         description: Internal server error
 */
router.post("/:id/train", fighterController.train);

/**
 * @swagger
 * /fighters/{id}/rest:
 *   post:
 *     summary: Rest / Recovery — spend 3 Energy to restore 25 Health and 25 Stamina (GDD)
 *     tags: [Fighters]
 */
router.post("/:id/rest", fighterController.rest);
router.post("/:id/doctor-visit", fighterController.doctorVisit);
router.post("/:id/mental-reset", fighterController.mentalReset);
router.post("/:id/pay-membership", fighterController.payGymMembership);
router.get("/:id/activity", fighterController.getActivity);
/** Reserved for media events (notoriety) — returns 501 until implemented */
router.post("/:id/media-event", fighterController.mediaEventStub);

module.exports = router;
