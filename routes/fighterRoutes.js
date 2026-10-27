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
 *     summary: Get your own fighter by ID (full owner payload plus statProgress)
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
 *       403:
 *         description: Not your fighter (other players read GET /fighters/{id}/profile)
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", ownFighter, fighterController.getById);

/**
 * @swagger
 * /fighters/{id}:
 *   put:
 *     summary: Update your own fighter's nickname (the only player-editable field)
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
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [nickname]
 *             properties:
 *               nickname:
 *                 type: string
 *                 description: 2 to 20 chars of letters, digits, space, apostrophe or hyphen (no double spaces), profanity filtered. Empty string clears it. Same rule as utils/nickname.js.
 *     responses:
 *       200:
 *         description: Fighter updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Fighter' }
 *       400:
 *         description: "Invalid body. { message, code } where code is invalid_body, unknown_fields (plus fields: string[]), no_fields or invalid_nickname"
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.put("/:id", ownFighter, fighterController.update);

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
router.post("/:id/switch-gym", ownFighter, blockWhenGymsRetired, fighterController.switchGym);
router.post("/:id/rank-up-gym", ownFighter, blockWhenGymsRetired, fighterController.rankUpGym);
router.get("/:id/champions", fighterController.getChampions);
router.get("/:id/rank", rankingController.getFighterRank);
router.get("/:id/activity", fighterController.getActivity);
// Career Page / badge system. The profile read stays public (rival profile view); the badge writes are owner-only.
/**
 * @swagger
 * /fighters/{id}/profile:
 *   get:
 *     summary: Career Page payload { fighter, belts, badges, pvp }
 *     description: >
 *       Public read. For the owner, `fighter` is the full fighter payload. For any other
 *       player, `fighter` is the public projection (fighterService.PUBLIC_FIGHTER_KEYS only:
 *       identity, stats, record, display rank, gym name, public notoriety, media, banner,
 *       pinnedBadges). belts, badges and pvp are the same for everyone.
 *     tags: [Fighters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Career profile
 *       404:
 *         description: Fighter not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/profile", fighterController.getCareerProfile);
router.put("/:id/pinned-badges", ownFighter, fighterController.setPinnedBadges);
router.post("/:id/badges/seen", ownFighter, fighterController.markBadgesSeen);
router.get("/:id/dashboard", ownFighter, fighterController.getDashboard);
router.get("/:id/fame-events", fighterController.getFameEvents);
router.get("/:id/banner/catalog", fighterController.getBannerCatalog);
router.put("/:id/banner", ownFighter, fighterController.saveBanner);

// ── Phase 4: Callouts ──────────────────────────────────────
router.get("/:id/callouts/roster", ownFighter, fighterController.getCalloutRoster);
router.post("/:id/callouts", ownFighter, fighterController.createCallout);
router.delete("/:id/callouts", ownFighter, fighterController.cancelCallout);
/** Reserved for media events (notoriety) — returns 501 until implemented */
router.post("/:id/media-event", ownFighter, fighterController.mediaEventStub);

// ── Special Moves v1 ───────────────────────────────────────
// Literal routes MUST precede the /:moveId param route so /moves/equip,
// /moves/unequip and /moves/catalog are not swallowed by /moves/:moveId
// (a GET /moves/catalog landing there would 404 "Unknown move").
router.get("/:id/moves", ownFighter, specialMovesController.listMoves);
router.post("/:id/moves/equip", ownFighter, specialMovesController.equipMove);
router.post("/:id/moves/unequip", ownFighter, specialMovesController.unequipMove);
router.get("/:id/moves/catalog", ownFighter, specialMovesController.getCatalog);
router.get("/:id/moves/:moveId", ownFighter, specialMovesController.getMoveDetail);

// ── Shop, Inventory & Pre-Fight Supplements v1.0 ───────────
router.get("/:id/shop/catalog", ownFighter, shopController.getCatalog);
router.post("/:id/shop/buy", ownFighter, shopController.buy);
// Real money. Opens a Stripe Checkout Session and returns its URL; grants NOTHING on its own:
// goods are handed over only by the signature-verified webhook (POST /webhooks/stripe).
// checkoutLimiter (app.js) runs in front of this path. Mounted even when Stripe is disabled so
// the client gets a clean 503 payments_disabled instead of a 404.
router.post("/:id/shop/checkout", ownFighter, paymentController.createCheckout);
// Post-redirect status poll. A Mongo read only, so it works with Stripe disabled too.
router.get("/:id/shop/purchases/:sessionId", ownFighter, paymentController.getPurchaseStatus);
router.post("/:id/inventory/use-energy", ownFighter, shopController.useEnergy);

module.exports = router;
