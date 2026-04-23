const mongoose = require("mongoose");

/**
 * One row per weekly Main Event of the Week. Self-ticks on view — when the window
 * closes, the next fetch resolves this event and creates a new one.
 *
 * Lifecycle:
 *   status = "upcoming" → predictions open
 *   status = "resolved" → actualOutcome set, rewards paid, history only
 */

const fighterCardSchema = new mongoose.Schema({
    opponentId:    { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", required: true },
    name:          { type: String, required: true },
    nickname:      { type: String, default: null },
    style:         { type: String, default: null },
    weightClass:   { type: String, required: true },
    overallRating: { type: Number, required: true },
    promotionTier: { type: String, default: null },
    record: {
        wins:   { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws:  { type: Number, default: 0 },
    },
}, { _id: false });

const mainEventSchema = new mongoose.Schema(
    {
        fighterA:    { type: fighterCardSchema, required: true },
        fighterB:    { type: fighterCardSchema, required: true },
        weightClass: { type: String, required: true },
        status:      { type: String, enum: ["upcoming", "resolved"], default: "upcoming", index: true },
        opensAt:     { type: Date, required: true },
        resolvesAt:  { type: Date, required: true },
        resolvedAt:  { type: Date, default: null },
        /** Actual outcome after simulation. */
        actualOutcome: {
            winnerSide: { type: String, enum: ["A", "B", "DRAW", null], default: null },
            method:     { type: String, enum: ["KO/TKO", "Submission", "Decision", "Draw", null], default: null },
        },
        /** Aggregated prediction counts — driven by the predictions collection on demand. */
        predictionCount: {
            total: { type: Number, default: 0 },
            A:     { type: Number, default: 0 },
            B:     { type: Number, default: 0 },
            DRAW:  { type: Number, default: 0 },
        },
    },
    { timestamps: true }
);

mainEventSchema.index({ status: 1, resolvesAt: 1 });
mainEventSchema.index({ createdAt: -1 });

const MainEvent = mongoose.model("MainEvent", mainEventSchema);
module.exports = MainEvent;
