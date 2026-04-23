const mongoose = require("mongoose");

/**
 * One prediction per fighter per main event. Created when the player submits, updated
 * with `resolution` when the event resolves (so we can list a history without re-joining
 * the main-event collection).
 */
const predictionSchema = new mongoose.Schema(
    {
        fighterId:   { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true, index: true },
        mainEventId: { type: mongoose.Schema.Types.ObjectId, ref: "MainEvent", required: true, index: true },
        /** Side bet: "A" | "B" | "DRAW" */
        pickedSide:   { type: String, enum: ["A", "B", "DRAW"], required: true },
        /** Method bet: "KO/TKO" | "Submission" | "Decision" | "Draw". Ignored when picking Draw. */
        pickedMethod: { type: String, enum: ["KO/TKO", "Submission", "Decision", "Draw", null], default: null },
        /** Snapshot of opponent names for the history card (so it works without a rejoin). */
        matchup: {
            aName: { type: String, default: "" },
            bName: { type: String, default: "" },
        },
        resolution: {
            resolved:     { type: Boolean, default: false },
            correctSide:  { type: Boolean, default: false },
            correctExact: { type: Boolean, default: false },
            fameDelta:    { type: Number, default: 0 },
            ironDelta:    { type: Number, default: 0 },
            actualSide:   { type: String, default: null },
            actualMethod: { type: String, default: null },
            resolvedAt:   { type: Date, default: null },
        },
    },
    { timestamps: true }
);

predictionSchema.index({ fighterId: 1, mainEventId: 1 }, { unique: true });
predictionSchema.index({ fighterId: 1, createdAt: -1 });

const Prediction = mongoose.model("Prediction", predictionSchema);
module.exports = Prediction;
