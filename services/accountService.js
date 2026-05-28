const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const Fighter = require("../models/fighterModel");
const {
    sendEmail,
    sendAccountEmail,
    passwordResetTemplate,
    verifyEmailTemplate,
    emailChangeTemplate,
    accountDeletedTemplate,
    APP_URL,
} = require("../lib/email");

const PASSWORD_RESET_TTL_MS    = 60 * 60 * 1000;        // 1 hour
const EMAIL_CHANGE_TTL_MS      = 24 * 60 * 60 * 1000;   // 24 hours
const EMAIL_VERIFY_TTL_MS      = 24 * 60 * 60 * 1000;   // 24 hours
const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;             // 60s between resends
const HARD_DELETE_GRACE_MS     = 30 * 24 * 60 * 60 * 1000; // 30 days
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 20;
const NICKNAME_RE  = /^[a-zA-Z0-9\-' ]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_NUMBER_RE = /[0-9]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ──────────────────────────────────────────────────────────────────
// Token helpers
// ──────────────────────────────────────────────────────────────────

function generateRawToken() {
    return crypto.randomBytes(32).toString("hex");
}
function hashToken(raw) {
    return crypto.createHash("sha256").update(raw).digest("hex");
}

// ──────────────────────────────────────────────────────────────────
// Public profile
// ──────────────────────────────────────────────────────────────────

async function getAccountProfile(accountId) {
    const user = await User.findById(accountId).select(
        "email emailPending emailConfirmed emailChangeLastSentAt emailVerifyLastSentAt notifications deletionRequestedAt fighterId"
    ).lean();
    if (!user) throw new Error("Account not found");
    let fighter = null;
    if (user.fighterId) {
        fighter = await Fighter.findById(user.fighterId).select(
            "firstName lastName nickname weightClass style backstory"
        ).lean();
    }
    // Compute remaining resend cooldowns in seconds rather than sending raw
    // timestamps — clock skew between server and browser is irrelevant when we
    // hand the client the delta directly.
    let emailResendCooldown = 0;
    if (user.emailPending && user.emailChangeLastSentAt) {
        const elapsed = Date.now() - new Date(user.emailChangeLastSentAt).getTime();
        const remaining = Math.ceil((EMAIL_RESEND_COOLDOWN_MS - elapsed) / 1000);
        if (remaining > 0) emailResendCooldown = remaining;
    }
    let emailVerifyCooldown = 0;
    if (!user.emailConfirmed && user.emailVerifyLastSentAt) {
        const elapsed = Date.now() - new Date(user.emailVerifyLastSentAt).getTime();
        const remaining = Math.ceil((EMAIL_RESEND_COOLDOWN_MS - elapsed) / 1000);
        if (remaining > 0) emailVerifyCooldown = remaining;
    }
    return {
        accountId: String(user._id),
        email: user.email,
        emailPending: user.emailPending || null,
        emailConfirmed: user.emailConfirmed !== false,
        emailResendCooldown,
        emailVerifyCooldown,
        notifications: user.notifications || { emailEnabled: true },
        deletionRequestedAt: user.deletionRequestedAt || null,
        fighter: fighter
            ? {
                  id: String(fighter._id),
                  firstName: fighter.firstName,
                  lastName:  fighter.lastName,
                  nickname:  fighter.nickname,
                  weightClass: fighter.weightClass,
                  style:       fighter.style,
                  backstory:   fighter.backstory,
                  fullName:    `${fighter.firstName} ${fighter.lastName}`.trim(),
              }
            : null,
    };
}

// ──────────────────────────────────────────────────────────────────
// Nickname
// ──────────────────────────────────────────────────────────────────

async function changeNickname(accountId, nickname) {
    if (typeof nickname !== "string") throw new Error("Nickname required");
    const trimmed = nickname.trim();
    if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX) {
        throw new Error(`Nickname must be ${NICKNAME_MIN}–${NICKNAME_MAX} characters`);
    }
    if (!NICKNAME_RE.test(trimmed)) {
        throw new Error("Nickname can only contain letters, numbers, spaces, hyphens and apostrophes");
    }
    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    if (!user.fighterId) throw new Error("No fighter linked to this account");

    const fighter = await Fighter.findById(user.fighterId);
    if (!fighter) throw new Error("Fighter not found");
    fighter.nickname = trimmed;
    await fighter.save();
    return { nickname: trimmed };
}

// ──────────────────────────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────────────────────────

async function setEmailNotifications(accountId, enabled) {
    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    user.notifications = user.notifications || {};
    user.notifications.emailEnabled = !!enabled;
    await user.save();
    return { emailEnabled: !!enabled };
}

// ──────────────────────────────────────────────────────────────────
// Email change
// ──────────────────────────────────────────────────────────────────

async function requestEmailChange(accountId, newEmail) {
    if (typeof newEmail !== "string") throw new Error("New email required");
    const normalised = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(normalised)) throw new Error("Invalid email format");

    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    if (normalised === user.email) throw new Error("That's already your email");

    // Block email changes until the current email is verified. Without this,
    // a user could chain email-changes through unverified addresses and we'd
    // never know they had a working inbox.
    if (user.emailConfirmed === false) {
        const err = new Error("Please verify your current email before changing it");
        err.code = "email_not_verified";
        throw err;
    }

    // Check it's not already in use by another (non-deleted) account.
    const taken = await User.findOne({
        email: normalised,
        _id:  { $ne: user._id },
        deleted: { $ne: true },
    }).select("_id").lean();
    if (taken) throw new Error("This email is already in use");

    const raw = generateRawToken();
    user.emailChangeToken      = hashToken(raw);
    user.emailChangeExpires    = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
    user.emailChangeLastSentAt = new Date();
    user.emailPending          = normalised;
    await user.save();

    // Confirmation link points at the backend confirm endpoint, which redirects
    // back to the frontend account page with a query param on success.
    const confirmUrl = `${APP_URL}/?account_email_token=${encodeURIComponent(raw)}`;
    let fighterName = "fighter";
    if (user.fighterId) {
        const f = await Fighter.findById(user.fighterId).select("firstName nickname").lean();
        if (f) fighterName = f.nickname || f.firstName || "fighter";
    }
    const tpl = emailChangeTemplate({ fighterName, confirmUrl });
    // Email change confirmation is non-essential per the spec — gated by notifications.
    await sendAccountEmail({ email: normalised, notifications: user.notifications }, tpl);
    return { pending: normalised };
}

async function confirmEmailChange(rawToken) {
    if (!rawToken || typeof rawToken !== "string") {
        const err = new Error("Invalid token");
        err.code = "invalid_token";
        throw err;
    }
    const hashed = hashToken(rawToken);
    const user = await User.findOne({ emailChangeToken: hashed, deleted: { $ne: true } });
    if (!user) {
        const err = new Error("Invalid token");
        err.code = "invalid_token";
        throw err;
    }
    if (!user.emailChangeExpires || user.emailChangeExpires.getTime() < Date.now()) {
        // Clear stale token so a fresh request can be issued.
        user.emailChangeToken = null;
        user.emailChangeExpires = null;
        user.emailChangeLastSentAt = null;
        user.emailPending = null;
        await user.save();
        const err = new Error("Link expired");
        err.code = "expired";
        throw err;
    }
    if (!user.emailPending) {
        const err = new Error("Nothing to confirm");
        err.code = "invalid_state";
        throw err;
    }
    // Final uniqueness check at apply-time in case someone else grabbed it.
    const taken = await User.findOne({
        email: user.emailPending,
        _id: { $ne: user._id },
        deleted: { $ne: true },
    }).select("_id").lean();
    if (taken) {
        user.emailChangeToken = null;
        user.emailChangeExpires = null;
        user.emailChangeLastSentAt = null;
        user.emailPending = null;
        await user.save();
        const err = new Error("Email already in use");
        err.code = "email_taken";
        throw err;
    }

    user.email = user.emailPending;
    user.emailPending = null;
    user.emailChangeToken = null;
    user.emailChangeExpires = null;
    user.emailChangeLastSentAt = null;
    user.emailConfirmed = true;
    await user.save();
    return { email: user.email };
}

async function resendEmailChange(accountId) {
    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    if (!user.emailPending) throw new Error("No pending email change");

    // 60-second cooldown between resends. Guards against accidental double-
    // clicks AND deliberate spamming that would burn Resend quota. The initial
    // request isn't gated — only re-sends after the first one are.
    const lastSent = user.emailChangeLastSentAt ? user.emailChangeLastSentAt.getTime() : 0;
    const elapsed  = Date.now() - lastSent;
    if (lastSent && elapsed < EMAIL_RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((EMAIL_RESEND_COOLDOWN_MS - elapsed) / 1000);
        const err = new Error(`Please wait ${retryAfter}s before requesting another link`);
        err.code = "cooldown_active";
        err.retryAfter = retryAfter;
        throw err;
    }
    // Reuse the request flow — it generates a fresh token, sends, and re-stamps
    // emailChangeLastSentAt so the next call has to wait again.
    return requestEmailChange(accountId, user.emailPending);
}

// ──────────────────────────────────────────────────────────────────
// Email verification (new signups — see authController.register)
// ──────────────────────────────────────────────────────────────────

/**
 * Generate a verify token, stamp the cooldown timestamp, and send the email.
 * Called once at register and again on each successful resend. Skips silently
 * if the account is already confirmed — verifying twice is a no-op.
 */
async function sendVerifyEmail(user) {
    if (user.emailConfirmed) return { skipped: true, reason: "already_verified" };

    const raw = generateRawToken();
    user.emailVerifyToken      = hashToken(raw);
    user.emailVerifyExpires    = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    user.emailVerifyLastSentAt = new Date();
    await user.save();

    const verifyUrl = `${APP_URL.replace(/\/$/, "")}/auth/verify-email?token=${encodeURIComponent(raw)}`;
    let fighterName = "fighter";
    if (user.fighterId) {
        const f = await Fighter.findById(user.fighterId).select("firstName nickname").lean();
        if (f) fighterName = f.nickname || f.firstName || "fighter";
    }
    const tpl = verifyEmailTemplate({ fighterName, verifyUrl });
    // Verification IS the security-critical email here — always send, regardless
    // of the notifications toggle. Without it the account can't recover.
    await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html });
    return { sent: true };
}

async function resendEmailVerification(accountId) {
    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    if (user.emailConfirmed) {
        const err = new Error("Email already verified");
        err.code = "already_verified";
        throw err;
    }

    // 60-second cooldown — same pattern as email-change resend.
    const lastSent = user.emailVerifyLastSentAt ? user.emailVerifyLastSentAt.getTime() : 0;
    const elapsed  = Date.now() - lastSent;
    if (lastSent && elapsed < EMAIL_RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((EMAIL_RESEND_COOLDOWN_MS - elapsed) / 1000);
        const err = new Error(`Please wait ${retryAfter}s before requesting another link`);
        err.code = "cooldown_active";
        err.retryAfter = retryAfter;
        throw err;
    }
    return sendVerifyEmail(user);
}

/**
 * Apply a verification token. Hit publicly from the email link — looks up the
 * (hashed) token, validates expiry, flips `emailConfirmed = true`, clears the
 * token state. Throws coded errors so the controller can pick a redirect path.
 */
async function confirmEmailVerification(rawToken) {
    if (!rawToken || typeof rawToken !== "string") {
        const err = new Error("Invalid token");
        err.code = "invalid_token";
        throw err;
    }
    const hashed = hashToken(rawToken);
    const user = await User.findOne({ emailVerifyToken: hashed, deleted: { $ne: true } });
    if (!user) {
        // Either the token never existed, OR the user already verified (which
        // clears the token). Distinguish via a second lookup so we can show a
        // friendlier message in the already-verified case.
        const err = new Error("Invalid or already-used token");
        err.code = "invalid_token";
        throw err;
    }
    if (!user.emailVerifyExpires || user.emailVerifyExpires.getTime() < Date.now()) {
        user.emailVerifyToken = null;
        user.emailVerifyExpires = null;
        await user.save();
        const err = new Error("Verification link expired");
        err.code = "expired";
        throw err;
    }
    user.emailConfirmed = true;
    user.emailVerifyToken = null;
    user.emailVerifyExpires = null;
    user.emailVerifyLastSentAt = null;
    await user.save();
    return { email: user.email };
}

async function cancelEmailChange(accountId) {
    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    user.emailPending = null;
    user.emailChangeToken = null;
    user.emailChangeExpires = null;
    user.emailChangeLastSentAt = null;
    await user.save();
    return { cancelled: true };
}

// ──────────────────────────────────────────────────────────────────
// Password — logged-in change
// ──────────────────────────────────────────────────────────────────

function validateNewPassword(pw) {
    if (typeof pw !== "string" || pw.length < PASSWORD_MIN) {
        throw new Error(`Password must be at least ${PASSWORD_MIN} characters`);
    }
    if (!PASSWORD_NUMBER_RE.test(pw)) {
        throw new Error("Password must contain at least one number");
    }
}

async function changePassword(accountId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) throw new Error("Both passwords are required");
    validateNewPassword(newPassword);

    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
        const err = new Error("Current password is incorrect");
        err.code = "incorrect_password";
        throw err;
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    // Bump session epoch — invalidates every JWT issued before now. The current
    // request's caller should be given a fresh token by the controller.
    user.sessionEpoch = (user.sessionEpoch || 1) + 1;
    await user.save();
    return { sessionEpoch: user.sessionEpoch };
}

// ──────────────────────────────────────────────────────────────────
// Password — forgot/reset
// ──────────────────────────────────────────────────────────────────

async function requestPasswordReset(emailRaw) {
    // Always return success regardless of whether the email exists (security
    // best practice — never confirm account existence to unauthenticated callers).
    if (typeof emailRaw !== "string") return { success: true };
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { success: true };

    const user = await User.findOne({ email, deleted: { $ne: true } });
    if (!user) return { success: true };

    const raw = generateRawToken();
    user.passwordResetToken   = hashToken(raw);
    user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await user.save();

    const resetUrl = `${APP_URL}/?reset_password_token=${encodeURIComponent(raw)}`;
    let fighterName = "fighter";
    if (user.fighterId) {
        const f = await Fighter.findById(user.fighterId).select("firstName nickname").lean();
        if (f) fighterName = f.nickname || f.firstName || "fighter";
    }
    const tpl = passwordResetTemplate({ fighterName, resetUrl });
    // Password reset is security-critical — ALWAYS sent regardless of notifications toggle.
    await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html });
    return { success: true };
}

async function validateResetToken(rawToken) {
    if (!rawToken || typeof rawToken !== "string") return { valid: false, expired: false };
    const hashed = hashToken(rawToken);
    const user = await User.findOne({ passwordResetToken: hashed, deleted: { $ne: true } });
    if (!user) return { valid: false, expired: false };
    if (!user.passwordResetExpires || user.passwordResetExpires.getTime() < Date.now()) {
        return { valid: false, expired: true };
    }
    return { valid: true, expired: false };
}

async function applyPasswordReset(rawToken, newPassword) {
    if (!rawToken) throw new Error("Token required");
    validateNewPassword(newPassword);
    const hashed = hashToken(rawToken);
    const user = await User.findOne({ passwordResetToken: hashed, deleted: { $ne: true } });
    if (!user) throw new Error("Invalid token");
    if (!user.passwordResetExpires || user.passwordResetExpires.getTime() < Date.now()) {
        user.passwordResetToken = null;
        user.passwordResetExpires = null;
        await user.save();
        const err = new Error("Link expired");
        err.code = "expired";
        throw err;
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.sessionEpoch = (user.sessionEpoch || 1) + 1; // invalidate all sessions
    await user.save();
    return { success: true };
}

// ──────────────────────────────────────────────────────────────────
// Soft delete
// ──────────────────────────────────────────────────────────────────

async function deleteAccount(accountId, typedFighterName) {
    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    if (!user.fighterId) throw new Error("No fighter linked to this account");

    const fighter = await Fighter.findById(user.fighterId).select("firstName lastName nickname");
    if (!fighter) throw new Error("Fighter not found");
    const fullName = `${fighter.firstName} ${fighter.lastName}`.trim();

    // Server-side validation of the typed name — case-sensitive, exact match.
    if (typedFighterName !== fullName) {
        const err = new Error("Confirmation name does not match");
        err.code = "name_mismatch";
        throw err;
    }

    user.deleted = true;
    user.deletionRequestedAt = new Date();
    user.sessionEpoch = (user.sessionEpoch || 1) + 1; // invalidate all sessions
    await user.save();

    // Deletion confirmation is security/legal — always sent regardless of notifications.
    const tpl = accountDeletedTemplate({ fighterName: fighter.nickname || fighter.firstName });
    await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html });

    return { deleted: true };
}

/**
 * Daily hard-delete sweep. Permanently removes any account that was soft-deleted
 * more than HARD_DELETE_GRACE_MS ago, along with its linked fighter document.
 * Returns the number of accounts purged. Wired into the BullMQ scheduler.
 */
async function runHardDeleteSweep() {
    const cutoff = new Date(Date.now() - HARD_DELETE_GRACE_MS);
    const candidates = await User.find({
        deleted: true,
        deletionRequestedAt: { $lte: cutoff },
    }).select("_id fighterId");
    let purged = 0;
    for (const u of candidates) {
        try {
            if (u.fighterId) {
                await Fighter.deleteOne({ _id: u.fighterId });
            }
            await User.deleteOne({ _id: u._id });
            purged += 1;
        } catch (e) {
            console.error("[accountService] hard-delete failed for", u._id, e.message);
        }
    }
    return { purged };
}

module.exports = {
    getAccountProfile,
    changeNickname,
    setEmailNotifications,
    requestEmailChange,
    confirmEmailChange,
    resendEmailChange,
    cancelEmailChange,
    sendVerifyEmail,
    resendEmailVerification,
    confirmEmailVerification,
    changePassword,
    requestPasswordReset,
    validateResetToken,
    applyPasswordReset,
    deleteAccount,
    runHardDeleteSweep,
    // Exported for tests / inspection
    hashToken,
    HARD_DELETE_GRACE_MS,
};
