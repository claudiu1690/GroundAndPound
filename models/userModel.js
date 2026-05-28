const mongoose = require("mongoose");

/**
 * User / account document. Separate from Fighter — credentials, email-state,
 * password-reset / email-change tokens, notifications toggle, and the
 * soft-delete grace flag all live here.
 *
 * Tokens are stored hashed (SHA-256 of the raw token) and the raw value is
 * only ever sent in the email link. That way a DB leak can't be replayed.
 */
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

    // ── Email change flow ─────────────────────────────────────────
    emailPending:       { type: String,  default: null, lowercase: true, trim: true },
    emailConfirmed:     { type: Boolean, default: true },   // legacy accounts treated as confirmed
    emailChangeToken:   { type: String,  default: null },   // SHA-256 hex of the raw token
    emailChangeExpires: { type: Date,    default: null },

    // ── Password reset flow ───────────────────────────────────────
    passwordResetToken:   { type: String, default: null }, // SHA-256 hex of the raw token
    passwordResetExpires: { type: Date,   default: null },
    /** Used to invalidate all outstanding JWTs after a password change. Stamp
     *  in the JWT must equal this value for the session to be accepted. */
    sessionEpoch: { type: Number, default: 1 },

    // ── Notifications ─────────────────────────────────────────────
    notifications: {
        emailEnabled: { type: Boolean, default: true },
    },

    // ── Soft-delete + 30-day grace ────────────────────────────────
    deletionRequestedAt: { type: Date,    default: null },
    deleted:             { type: Boolean, default: false, index: true },

    createdAt: { type: Date, default: Date.now },
});

// Sparse indexes so we can look up tokens fast without storing nulls forever.
userSchema.index({ passwordResetToken: 1 }, { sparse: true });
userSchema.index({ emailChangeToken: 1 },   { sparse: true });

module.exports = mongoose.model("User", userSchema);
