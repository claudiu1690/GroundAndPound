const mongoose = require("mongoose");

/**
 * One prediction per fighter per sub-fight on a card. Created when the player
 * picks; updated with `resolution` when the card resolves so history can be
 * rendered without a join.
 *
 * Unique on (fighterId, cardId, fightIndex) — one bet per fight per fighter.
 */
const predictionSchema = new mongoose.Schema(
    {
        fighterId:   { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true, index: true },
        cardId:      { type: mongoose.Schema.Types.ObjectId, ref: "FightCard", required: true, index: true },
        fightIndex:  { type: Number, required: true },                 // 0..4 within card.fights
        fightSlot:   { type: String, enum: ["PRELIM", "MAIN", "HEADLINER"], required: true },
        /** Side bet: "A" | "B" | "DRAW" */
        pickedSide:   { type: String, enum: ["A", "B", "DRAW"], required: true },
        /** Method bet: "KO/TKO" | "Submission" | "Decision" | "Draw". Ignored when picking Draw. */
        pickedMethod: { type: String, enum: ["KO/TKO", "Submission", "Decision", "Draw", null], default: null },
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

predictionSchema.index({ fighterId: 1, cardId: 1, fightIndex: 1 }, { unique: true });
predictionSchema.index({ fighterId: 1, createdAt: -1 });

const Prediction = mongoose.model("Prediction", predictionSchema);
module.exports = Prediction;
