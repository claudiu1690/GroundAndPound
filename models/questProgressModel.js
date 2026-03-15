const mongoose = require("mongoose");

const questProgressSchema = new mongoose.Schema({
    fighterId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    gymId:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym",     required: true },
    questId:   { type: String, required: true },
    status:    { type: String, enum: ["available", "completed"], default: "available" },
    // Cumulative progress counters
    progress: {
        gymTrainingSessions:  { type: Number, default: 0 },
        winsWhileEnrolled:    { type: Number, default: 0 },
        sparringSessions:     { type: Number, default: 0 },
        filmStudySessions:    { type: Number, default: 0 },
        specialtyStatSessions:{ type: Number, default: 0 },
        specialtyStatAtCap:   { type: Number, default: 0 },
        gymTotalSessions:     { type: Number, default: 0 },
        fightsCompleted:      { type: Number, default: 0 },
        decisionWins:         { type: Number, default: 0 },
        nationalPlusFights:   { type: Number, default: 0 },
        gcsFights:            { type: Number, default: 0 },
        allStats60Plus:       { type: Number, default: 0 },
    },
    completedAt: { type: Date, default: null }
}, { timestamps: true });

questProgressSchema.index({ fighterId: 1, gymId: 1, questId: 1 }, { unique: true });
questProgressSchema.index({ fighterId: 1, gymId: 1 });

const QuestProgress = mongoose.model("QuestProgress", questProgressSchema);
module.exports = QuestProgress;
