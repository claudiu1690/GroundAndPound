const express = require("express");
const router = express.Router();
const fighterController = require("../controllers/fighterController");
const rankingController = require("../controllers/rankingController");
const shopController = require("../controllers/shopController");
const paymentController = require("../controllers/paymentController");
const specialMovesController = require("../controllers/specialMovesController");
const ownFighter = require("../middleware/ownFighterMiddleware");
// PHASE 2 gym retirement — a no-op while GYMS_RETIRED is unset/false. It must sit in FRONT of
// the three gym-writing handlers, not inside them: `train` deducts energy through Redis before
// it could ever check a flag, so a controller-level check would cost a mid-session player real
// energy on a request that returns 410.
const blockWhenGymsRetired = require("../middleware/gymsRetiredMiddleware");

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
router.post("/:id/train", ownFighter, blockWhenGymsRetired, fighterController.train);

router.post("/:id/doctor-visit", ownFighter, fighterController.doctorVisit);
router.post("/:id/hospital/skip-recovery", ownFighter, fighterController.hospitalSkipRecovery);
router.post("/:id/hospital/full-recovery", ownFighter, fighterController.hospitalFullRecovery);
router.post("/:id/hospital/restore-health", ownFighter, fighterController.hospitalRestoreHealth);
router.get("/:id/hospital/quote", ownFighter, fighterController.hospitalQuote);
// ⚠️ These two lack an `ownFighter` guard and MOVE CASH — a known Phase-0 §8.2 gap. Phase 2
// deliberately adds ONLY the retirement middleware in front of them and does NOT add the guard:
// they are being retired, and widening the change here means touching the gym rank-up path on
// the same deploy that retires it. If the cutover is ever CANCELLED, the missing guard becomes
// a real bug worth its own fix. Do not mirror this style on any new route.
router.post("/:id/switch-gym", blockWhenGymsRetired, fighterController.switchGym);
router.post("/:id/rank-up-gym", blockWhenGymsRetired, fighterController.rankUpGym);
router.get("/:id/champions", fighterController.getChampions);
router.get("/:id/rank", rankingController.getFighterRank);
router.get("/:id/activity", fighterController.getActivity);
// Career Page / badge system — same (no extra) auth middleware as /:id/activity and /:id/banner.
router.get("/:id/profile", fighterController.getCareerProfile);
router.put("/:id/pinned-badges", fighterController.setPinnedBadges);
router.post("/:id/badges/seen", fighterController.markBadgesSeen);
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

// ── Special Moves v1 ───────────────────────────────────────
// Literal routes MUST precede the /:moveId param route so /moves/equip and
// /moves/unequip are not swallowed by /moves/:moveId.
router.get("/:id/moves", ownFighter, specialMovesController.listMoves);
router.post("/:id/moves/equip", ownFighter, specialMovesController.equipMove);
router.post("/:id/moves/unequip", ownFighter, specialMovesController.unequipMove);
router.get("/:id/moves/:moveId", ownFighter, specialMovesController.getMoveDetail);

// ── Shop, Inventory & Pre-Fight Supplements v1.0 ───────────
router.get("/:id/shop/catalog", ownFighter, shopController.getCatalog);
router.post("/:id/shop/buy", ownFighter, shopController.buy);
router.post("/:id/shop/buy-premium", ownFighter, shopController.buyPremium);
// Real money. Opens a Stripe Checkout Session and returns its URL; grants NOTHING on its own —
// goods are handed over only by the signature-verified webhook (POST /webhooks/stripe).
router.post("/:id/shop/checkout", ownFighter, paymentController.createCheckout);
router.post("/:id/inventory/use-energy", ownFighter, shopController.useEnergy);

module.exports = router;
