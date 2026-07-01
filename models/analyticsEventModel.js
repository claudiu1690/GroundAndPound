const mongoose = require("mongoose");

/**
 * Internal telemetry event. One document per tracked action.
 *
 * Written fire-and-forget by services/analyticsService.js — analytics writes
 * must never break the calling gameplay path. Read only by the admin retention
 * report (services/analyticsService.computeRetention).
 *
 * `day` is the UTC calendar day ("YYYY-MM-DD") the event occurred, denormalised
 * off createdAt so cohort/day aggregations can group on a cheap string field.
 */
const analyticsEventSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    fighterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fighter",
        default: null,
        index: true,
    },
    type: {
        type: String,
        required: true,
        index: true,
        enum: [
            "signup",
            "session",
            "fight_accepted",
            "fight_resolved",
            "gym_purchase",
            "pvp_unlocked",
            "pvp_first_fight",
        ],
    },
    day: {
        type: String,
        required: true, // "YYYY-MM-DD" UTC
    },
    meta: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Cohort/funnel reads scan by type then narrow by user + time.
analyticsEventSchema.index({ type: 1, userId: 1, createdAt: 1 });
analyticsEventSchema.index({ type: 1, day: 1 });
analyticsEventSchema.index({ userId: 1, type: 1, day: 1 });

const AnalyticsEvent = mongoose.model("AnalyticsEvent", analyticsEventSchema, "analyticsevents");
module.exports = AnalyticsEvent;
