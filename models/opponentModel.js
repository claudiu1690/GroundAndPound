const mongoose = require("mongoose");
const { WEIGHT_CLASSES, STYLES } = require("../consts/gameConstants");

const statSchema = { type: Number, min: 1, max: 100, default: 10 };

const opponentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nickname: { type: String, default: null },
    weightClass: { type: String, enum: WEIGHT_CLASSES, required: true },
    style: { type: String, enum: Object.keys(STYLES), required: true },
    promotionTier: { type: String, required: true },
    str: statSchema, spd: statSchema, leg: statSchema, wre: statSchema,
    gnd: statSchema, sub: statSchema, chn: statSchema, fiq: statSchema,
    overallRating: { type: Number, required: true },
    record: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
    },
}, { timestamps: true });

opponentSchema.index({ promotionTier: 1, weightClass: 1, overallRating: 1 });

const Opponent = mongoose.model("Opponent", opponentSchema);
module.exports = Opponent;
