const mongoose = require("mongoose");

/**
 * One bet per fighter per sub-fight on a card. Iron is staked at bet-time, odds
 * are locked, and on card resolution the player either wins (payout = stake ×
 * odds, paid to iron balance) or forfeits the stake. Fame is not involved.
 *
 * Bet types:
 *   WINNER — bet on who wins (A / B / DRAW). Method is ignored.
 *   EXACT  — bet on winner AND method (KO/TKO, Submission, Decision, or DRAW).
 *
 * Resolution shape stores both the deltas and the booleans the UI uses to
 * colour-code results.
 *
 * Unique on (fighterId, cardId, fightIndex) — one bet per fight per fighter.
 */
const predictionSchema = new mongoose.Schema(
    {
        fighterId:   { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true, index: true },
        cardId:      { type: mongoose.Schema.Types.ObjectId, ref: "FightCard", required: true, index: true },
        fightIndex:  { type: Number, required: true },                 // 0..4 within card.fights
        fightSlot:   { type: String, enum: ["PRELIM", "MAIN", "HEADLINER"], required: true },

        /** WINNER (side only) or EXACT (side + method). */
        betType:      { type: String, enum: ["WINNER", "EXACT"], required: true },
        /** Side bet: "A" | "B" | "DRAW" */
        pickedSide:   { type: String, enum: ["A", "B", "DRAW"], required: true },
        /** Method bet — required for EXACT, null for WINNER. Draw side forces "Draw". */
        pickedMethod: { type: String, enum: ["KO/TKO", "Submission", "Decision", "Draw", null], default: null },

        /** Iron stake committed when the bet is placed. Deducted immediately. */
        stake:        { type: Number, required: true, min: 1 },
        /** Decimal odds locked at bet time. Payout on win = stake × lockedOdds. */
        lockedOdds:   { type: Number, required: true, min: 1 },

        matchup: {
            aName: { type: String, default: "" },
            bName: { type: String, default: "" },
        },
        resolution: {
            resolved:     { type: Boolean, default: false },
            won:          { type: Boolean, default: false },
            /** Iron paid back to the fighter on a win (= stake × lockedOdds, rounded).
             *  On a loss this is 0 — the stake is already gone. */
            payout:       { type: Number, default: 0 },
            /** Net change to the player's iron: payout − stake on win, −stake on loss.
             *  Used by the UI to show "you won +150 iron" / "you lost 100 iron". */
            netDelta:     { type: Number, default: 0 },
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
