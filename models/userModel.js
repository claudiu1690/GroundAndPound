const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    passwordHash: { type: String, required: true },
    fighterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fighter",
        default: null,
    },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
