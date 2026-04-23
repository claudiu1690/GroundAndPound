const mongoose = require("mongoose");

/**
 * One row per notoriety change (fight award, milestone, decay, manual adjust, etc.).
 * Feeds the Fame drawer "this week" mini-feed and any future notoriety analytics.
 *
 * `code` is a short machine-readable tag (e.g. FIGHT_WIN, MILESTONE, DECAY,
 * CALLOUT_COST, SPONSOR_BONUS) so UIs can filter / icon the row.
 * `reason` is a short human string shown to the player.
 */
const fameEventSchema = new mongoose.Schema(
    {
        fighterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Fighter",
            required: true,
            index: true,
        },
        delta: { type: Number, required: true },
        code: { type: String, required: true },
        reason: { type: String, default: "" },
        meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

fameEventSchema.index({ fighterId: 1, createdAt: -1 });

const FameEvent = mongoose.model("FameEvent", fameEventSchema);
module.exports = FameEvent;
