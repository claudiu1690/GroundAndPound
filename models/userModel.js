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
    // Credentials are OPTIONAL — guest accounts carry neither until they claim
    // an email. Uniqueness on `email` is enforced by a partial unique index
    // (see below), NOT an inline `unique: true`, so multiple null emails coexist.
    email: {
        type: String,
        default: null,
        lowercase: true,
        trim: true,
    },
    passwordHash: { type: String, default: null },
    fighterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fighter",
        default: null,
    },

    // ── Email change flow ─────────────────────────────────────────
    emailPending:       { type: String,  default: null, lowercase: true, trim: true },
    /**
     * `true` once the user has clicked the verify link sent at registration.
     * Schema default stays `true` so legacy accounts that pre-date this flow
     * are grandfathered as confirmed. The register controller explicitly sets
     * this to `false` for brand-new signups, and verifyEmail flips it back.
     */
    emailConfirmed:     { type: Boolean, default: true },
    emailChangeToken:   { type: String,  default: null },   // SHA-256 hex of the raw token
    emailChangeExpires: { type: Date,    default: null },
    /** Timestamp of the last email-change link we sent. Used to enforce the
     *  60s resend cooldown — see accountService.resendEmailChange. */
    emailChangeLastSentAt: { type: Date, default: null },

    // ── Email verification (new signups) ──────────────────────────
    emailVerifyToken:      { type: String, default: null },   // SHA-256 hex of the raw token
    emailVerifyExpires:    { type: Date,   default: null },   // 24h TTL
    /** Used by the 60s resend cooldown on the verification banner. */
    emailVerifyLastSentAt: { type: Date,   default: null },

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

    // ── Guest lane ────────────────────────────────────────────────
    /** True while this is an unclaimed guest (no email attached). Flipped to
     *  false at claim time. Purge and UI both key off this. */
    isGuest: { type: Boolean, default: false },

    /** SHA-256 hex of the raw recovery code (never stored plaintext). Null for
     *  email-first accounts and cleared at claim. */
    recoveryCodeHash:      { type: String, default: null },
    recoveryCodeCreatedAt: { type: Date,   default: null },

    /** Last authenticated activity. Stamped (throttled) by auth middleware for
     *  guests only; drives the inactivity purge. */
    lastActiveAt: { type: Date, default: Date.now },

    // ── Soft-delete + 30-day grace ────────────────────────────────
    deletionRequestedAt: { type: Date,    default: null },
    deleted:             { type: Boolean, default: false, index: true },

    createdAt: { type: Date, default: Date.now },
});

// Sparse indexes so we can look up tokens fast without storing nulls forever.
userSchema.index({ passwordResetToken: 1 }, { sparse: true });
userSchema.index({ emailChangeToken: 1 },   { sparse: true });
userSchema.index({ emailVerifyToken: 1 },   { sparse: true });

// Partial unique index — uniqueness enforced only on real email strings, so any
// number of guests can share `email: null` without colliding. Replaces the
// old inline `unique: true` on the email field (which produced `email_1`).
userSchema.index(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: "string" } }, name: "email_unique_partial" }
);

// Purge query support — the daily guest sweep filters on { isGuest, lastActiveAt }.
userSchema.index({ isGuest: 1, lastActiveAt: 1 });

// Recovery-code lookup (sparse — only guests carry one).
userSchema.index({ recoveryCodeHash: 1 }, { sparse: true });

module.exports = mongoose.model("User", userSchema);
