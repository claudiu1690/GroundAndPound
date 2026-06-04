const mongoose = require("mongoose");

/**
 * The Circuit v1.2 — Seasons & Divisions.
 *
 * One document per PvP season. Exactly one season is `active` at a time; the rest are
 * `ended`. A season runs `PVP_SEASON_LENGTH_DAYS` (4 weeks). The nightly
 * `pvp-season-rollover` job acts ONLY when `now >= ends_at`, captures the live belt holder as
 * `champion_id`, soft-resets ladder points, grants division-gated rewards, marks the season
 * `ended`, and creates the next `active` season. The status flip is the idempotency gate so a
 * re-run of the job is a no-op.
 *
 * Divisions are a VIEW-LAYER over the single global ladder (band-based on rank_points, contract
 * Risk 4 — NOT quota/percentile), so this collection stores no per-fighter placement.
 */
const pvpSeasonSchema = new mongoose.Schema({
    season_number: { type: Number, required: true, unique: true },
    status: { type: String, enum: ["active", "ended"], default: "active" },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, required: true },               // = starts_at + PVP_SEASON_LENGTH_DAYS
    champion_id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null },
    rolled_over_at: { type: Date, default: null },
}, { timestamps: true });

pvpSeasonSchema.index({ status: 1 });
pvpSeasonSchema.index({ season_number: -1 });

const PvpSeason = mongoose.model("PvpSeason", pvpSeasonSchema);
module.exports = PvpSeason;
