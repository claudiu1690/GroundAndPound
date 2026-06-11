const mongoose = require("mongoose");
const { SEASON_WEIGHT_CLASSES, WEIGHT_CLASSES_PVP, DIVISION_KEYS, GAMEPLAN_KEYS } = require("../consts/pvpConfig");

const pvpRecordSchema = new mongoose.Schema({
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: "Season", required: true },
    // SEASON-DERIVED weightClass — it equals the season's weightClass, NOT necessarily
    // the fighter's real class. In an Open season this is "Open" for EVERY record. This
    // is load-bearing: every pool/ladder/rank/belt/decay/fight-validation query filters
    // on it to merge or partition the pool. Do NOT "fix" it to the fighter's real class —
    // use `realWeightClass` (below) for the fighter's true class instead.
    weightClass: { type: String, enum: SEASON_WEIGHT_CLASSES, required: true },
    // The fighter's REAL weight class at the time of record creation. Used only for the
    // Open→per-WC season-end redistribution and the realWeightClass DTO surface; never
    // for pool filtering. Null on legacy records (predating this field).
    realWeightClass: { type: String, enum: WEIGHT_CLASSES_PVP, default: null },
    division: { type: String, enum: DIVISION_KEYS, default: "prospect" },
    dp: { type: Number, default: 0, min: 0 },
    peakDp: { type: Number, default: 0 },
    // Denormalized OVR snapshot — refreshed every fight + on own-record read-through.
    // Drives matchmaking OVR-bracket queries without an N+1 join to fighters.
    overallRating: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    defenseGameplan: { type: String, enum: GAMEPLAN_KEYS, default: "balanced" },
    promotionShield: { type: Number, default: 0, min: 0, max: 3 },
    lastFightAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: Date.now },
    // Idempotency markers — see pvpDecayService / pvpRewardService.
    lastDecayAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },
    // Has the player acknowledged the SeasonEnd/NewSeason modal for THIS (now ended)
    // record? Drives the GET /pvp/season/current `justEnded` signal. Set true via
    // POST /pvp/acknowledge-season.
    seasonEndSeen: { type: Boolean, default: false },
}, { timestamps: true });

// One record per player per season (record lookup).
pvpRecordSchema.index({ playerId: 1, seasonId: 1 }, { unique: true });
// Ladder pagination + champion-division belt-holder (#1 in champion).
pvpRecordSchema.index({ seasonId: 1, weightClass: 1, dp: -1 });
// Matchmaking OVR-bracket query.
pvpRecordSchema.index({ seasonId: 1, weightClass: 1, overallRating: 1 });
// Decay batch scan.
pvpRecordSchema.index({ seasonId: 1, lastFightAt: 1 });
// Open→per-WC season-end redistribution: group an Open season's records by real class.
pvpRecordSchema.index({ seasonId: 1, realWeightClass: 1 });

module.exports = mongoose.model("PVPRecord", pvpRecordSchema);
