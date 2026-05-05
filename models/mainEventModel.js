const mongoose = require("mongoose");

/**
 * Weekly Fight Card. Replaces the old single-fight MainEvent.
 *
 * `fights` is an ordered list of 5 sub-fights:
 *   index 0–1: prelim
 *   index 2–3: main card
 *   index 4:   headliner
 *
 * Self-tick lifecycle (resolve on view): once `resolvesAt` passes, the next read
 * runs the simulator on each sub-fight, updates NPC records / fightHistory, marks
 * the card resolved, and a fresh card is auto-created.
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

const subFightSchema = new mongoose.Schema({
    slot:        { type: String, enum: ["PRELIM", "MAIN", "HEADLINER"], required: true },
    weightClass: { type: String, required: true },
    fighterA:    { type: fighterCardSchema, required: true },
    fighterB:    { type: fighterCardSchema, required: true },
    actualOutcome: {
        winnerSide: { type: String, enum: ["A", "B", "DRAW", null], default: null },
        method:     { type: String, enum: ["KO/TKO", "Submission", "Decision", "Draw", null], default: null },
    },
}, { _id: true });

const fightCardSchema = new mongoose.Schema(
    {
        cardNumber: { type: Number, default: 1 },
        status:     { type: String, enum: ["upcoming", "resolved"], default: "upcoming", index: true },
        opensAt:    { type: Date, required: true },
        resolvesAt: { type: Date, required: true },
        resolvedAt: { type: Date, default: null },
        fights:     { type: [subFightSchema], default: [] },
    },
    { timestamps: true, collection: "fightcards" }
);

fightCardSchema.index({ status: 1, resolvesAt: 1 });
fightCardSchema.index({ createdAt: -1 });

const FightCard = mongoose.model("FightCard", fightCardSchema);
module.exports = FightCard;
