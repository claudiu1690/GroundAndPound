const mongoose = require("mongoose");
const { WEIGHT_CLASSES_PVP, TWIST_KEYS } = require("../consts/pvpConfig");

const seasonSchema = new mongoose.Schema({
    seasonNumber: { type: Number, required: true },
    name: { type: String, required: true },
    twist: { type: String, enum: TWIST_KEYS, default: "iron_circuit" },
    weightClass: { type: String, enum: WEIGHT_CLASSES_PVP, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["upcoming", "active", "ended"], default: "upcoming" },
    beltHolderId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null },
}, { timestamps: true });

// One season per weight class per cycle.
seasonSchema.index({ weightClass: 1, seasonNumber: 1 }, { unique: true });
// Transition sweep: upcoming whose start passed.
seasonSchema.index({ status: 1, startDate: 1 });
// Transition sweep: active past endDate.
seasonSchema.index({ status: 1, endDate: 1 });

module.exports = mongoose.model("Season", seasonSchema);
