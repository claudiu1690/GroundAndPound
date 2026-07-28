const express = require("express");
const router = express.Router();
const homeCampController = require("../controllers/homeCampController");
const { ownFighterParam } = require("../middleware/ownFighterMiddleware");

/**
 * Home Camp ("My Camp"). Mounted at /home-camp behind authMiddleware in app.js.
 *
 * `camp*` on the backend is the FIGHT camp (routes are under /fights). This router is the
 * player's own training camp and every identifier carries the `homeCamp` prefix.
 *
 * OWNERSHIP: every route below is guarded by ownFighterParam("fighterId") on top of the
 * mount-level auth. Camp state is private/self-only — reading or mutating another fighter's
 * camp, cash or coaches is a 403. (Do NOT mirror the unguarded style in fighterRoutes.js
 * lines 182-199; that is a known gap, not a pattern.)
 */
router.use("/:fighterId", ownFighterParam("fighterId"));

/**
 * @swagger
 * /home-camp/{fighterId}:
 *   get:
 *     summary: Get the fighter's camp state (creates the camp on first call)
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Full CampState (camp, condition, wages, slots, coaches, fallbackSession, market, needs)
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: fighter_not_found
 *       500:
 *         description: internal_error
 */
router.get("/:fighterId", homeCampController.getCamp);

/**
 * @swagger
 * /home-camp/{fighterId}/name:
 *   patch:
 *     summary: Rename the camp
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 3, maxLength: 28 }
 *     responses:
 *       200:
 *         description: "{ camp: { campId, name } }"
 *       400:
 *         description: name_required | name_length | name_profanity
 *       404:
 *         description: camp_not_found
 */
router.patch("/:fighterId/name", homeCampController.renameCamp);

/**
 * @swagger
 * /home-camp/{fighterId}/train:
 *   post:
 *     summary: Run a camp drill (or the open-mat fallback) up to 25 times
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [drillKey]
 *             properties:
 *               coachId:  { type: string, nullable: true, description: "null = open-mat fallback" }
 *               drillKey: { type: string }
 *               quantity: { type: integer, minimum: 1, default: 1, description: "clamped to 25" }
 *     responses:
 *       200:
 *         description: Training result (doTraining superset + condition/coach/campXpMultiplier)
 *       400:
 *         description: drill_required | quantity_invalid | unknown_drill | drill_locked | not_enough_energy | injury_blocked
 *       404:
 *         description: camp_not_found | coach_not_found | fighter_not_found
 */
router.post("/:fighterId/train", homeCampController.train);

/**
 * @swagger
 * /home-camp/{fighterId}/coaches/{coachId}/promote:
 *   post:
 *     summary: Pay to promote a coach to the next rank
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: coachId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ promotion, camp: CampState }"
 *       400:
 *         description: max_rank | requirements_not_met | insufficient_cash
 *       404:
 *         description: camp_not_found | coach_not_found
 */
router.post("/:fighterId/coaches/:coachId/promote", homeCampController.promoteCoach);

/**
 * @swagger
 * /home-camp/{fighterId}/coaches/{coachId}/claim-perk:
 *   post:
 *     summary: Claim the rank-4 archetype perk a max-rank coach has already earned (free)
 *     description: >
 *       Grants the coach's archetype perk into fighter.gymPerks when the coach is at rank 4
 *       and the perk is not already held. Free — the rank was already earned; this exists
 *       because a gym→camp migration converts a veteran's coach in at rank 4 without writing
 *       anything to the fighter document. Additive and idempotent: an already-held perk is a
 *       400, never a duplicate.
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: coachId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ perkGranted: { key, name, effect, coachId, message }, camp: CampState }"
 *       400:
 *         description: perk_not_claimable (coach below rank 4 / archetype has no perk) | perk_already_held
 *       403:
 *         description: Not your fighter
 *       404:
 *         description: camp_not_found | coach_not_found | fighter_not_found
 */
router.post("/:fighterId/coaches/:coachId/claim-perk", homeCampController.claimCoachPerk);
// Settles teach-pool moves owed from promotions bought before the teach channel shipped.
router.post("/:fighterId/coaches/:coachId/claim-teach", homeCampController.claimMissedTeach);

/**
 * @swagger
 * /home-camp/{fighterId}/market:
 *   get:
 *     summary: This week's trainer market (rolled lazily on read)
 *     description: >
 *       Returns the persisted candidate list for the current week, rolling a new one only when
 *       the stored week index is stale. Requires effective camp Tier 2 — below that the market
 *       is a 403 market_locked carrying { requiredTier, currentTier }.
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ market: { open, weekIndex, resetsAt, resetsInDays, candidateCount, slots, cooldown, cash, candidates[] } }"
 *       403:
 *         description: market_locked (below Tier 2) | not your fighter
 *       404:
 *         description: fighter_not_found
 */
router.get("/:fighterId/market", homeCampController.getMarket);

/**
 * @swagger
 * /home-camp/{fighterId}/market/{candidateId}/hire:
 *   post:
 *     summary: Hire a market candidate (charges the hire fee)
 *     description: >
 *       Moves the candidate onto the roster and debits the fee shown on the card. Concurrency
 *       safe: two simultaneous hires for the same candidate produce exactly one 200, one 404
 *       candidate_not_found, and exactly one charge.
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: candidateId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ hire: { coachId, name, archetype, rarity, feePaid, wage, cashAfter, familiarityApplied, message }, camp: CampState }"
 *       400:
 *         description: candidate_expired | slot_cooldown | no_slot | archetype_taken | archetype_locked | insufficient_cash
 *       403:
 *         description: market_locked
 *       404:
 *         description: candidate_not_found | camp_not_found | fighter_not_found
 */
router.post("/:fighterId/market/:candidateId/hire", homeCampController.hireCandidate);

/**
 * @swagger
 * /home-camp/{fighterId}/coaches/{coachId}:
 *   delete:
 *     summary: Fire a coach
 *     description: >
 *       Free in cash, costly elsewhere: −15 camp condition, −10 morale to the coaches who
 *       stayed (unless a Locker-Room Leader absorbs it) and a 7-day slot cooldown. A rank-3+
 *       coach banks his discipline experience for his replacement. The LAST coach can never be
 *       fired, at any tier.
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: coachId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ fired: { coachId, name, rank, archetype, rarity, moraleHitTo, moraleHit, conditionBefore, conditionAfter, cooldownUntil, cooldownDays, familiarityBanked, message }, camp: CampState }"
 *       400:
 *         description: last_coach
 *       404:
 *         description: coach_not_found | camp_not_found | fighter_not_found
 */
router.delete("/:fighterId/coaches/:coachId", homeCampController.fireCoach);

/**
 * @swagger
 * /home-camp/{fighterId}/renovate:
 *   post:
 *     summary: Pay to raise the camp's stored tier by one
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ renovation: { fromTier, toTier, costPaid, costBase, cashAfter, unlocks, message }, camp: CampState }"
 *       400:
 *         description: max_tier | requirements_not_met | insufficient_cash | renovation_unavailable
 *       404:
 *         description: camp_not_found | fighter_not_found
 */
router.post("/:fighterId/renovate", homeCampController.renovate);

/**
 * @swagger
 * /home-camp/{fighterId}/deep-clean:
 *   post:
 *     summary: Buy camp condition back with cash
 *     description: >
 *       Flat $300 for +40 condition. NOT a training session — it deliberately does not count as
 *       the day's session, so it cannot be used to skip the neglect tick.
 *     tags: [HomeCamp]
 *     parameters:
 *       - in: path
 *         name: fighterId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: "{ deepClean: { cost, before, after, gained, cashAfter, message }, camp: CampState }"
 *       400:
 *         description: condition_full | insufficient_cash
 *       404:
 *         description: camp_not_found | fighter_not_found
 */
router.post("/:fighterId/deep-clean", homeCampController.deepClean);

module.exports = router;
