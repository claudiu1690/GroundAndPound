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
    BACKEND_URL,
} = require("../lib/email");

const PASSWORD_RESET_TTL_MS    = 60 * 60 * 1000;        // 1 hour
const EMAIL_CHANGE_TTL_MS      = 24 * 60 * 60 * 1000;   // 24 hours
const EMAIL_VERIFY_TTL_MS      = 24 * 60 * 60 * 1000;   // 24 hours
const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;             // 60s between resends
const HARD_DELETE_GRACE_MS     = 30 * 24 * 60 * 60 * 1000; // 30 days
const GUEST_PURGE_INACTIVE_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days of inactivity
const RECOVERY_CODE_COOLDOWN_MS = 60 * 1000;               // 60s between reveals/regenerates
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
// Recovery code (guest-only, cross-device recovery credential)
// ──────────────────────────────────────────────────────────────────

// Crockford base32 alphabet, excluding I/L/O/U to avoid look-alike/rude chars.
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generate a raw recovery code: 80 bits of entropy → 16 Crockford-base32 chars,
 * formatted XXXX-XXXX-XXXX-XXXX. Returned to the user exactly once; only the
 * SHA-256 hash is ever persisted.
 */
function generateRecoveryCode() {
    const bytes = crypto.randomBytes(10); // 80 bits
    // Map the 80-bit buffer to 16 base32 symbols (5 bits each) via a big-int walk.
    let value = 0n;
    for (const b of bytes) value = (value << 8n) | BigInt(b);
    let chars = "";
    for (let i = 0; i < 16; i += 1) {
        const idx = Number(value & 31n); // low 5 bits
        chars = CROCKFORD_ALPHABET[idx] + chars;
        value >>= 5n;
    }
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

/**
 * Normalize a user-entered recovery code before hashing/lookup: uppercase and
 * strip everything that isn't an alphanumeric (dashes, spaces, etc.).
 */
function normalizeRecoveryCode(raw) {
    return String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

// ──────────────────────────────────────────────────────────────────
// Public profile
// ──────────────────────────────────────────────────────────────────

async function getAccountProfile(accountId) {
    const user = await User.findById(accountId).select(
        "email emailPending emailConfirmed emailChangeLastSentAt emailVerifyLastSentAt notifications deletionRequestedAt fighterId isGuest recoveryCodeHash"
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
        email: user.email || null,
        isGuest: user.isGuest === true,
        hasRecoveryCode: !!user.recoveryCodeHash,
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
    require("../utils/profanity").assertCleanName(trimmed, "Nickname");
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
    // Click-once link — must hit the BACKEND route /account/email/confirm,
    // which redirects to ${APP_URL}/?email_updated=true on success. APP_URL
    // would land on the SPA which doesn't have a handler for this token.
    const confirmUrl = `${BACKEND_URL.replace(/\/$/, "")}/account/email/confirm?token=${encodeURIComponent(raw)}`;
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

    // Click-once link — must hit the BACKEND route, which then redirects to
    // the frontend with ?email_verified=true. Using APP_URL here would land on
    // the SPA, which has no route for /auth/verify-email — the controller would
    // never run.
    const verifyUrl = `${BACKEND_URL.replace(/\/$/, "")}/auth/verify-email?token=${encodeURIComponent(raw)}`;
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

// ──────────────────────────────────────────────────────────────────
// Guest lane — create, claim, recovery-code, resume, purge
// ──────────────────────────────────────────────────────────────────

/**
 * Create an anonymous guest account + its fighter. The fighter runs the exact
 * same validation + profanity path as the email-first register step-2 (via
 * fighterService.createFighter). Returns the User, the created fighter, and the
 * raw recovery code — which the caller MUST surface exactly once and never store.
 *
 * `emailConfirmed: true` so a guest is never nagged by the verify banner; the
 * frontend shows the guest/claim banner instead (keyed off `isGuest`).
 */
async function createGuestAccount({ fighter } = {}) {
    if (!fighter || typeof fighter !== "object") {
        throw new Error("Fighter details are required");
    }

    // Create the User first so we have an _id to attach the fighter to. Guests
    // carry no credentials — email + passwordHash stay null.
    const user = await User.create({
        isGuest: true,
        email: null,
        passwordHash: null,
        emailConfirmed: true,
        lastActiveAt: new Date(),
    });

    let newFighter;
    try {
        // Lazy require to avoid a require-time cycle (fighterService pulls in a
        // large service graph). Same signature the register controller uses. This
        // throws on invalid fields or profanity — we clean up the orphan User
        // before rethrowing.
        const fighterService = require("./fighterService");
        newFighter = await fighterService.createFighter({ ...fighter, userId: user._id });
    } catch (err) {
        await User.deleteOne({ _id: user._id }).catch(() => {});
        throw err;
    }

    user.fighterId = newFighter._id;

    // Mint the recovery code — store only the hash, return the raw once.
    const rawCode = generateRecoveryCode();
    user.recoveryCodeHash = hashToken(normalizeRecoveryCode(rawCode));
    user.recoveryCodeCreatedAt = new Date();
    await user.save();

    return { user, fighter: newFighter, recoveryCode: rawCode };
}

/**
 * Claim a guest account by attaching an email + password. Validates the email
 * and password (validateNewPassword — min 8, ≥1 number), pre-checks uniqueness,
 * flips the account out of guest mode, clears the recovery code, and bumps
 * sessionEpoch (mirrors changePassword — securing the account logs out old
 * device tokens). Fires the verification email fire-and-forget.
 *
 * Coded errors: not_guest, invalid_email, weak_password, email_taken.
 */
async function claimAccount(accountId, emailRaw, password) {
    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");

    if (!user.isGuest) {
        const err = new Error("This account already has an email");
        err.code = "not_guest";
        throw err;
    }

    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) {
        const err = new Error("Invalid email format");
        err.code = "invalid_email";
        throw err;
    }

    // Password rules: reuse validateNewPassword but re-tag as weak_password so the
    // controller returns a stable code regardless of which rule failed.
    try {
        validateNewPassword(password);
    } catch (e) {
        const err = new Error(e.message || "Password too weak");
        err.code = "weak_password";
        throw err;
    }

    // Pre-check uniqueness against non-deleted accounts.
    const taken = await User.findOne({
        email,
        _id: { $ne: user._id },
        deleted: { $ne: true },
    }).select("_id").lean();
    if (taken) {
        const err = new Error("This email is already in use");
        err.code = "email_taken";
        throw err;
    }

    user.email = email;
    user.passwordHash = await bcrypt.hash(password, 10);
    user.emailConfirmed = false;      // must verify the newly-attached address
    user.isGuest = false;
    user.recoveryCodeHash = null;     // no lingering passwordless backdoor
    user.recoveryCodeCreatedAt = null;
    user.sessionEpoch = (user.sessionEpoch || 1) + 1; // invalidate old guest tokens

    try {
        await user.save();
    } catch (e) {
        // Duplicate-key race — someone claimed the same email between our
        // pre-check and save. Surface the same email_taken contract.
        if (e && e.code === 11000) {
            const err = new Error("This email is already in use");
            err.code = "email_taken";
            throw err;
        }
        throw e;
    }

    // Fire-and-forget the verification email — never block the claim on the send.
    sendVerifyEmail(user).catch((e) => {
        console.error("[claimAccount] sendVerifyEmail failed:", e.message);
    });

    return { user };
}

/**
 * Regenerate (a.k.a. "reveal") a guest's recovery code. Because only the hash is
 * stored, any reveal mints a fresh code and invalidates the old one. Guarded to
 * guests only, with an optional 60s cooldown to blunt spam.
 *
 * Coded errors: not_guest, cooldown_active (with retryAfter).
 */
async function regenerateRecoveryCode(accountId) {
    const user = await User.findById(accountId);
    if (!user || user.deleted) throw new Error("Account not found");
    if (!user.isGuest) {
        const err = new Error("Recovery codes are only for guest accounts");
        err.code = "not_guest";
        throw err;
    }

    const lastAt = user.recoveryCodeCreatedAt ? user.recoveryCodeCreatedAt.getTime() : 0;
    const elapsed = Date.now() - lastAt;
    if (lastAt && elapsed < RECOVERY_CODE_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RECOVERY_CODE_COOLDOWN_MS - elapsed) / 1000);
        const err = new Error(`Please wait ${retryAfter}s before generating another code`);
        err.code = "cooldown_active";
        err.retryAfter = retryAfter;
        throw err;
    }

    const rawCode = generateRecoveryCode();
    user.recoveryCodeHash = hashToken(normalizeRecoveryCode(rawCode));
    user.recoveryCodeCreatedAt = new Date();
    await user.save();
    return { recoveryCode: rawCode };
}

/**
 * Resume a guest account from a recovery code. Normalizes + hashes the input and
 * does a single indexed lookup — no per-account guessing oracle, and the caller
 * returns a generic 401 on miss so existence is never revealed. Stamps
 * lastActiveAt (keeps the account outside the purge window) but does NOT bump
 * sessionEpoch — resuming on device B must not log out device A.
 *
 * Returns the User on success, or null on any miss (bad/missing/unknown code).
 */
async function resumeByRecoveryCode(rawCode) {
    const normalized = normalizeRecoveryCode(rawCode);
    if (!normalized) return null;
    const hashed = hashToken(normalized);
    const user = await User.findOne({
        recoveryCodeHash: hashed,
        isGuest: true,
        deleted: { $ne: true },
    });
    if (!user) return null;
    user.lastActiveAt = new Date();
    await user.save();
    return user;
}

/**
 * Daily guest-purge sweep. Permanently removes unclaimed guest accounts (guests
 * that never attached an email) inactive for GUEST_PURGE_INACTIVE_MS, along with
 * their linked fighter. Separate from the soft-delete hard-delete sweep. Deletes
 * are per-candidate and wrapped in try/catch so one bad doc can't abort the batch.
 * Returns the number of accounts purged. Idempotent — safe to retry.
 */
async function runGuestPurgeSweep() {
    const cutoff = new Date(Date.now() - GUEST_PURGE_INACTIVE_MS);
    const candidates = await User.find({
        isGuest: true,
        email: null,
        deleted: { $ne: true },
        lastActiveAt: { $lte: cutoff },
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
            console.error("[accountService] guest purge failed for", String(u._id), e.message);
        }
    }
    return { purged };
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
    // Guest lane
    createGuestAccount,
    claimAccount,
    generateRecoveryCode,
    regenerateRecoveryCode,
    resumeByRecoveryCode,
    runGuestPurgeSweep,
    // Exported for tests / inspection
    hashToken,
    normalizeRecoveryCode,
    validateNewPassword,
    HARD_DELETE_GRACE_MS,
    GUEST_PURGE_INACTIVE_MS,
    RECOVERY_CODE_COOLDOWN_MS,
};
