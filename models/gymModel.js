const mongoose = require("mongoose");
const { GYM_TIERS } = require("../consts/gameConstants");

const gymSchema = new mongoose.Schema({
    name: { type: String, required: true },
    tier: { type: String, required: true, enum: Object.keys(GYM_TIERS) },
    specialtyStats: [{ type: String }],
    monthlyIron: { type: Number, default: 0 },
}, { timestamps: true });

const Gym = mongoose.model("Gym", gymSchema);
module.exports = Gym;
