const mongoose = require("mongoose");

/**
 * Ground & Pound — per-bot activity scheduler state.
 *
 * WHY A SEPARATE COLLECTION (and not fields on Fighter):
 *  1. fighterService.toPublicFighter serializes the WHOLE fighter doc. Any scheduling
 *     field parked on Fighter would leak straight out of the fighter endpoints and hand
 *     players a "next bot attack at 14:07 UTC" oracle.
 *  2. pvpFightService persists the DEFENDER through saveWithVersionRetry (optimistic
 *     concurrency). A bot is a defender constantly. Writing scheduler state onto the same
 *     Fighter doc from the bot tick would collide with that retry loop and either lose the
 *     schedule write or force pointless version-conflict retries on real fights.
 *
 * Lifecycle: created by scripts/seedPvpBots.js (find-or-create), advanced only by
 * services/pvpBotService.runBotActivityTick.
 */
const pvpBotStateSchema = new mongoose.Schema({
    fighterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fighter",
        required: true,
        unique: true,
    },
    /** When this bot is next allowed to act. The tick claims rows with nextActivityAt <= now. */
    nextActivityAt: { type: Date },
    /** Fixed per-bot cadence (hours). Jitter is applied on top per reschedule. */
    baseIntervalHours: { type: Number },
    /** Start hour (UTC, 0-23) of this bot's personal BOT_HOUR_BAND_WIDTH-hour activity band. */
    hourBandStart: { type: Number, min: 0, max: 23 },
    /** Round-robin cursor into GAMEPLAN_KEYS — a bot varies its gameplan like a person would. */
    gameplanIndex: { type: Number, default: 0 },
    /** Last time the tick CLAIMED this bot (whether or not a fight happened). */
    lastAttemptAt: { type: Date, default: null },
    /** Last time this bot actually resolved a fight. */
    lastFightAt: { type: Date, default: null },
    /** Consecutive claims that produced no fight. Diagnostic — a climbing value means a starved pool. */
    consecutiveSkips: { type: Number, default: 0 },
}, { timestamps: true, collection: "pvpbotstates" });

// One state row per bot.
pvpBotStateSchema.index({ fighterId: 1 }, { unique: true });
// The tick's only scan: due bots.
pvpBotStateSchema.index({ nextActivityAt: 1 });

module.exports = mongoose.model("PvpBotState", pvpBotStateSchema);
