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
        timestamp: { type: String, required: true }, // "M:SS"
        type: { type: String, required: true }, // coarse: strike|takedown|submission|ground|knockdown|camp|finish|neutral
        actorIsPlayer: { type: Boolean, required: true },
        templateKey: { type: String, required: true },
        vars: {
            strike: { type: String, default: null },
            sub: { type: String, default: null },
            position: { type: String, default: null },
            bodyPart: { type: String, default: null },
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
        controlTimePlayer: { type: Number, default: 0 }, // seconds
        controlTimeOpponent: { type: Number, default: 0 }, // seconds
        roundWinner: { type: String, enum: ["player", "opponent", "even"], required: true },
        dominant: { type: Boolean, default: false },
    },
    { _id: false }
);

module.exports = { eventLogSchema, roundStatsSchema };
