const mongoose = require("mongoose");
const { FIGHT_OUTCOMES } = require("../consts/gameConstants");

const fightSchema = new mongoose.Schema({
    fighterId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    opponentId: { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", required: true },
    offerType: { type: String }, // Easy, Even, Hard, Short notice, Title shot
    promotionTier: { type: String, required: true },
    playerStrategy: { type: String, default: null }, // GDD 8.3: Pressure Fighter, Counter Striker, etc.
    weightCut: { type: String, enum: ["easy", "moderate", "aggressive"], default: "easy" }, // GDD 8.8
    weightCutRoll: { type: Number, default: null }, // stamina bonus/penalty from the cut
    status: {
        type: String,
        enum: ["offered", "accepted", "completed", "cancelled"],
        default: "offered"
    },
    outcome: { type: String, enum: FIGHT_OUTCOMES, default: null },
    ironEarned: { type: Number, default: 0 },
    xpMultiplier: { type: Number, default: 1 },
    rounds: [{ type: String }],
    commentary: [{ type: String }],
    completedAt: { type: Date, default: null },
}, { timestamps: true });

fightSchema.index({ fighterId: 1, status: 1 });
fightSchema.index({ status: 1 });

const Fight = mongoose.model("Fight", fightSchema);
module.exports = Fight;
