const mongoose = require("mongoose");

/**
 * PvP System v1 (Beta) — one document per resolved attack.
 *
 * Stored separately from PvE `fights` so career records stay clean. The defender
 * is simulated from their persisted stats/OVR/health (no defensive camp in v1 —
 * `defender_camp` is reserved/empty for [v1.1]).
 */
const pvpFightSchema = new mongoose.Schema({
    attacker_id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true, index: true },
    defender_id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true, index: true },
    attacker_camp: { type: [String], default: [] },
    defender_camp: { type: [String], default: [] },   // [v1.1] empty in v1
    result: {
        winner_id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null }, // null on draw
        method:    { type: String, enum: ["KO", "Submission", "Decision", "Draw"], required: true },
        round:     { type: Number, default: null },
    },
    belt_changed:               { type: Boolean, default: false },
    attacker_points_delta:      { type: Number, default: 0 },
    defender_points_delta:      { type: Number, default: 0 },
    attacker_iron_earned:       { type: Number, default: 0 },
    defender_iron_earned:       { type: Number, default: 0 },
    attacker_notoriety_earned:  { type: Number, default: 0 },
    defender_notoriety_earned:  { type: Number, default: 0 },
    attacker_ovr_at_fight:      { type: Number, default: 0 },
    defender_ovr_at_fight:      { type: Number, default: 0 },
    gap_factor:                 { type: Number, default: 1 },
    fought_at:                  { type: Date, default: Date.now },
    seen_by_attacker:           { type: Boolean, default: true },
    seen_by_defender:           { type: Boolean, default: false },
}, { timestamps: true });

pvpFightSchema.index({ attacker_id: 1, fought_at: -1 });
pvpFightSchema.index({ defender_id: 1, fought_at: -1 });
pvpFightSchema.index({ seen_by_defender: 1 });

const PvpFight = mongoose.model("PvpFight", pvpFightSchema);
module.exports = PvpFight;
