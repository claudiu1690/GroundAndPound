/**
 * Ground & Pound — Fight Description System (derived breakdown sub-schemas).
 *
 * These two `_id:false` sub-schemas are embedded under `breakdown` on BOTH the
 * PvE Fight model and the PvP PVPFight model. They are DERIVED from the existing
 * `resolveFight` engine output at resolve time (see utils/fightBreakdown.js) — the
 * combat loop is never rewritten.
 *
 * Persisted in ENGINE perspective (player = engine player = PvE fighter / PvP
 * attacker). The read service swaps to viewer perspective on the way out.
 *
 * `breakdown.version == null` ⇒ legacy / not-derived fight (degrade gracefully).
 */

const mongoose = require("mongoose");

// One narrated beat of the fight. `vars` carries the substitution slots the
// frontend template engine fills from `templateKey`.
const eventLogSchema = new mongoose.Schema(
    {
        round: { type: Number, required: true },
        // "M:SS", or null for a round-only event (a move_fired with no logged exchange to
        // attach to, wildcard_fired). Never an invented time.
        timestamp: { type: String, default: null },
        type: { type: String, required: true }, // coarse: strike|takedown|submission|ground|knockdown|camp|finish|neutral|move|wildcard
        actorIsPlayer: { type: Boolean, required: true },
        templateKey: { type: String, required: true },
        vars: {
            strike: { type: String, default: null },
            sub: { type: String, default: null },
            position: { type: String, default: null },
            bodyPart: { type: String, default: null },
            // move_fired (Fight replay highlights): every moveId of the (possibly merged) entry.
            moveIds: { type: [String], default: undefined },
            bonusType: { type: String, default: null },
            effectType: { type: String, default: null }, // PROC | SIGNATURE
            outcome: { type: String, default: null }, // vocabulary: utils/fightBreakdownView.js EventLogEntry
            stat: { type: String, default: null }, // wildcard_fired: the opponent's boosted stat key
            count: { type: Number, default: null }, // move_fired: triggerCount delta for this event
        },
    },
    { _id: false }
);

// Per-round aggregate stat line. `damagePlayer/damageOpponent` are CUMULATIVE %
// through the round (monotonic non-decreasing, clamped 0..100).
const roundStatsSchema = new mongoose.Schema(
    {
        round: { type: Number, required: true },
        strikesPlayer: { type: Number, default: 0 },
        strikesOpponent: { type: Number, default: 0 },
        takedownsPlayer: { type: Number, default: 0 },
        takedownsOpponent: { type: Number, default: 0 },
        subAttemptsPlayer: { type: Number, default: 0 },
        subAttemptsOpponent: { type: Number, default: 0 },
        knockdownsPlayer: { type: Number, default: 0 },
        knockdownsOpponent: { type: Number, default: 0 },
        damagePlayer: { type: Number, default: 0 }, // cumulative %
        damageOpponent: { type: Number, default: 0 }, // cumulative %
        staminaPlayer: { type: Number, default: null }, // stamina through this round (null: older fights)
        staminaOpponent: { type: Number, default: null },
        healthPlayer: { type: Number, default: null }, // health at the end of this round (null: older fights)
        healthOpponent: { type: Number, default: null },
        controlTimePlayer: { type: Number, default: 0 }, // seconds
        controlTimeOpponent: { type: Number, default: 0 }, // seconds
        roundWinner: { type: String, enum: ["player", "opponent", "even"], required: true },
        dominant: { type: Boolean, default: false },
    },
    { _id: false }
);

// Fight replay highlights: the player's corner for THIS fight, frozen at resolve (names, rarity,
// art and fired counts) so a later reopen never depends on the live catalog or current equipment.
// Built by utils/fightLoadoutSnapshot.js. PvE only (PvP never writes it).
const loadoutMoveRowSchema = new mongoose.Schema(
    {
        moveId: { type: String, required: true },
        name: { type: String, default: null },
        rarity: { type: String, default: null },
        effectType: { type: String, default: null }, // PASSIVE | PROC | SIGNATURE
        bonusType: { type: String, default: null },
        triggerCondition: { type: String, default: null },
        art: { type: String, default: null },
        triggered: { type: Boolean, default: false },
        firedCount: { type: Number, default: 0 },
    },
    { _id: false }
);

const loadoutCampRowSchema = new mongoose.Schema(
    {
        sessionType: { type: String, default: null },
        label: { type: String, default: null },
        matchStatus: { type: String, default: null },
        triggered: { type: Boolean, default: false },
        firedCount: { type: Number, default: 0 },
    },
    { _id: false }
);

const loadoutSchema = new mongoose.Schema(
    {
        moves: { type: [loadoutMoveRowSchema], default: [] },
        camp: { type: [loadoutCampRowSchema], default: [] },
    },
    { _id: false }
);

module.exports = { eventLogSchema, roundStatsSchema, loadoutSchema, loadoutMoveRowSchema, loadoutCampRowSchema };
