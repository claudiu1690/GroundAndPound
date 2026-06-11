const mongoose = require("mongoose");
const { SEASON_WEIGHT_CLASSES } = require("../consts/pvpConfig");

const hallOfFameSchema = new mongoose.Schema({
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: "Season", required: true },
    seasonNumber: { type: Number },
    // SEASON-DERIVED — "Open" for an Open season's belt entry.
    weightClass: { type: String, enum: SEASON_WEIGHT_CLASSES },
    beltHolderId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter" },
    finalDp: { type: Number, default: 0 },
    record: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
    },
}, { timestamps: true });

hallOfFameSchema.index({ weightClass: 1, seasonNumber: -1 });
hallOfFameSchema.index({ beltHolderId: 1 });
// Guard re-finalize from creating a duplicate HoF entry for the same season.
hallOfFameSchema.index({ seasonId: 1 }, { unique: true });

module.exports = mongoose.model("HallOfFame", hallOfFameSchema);
