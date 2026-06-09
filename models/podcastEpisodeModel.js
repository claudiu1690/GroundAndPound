const mongoose = require("mongoose");

/**
 * One row per recorded podcast episode (Media Hub).
 * Drives the Archive "podcast" filter and the hub's "last episode" preview.
 */
const podcastEpisodeSchema = new mongoose.Schema(
    {
        fighterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Fighter",
            required: true,
            index: true,
        },
        episodeNumber: { type: Number, required: true },
        title: { type: String, default: "" },
        segments: { type: [String], default: [] },
        targets: {
            type: [new mongoose.Schema({
                opponentId:   { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", default: null },
                opponentName: { type: String, default: "" },
            }, { _id: false })],
            default: [],
        },
        fameEarned: { type: Number, default: 0 },
        cashEarned: { type: Number, default: 0 },
        listenersAtTime: { type: Number, default: 0 },
        recordedAt: { type: Date, default: Date.now },
        flagsCreated: {
            type: [new mongoose.Schema({
                type:     { type: String },
                targetId: { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", default: null },
            }, { _id: false })],
            default: [],
        },
    },
    { timestamps: true }
);

podcastEpisodeSchema.index({ fighterId: 1, recordedAt: -1 });
podcastEpisodeSchema.index({ fighterId: 1, episodeNumber: -1 });

const PodcastEpisode = mongoose.model("PodcastEpisode", podcastEpisodeSchema);
module.exports = PodcastEpisode;
