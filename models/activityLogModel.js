const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
    fighterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fighter",
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: [
            "FIGHT_WIN", "FIGHT_LOSS", "FIGHT_DRAW",
            "TIER_PROMOTION", "TITLE_WON",
            "NEMESIS_SET", "NEMESIS_CLEARED",
            "BADGE_EARNED", "TITLE_SHOT_ELIGIBLE", "MENTAL_RESET",
        ],
        required: true,
    },
    detail: { type: String, required: true },
    tier:   { type: String, default: null },
    meta:   { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

activityLogSchema.index({ fighterId: 1, createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
module.exports = ActivityLog;
