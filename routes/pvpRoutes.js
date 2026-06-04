const express = require("express");
const router = express.Router();
const pvpController = require("../controllers/pvpController");

/**
 * PvP System v1 (Beta). Mounted at /pvp (JWT required — see app.js).
 * Attacker identity is read from req.user.fighterId, never from the client.
 */

/**
 * @swagger
 * /pvp/ladder:
 *   get:
 *     summary: "Paginated PvP ladder (rank_points desc, then win%, then recency)."
 *     tags: [PvP]
 */
router.get("/ladder", pvpController.getLadder);

/**
 * @swagger
 * /pvp/ladder/{fighterId}:
 *   get:
 *     summary: "A fighter's public PvP profile (HP/injuries never returned)."
 *     tags: [PvP]
 */
router.get("/ladder/:fighterId", pvpController.getProfile);

/**
 * @swagger
 * /pvp/attack/{defenderId}:
 *   post:
 *     summary: "Initiate a PvP attack. Body offensive_camp is an array of session ids."
 *     tags: [PvP]
 */
router.post("/attack/:defenderId", pvpController.attack);

/**
 * @swagger
 * /pvp/history:
 *   get:
 *     summary: "The caller's PvP fight history (attacker or defender perspective)."
 *     tags: [PvP]
 */
router.get("/history", pvpController.getHistory);

/**
 * @swagger
 * /pvp/pending:
 *   get:
 *     summary: "Unseen PvP results where the caller was the defender. Read-only."
 *     tags: [PvP]
 */
router.get("/pending", pvpController.getPending);

// ── The Circuit v1.1 ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /pvp/hub:
 *   get:
 *     summary: "The Yard hub feed: identity + revenge cards + ticker + contracts."
 *     tags: [PvP]
 */
router.get("/hub", pvpController.getHub);

/**
 * @swagger
 * /pvp/rivalries:
 *   get:
 *     summary: "The caller's rivalries, sorted by heat (viewer-perspective head-to-head)."
 *     tags: [PvP]
 */
router.get("/rivalries", pvpController.getRivalries);

/**
 * @swagger
 * /pvp/contracts/{contractId}/claim:
 *   post:
 *     summary: "Claim a completed PvP contract (fame reward, counts the daily fame cap)."
 *     tags: [PvP]
 */
router.post("/contracts/:contractId/claim", pvpController.claimContract);

/**
 * @swagger
 * /pvp/title:
 *   post:
 *     summary: "Set the active cosmetic PvP title (must be unlocked) or null to clear."
 *     tags: [PvP]
 */
router.post("/title", pvpController.setTitle);

// ── The Circuit v1.2 — Bounties + Seasons ─────────────────────────────────────

/**
 * @swagger
 * /pvp/bounties:
 *   get:
 *     summary: "Bounties for the caller (scope=collectable|posted|on_me)."
 *     tags: [PvP]
 */
router.get("/bounties", pvpController.getBounties);

/**
 * @swagger
 * /pvp/bounties:
 *   post:
 *     summary: "Post an iron bounty on a target's head (escrow 90% + 10% burn)."
 *     tags: [PvP]
 */
router.post("/bounties", pvpController.postBounty);

/**
 * @swagger
 * /pvp/season:
 *   get:
 *     summary: "The current PvP season + the caller's division + once-only ended results."
 *     tags: [PvP]
 */
router.get("/season", pvpController.getSeason);

/**
 * @swagger
 * /pvp/season/seen:
 *   post:
 *     summary: "Mark the caller as having seen the latest ended-season results (modal once)."
 *     tags: [PvP]
 */
router.post("/season/seen", pvpController.markSeasonSeen);

module.exports = router;
