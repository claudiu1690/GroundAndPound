const express = require("express");
const router = express.Router();
const fighterController = require("../controllers/fighterController");
const rankingController = require("../controllers/rankingController");
const shopController = require("../controllers/shopController");
const ownFighter = require("../middleware/ownFighterMiddleware");

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
router.post("/:id/train", ownFighter, fighterController.train);

router.post("/:id/doctor-visit", ownFighter, fighterController.doctorVisit);
router.post("/:id/hospital/skip-recovery", ownFighter, fighterController.hospitalSkipRecovery);
router.post("/:id/hospital/full-recovery", ownFighter, fighterController.hospitalFullRecovery);
router.post("/:id/hospital/restore-health", ownFighter, fighterController.hospitalRestoreHealth);
router.get("/:id/hospital/quote", ownFighter, fighterController.hospitalQuote);
router.post("/:id/switch-gym", fighterController.switchGym);
router.post("/:id/rank-up-gym", fighterController.rankUpGym);
router.get("/:id/champions", fighterController.getChampions);
router.get("/:id/rank", rankingController.getFighterRank);
router.get("/:id/activity", fighterController.getActivity);
router.get("/:id/dashboard", ownFighter, fighterController.getDashboard);
router.get("/:id/fame-events", fighterController.getFameEvents);
router.get("/:id/banner/catalog", fighterController.getBannerCatalog);
router.put("/:id/banner", fighterController.saveBanner);

// ── Phase 4: Callouts ──────────────────────────────────────
router.get("/:id/callouts/roster", fighterController.getCalloutRoster);
router.post("/:id/callouts", fighterController.createCallout);
router.delete("/:id/callouts", fighterController.cancelCallout);
/** Reserved for media events (notoriety) — returns 501 until implemented */
router.post("/:id/media-event", fighterController.mediaEventStub);

// ── Shop, Inventory & Pre-Fight Supplements v1.0 ───────────
router.get("/:id/shop/catalog", ownFighter, shopController.getCatalog);
router.post("/:id/shop/buy", ownFighter, shopController.buy);
router.post("/:id/shop/buy-premium", ownFighter, shopController.buyPremium);
router.post("/:id/inventory/use-energy", ownFighter, shopController.useEnergy);

module.exports = router;
