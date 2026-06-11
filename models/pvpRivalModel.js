const mongoose = require("mongoose");

const pvpRivalSchema = new mongoose.Schema({
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: "Season", required: true },
    player1Id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    player2Id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    wins: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "resolved"], default: "active" },
    resolvedAt: { type: Date, default: null },
}, { timestamps: true });

// One directional rival per pair per season.
pvpRivalSchema.index({ seasonId: 1, player1Id: 1, player2Id: 1 }, { unique: true });
// "Am I someone's rival target" lookups for matchmaking flags.
pvpRivalSchema.index({ seasonId: 1, player2Id: 1 });

module.exports = mongoose.model("PVPRival", pvpRivalSchema);
