const mongoose = require("mongoose");
const { SEASON_WEIGHT_CLASSES, TWIST_KEYS } = require("../consts/pvpConfig");

const seasonSchema = new mongoose.Schema({
    seasonNumber: { type: Number, required: true },
    name: { type: String, required: true },
    twist: { type: String, enum: TWIST_KEYS, default: "iron_circuit" },
    // SEASON_WEIGHT_CLASSES = the 4 real classes + the "Open" sentinel. An Open
    // (cross-weight-class) season carries weightClass: "Open".
    weightClass: { type: String, enum: SEASON_WEIGHT_CLASSES, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["upcoming", "active", "ended"], default: "upcoming" },
    beltHolderId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null },
    // Completion sentinel for finalizeSeason. status="ended" stops new fights immediately,
    // but redistribution + N+1 seeding run AFTER. If the process dies in that window, this
    // stays null and the transition sweep re-runs finalize (every step is idempotent). Only
    // set once redistribution + seeding fully completed.
    redistributedAt: { type: Date, default: null },
    // Open-season marker. When crossWeightClass=true the season is a single merged
    // ladder across all weight classes (one belt, one reward pass).
    config: {
        crossWeightClass: { type: Boolean, default: false },
    },
}, { timestamps: true });

// One season per weight class per cycle.
seasonSchema.index({ weightClass: 1, seasonNumber: 1 }, { unique: true });
// Transition sweep: upcoming whose start passed.
seasonSchema.index({ status: 1, startDate: 1 });
// Transition sweep: active past endDate.
seasonSchema.index({ status: 1, endDate: 1 });

module.exports = mongoose.model("Season", seasonSchema);
