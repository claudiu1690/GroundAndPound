const mongoose = require("mongoose");

/**
 * One row per taken media appearance (Media Hub). Drives the Archive
 * "appearances" filter. Post-fight interviews and podcasts live in their own
 * collections and are merged in the archive service.
 */
const mediaArchiveSchema = new mongoose.Schema(
    {
        fighterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Fighter",
            required: true,
            index: true,
        },
        kind: { type: String, enum: ["APPEARANCE"], default: "APPEARANCE" },
        appearanceType: { type: String, required: true },
        label: { type: String, default: "" },
        fameEarned: { type: Number, default: 0 },
        cashEarned: { type: Number, default: 0 },
        flagCreated: {
            type: new mongoose.Schema({
                type:     { type: String, default: null },
                targetId: { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", default: null },
            }, { _id: false }),
            default: null,
        },
        takenAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

mediaArchiveSchema.index({ fighterId: 1, takenAt: -1 });

const MediaArchiveEntry = mongoose.model("MediaArchiveEntry", mediaArchiveSchema);
module.exports = MediaArchiveEntry;
