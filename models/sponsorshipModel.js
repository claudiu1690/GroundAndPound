const mongoose = require("mongoose");

/**
 * A sponsorship contract.
 * One row per accepted deal. Stays in place after completion/break to feed the History tab.
 *
 * status transitions:
 *   active → completed  (clause satisfied)
 *   active → broken     (clause violated)
 *   active → expired    (durationFights reached without completion — only applicable for WIN_ANY_N)
 *   active → dropped    (player manually cancelled, fame penalty applied)
 */
const sponsorshipSchema = new mongoose.Schema(
    {
        fighterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Fighter",
            required: true,
            index: true,
        },
        sponsorId: { type: String, required: true },
        brand:     { type: String, required: true },
        tagline:   { type: String, default: "" },
        unlockTier: { type: String, default: "PROSPECT" },
        clause: {
            type: { type: String, required: true },
            params: { type: mongoose.Schema.Types.Mixed, default: {} },
        },
        durationFights: { type: Number, default: 3 },
        rewardPerFight:      { type: Number, default: 0 },
        rewardBonus:         { type: Number, default: 0 },
        fameBonusOnComplete: { type: Number, default: 0 },
        famePenaltyOnBreak:  { type: Number, default: 0 },
        progress: { type: mongoose.Schema.Types.Mixed, default: {} },
        totals: {
            ironEarned: { type: Number, default: 0 },
            fameEarned: { type: Number, default: 0 },
        },
        status: {
            type: String,
            enum: ["active", "completed", "broken", "expired", "dropped"],
            default: "active",
            index: true,
        },
        resolvedAt: { type: Date, default: null },
        breakReason: { type: String, default: null },
    },
    { timestamps: true }
);

sponsorshipSchema.index({ fighterId: 1, status: 1 });
sponsorshipSchema.index({ fighterId: 1, createdAt: -1 });

const Sponsorship = mongoose.model("Sponsorship", sponsorshipSchema);
module.exports = Sponsorship;
