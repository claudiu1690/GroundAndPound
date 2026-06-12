const mongoose = require("mongoose");
const { SEASON_WEIGHT_CLASSES, GAMEPLAN_KEYS } = require("../consts/pvpConfig");

const pvpFightSchema = new mongoose.Schema({
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: "Season", required: true },
    // SEASON-DERIVED — equals the season's weightClass ("Open" in an Open season).
    weightClass: { type: String, enum: SEASON_WEIGHT_CLASSES, required: true },
    attackerId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    defenderId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    attackerGameplan: { type: String, enum: GAMEPLAN_KEYS },
    defenderGameplan: { type: String, enum: GAMEPLAN_KEYS },
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null },
    loserId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null },
    // "draw" included — the engine can produce draws (DRAW chance / even scorecard).
    method: { type: String, enum: ["decision", "ko", "submission", "draw"] },
    attackerDpChange: { type: Number, default: 0 },
    defenderDpChange: { type: Number, default: 0 },
    attackerDpBefore: { type: Number, default: 0 },
    attackerDpAfter: { type: Number, default: 0 },
    defenderDpBefore: { type: Number, default: 0 },
    defenderDpAfter: { type: Number, default: 0 },
    attackerDivisionBefore: { type: String },
    attackerDivisionAfter: { type: String },
    defenderDivisionBefore: { type: String },
    defenderDivisionAfter: { type: String },
    dpBreakdown: {
        base: { type: Number, default: 0 },
        rivalryBonus: { type: Number, default: 0 },
        beltHolderBonus: { type: Number, default: 0 },
        bracketBonus: { type: Number, default: 0 },
        streakMultiplier: { type: Number, default: 1 },
        repeatPenalty: { type: Number, default: 1 },
        // Actual DP removed by the repeat penalty (signed, negative) — for display.
        repeatPenaltyDp: { type: Number, default: 0 },
        twistBonus: { type: Number, default: 0 },
        // Catch-up multiplier on attacker WIN DP (1 normally, 2 while catch-up active).
        catchUpMultiplier: { type: Number, default: 1 },
    },
    isRivalryFight: { type: Boolean, default: false },
    isRivalryResolved: { type: Boolean, default: false },
    isBeltHolderFight: { type: Boolean, default: false },
    wasDefenseWhileOffline: { type: Boolean, default: false },
    twistApplied: { type: Boolean, default: false },
    twistName: { type: String, default: null },
    // PVP New Player Experience — a placement fight (one of the attacker's first 3).
    // Placement fights award NO DP, never touch the defender record, and are EXCLUDED
    // from repeat-penalty and rivalry win counts.
    isPlacement: { type: Boolean, default: false },
    // Unread-defense feed: false until the defender views it.
    defenderSeen: { type: Boolean, default: false },
    commentary: { type: [String], default: [] },
    fightAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Repeat-penalty ISO-week count.
pvpFightSchema.index({ attackerId: 1, defenderId: 1, seasonId: 1, fightAt: 1 });
// Unread defense results.
pvpFightSchema.index({ defenderId: 1, defenderSeen: 1, fightAt: -1 });
// History endpoints.
pvpFightSchema.index({ seasonId: 1, fightAt: -1 });
pvpFightSchema.index({ attackerId: 1, fightAt: -1 });
// Rivalry win-count.
pvpFightSchema.index({ seasonId: 1, winnerId: 1, loserId: 1 });

module.exports = mongoose.model("PVPFight", pvpFightSchema);
