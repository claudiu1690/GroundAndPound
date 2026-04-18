const mongoose = require("mongoose");

const rankSchema = new mongoose.Schema({
    rank: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    requirements: {
        trainingSessions: { type: Number, default: 0 },
        relevantWins: { type: Number, default: 0 },
        ironCost: { type: Number, default: 0 },
    },
    unlock: {
        type: { type: String, enum: ["access", "session", "xpBonus", "perk"] },
        sessionKey: { type: String, default: null },
        xpBonusPct: { type: Number, default: null },
        perkId: { type: String, default: null },
        badge: { type: String, default: null },
    },
}, { _id: false });

const gymSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    tagline: { type: String, default: "" },
    description: { type: String, default: "" },
    focusStats: [{ type: String }],
    availableFrom: { type: String, required: true },
    weeklyCost: { type: Number, default: 0 },
    xpMultiplier: { type: Number, default: 1.0 },
    focusXpMultiplier: { type: Number, default: 1.0 },
    isFreeGym: { type: Boolean, default: false },
    rankNames: [{ type: String }],
    ranks: [rankSchema],
    sessions: [{ type: String }],
    relevantWinTypes: [{ type: String }],
}, { timestamps: true });

gymSchema.index({ slug: 1 });

const Gym = mongoose.model("Gym", gymSchema);
module.exports = Gym;
