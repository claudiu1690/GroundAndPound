const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const fighterService = require("../services/fighterService");
const accountService = require("../services/accountService");
const analyticsService = require("../services/analyticsService");
const config = require("../config");

/**
 * Sign a fresh JWT. Includes `epoch` so a password change can invalidate every
 * outstanding session by bumping User.sessionEpoch — the middleware rejects
 * any token whose epoch is stale relative to the live DB value.
 */
function signToken(user, opts = {}) {
    return jwt.sign(
        {
            id: user._id,
            email: user.email || null,
            fighterId: user.fighterId,
            epoch: user.sessionEpoch || 1,
            guest: !!opts.guest,
        },
        config.jwtSecret,
        { expiresIn: opts.guest ? config.guestJwtExpiresIn : config.jwtExpiresIn }
    );
}
// Exposed so accountController can mint a fresh token after a same-session password change.
module.exports.signToken = signToken;

async function register(req, res) {
    try {
        const { email, password, fighter } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: "Email and password are required" });
        if (password.length < 6)
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        if (!fighter?.firstName || !fighter?.lastName || !fighter?.weightClass || !fighter?.style)
            return res.status(400).json({ message: "Fighter first name, last name, weight class, and style are required" });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing)
            return res.status(409).json({ message: "An account with this email already exists" });

        const passwordHash = await bcrypt.hash(password, 10);
        // New signups start UNVERIFIED. The schema default is `true` so legacy
        // accounts stay grandfathered; here we explicitly opt-in to verification
        // for fresh accounts.
        const user = await User.create({ email, passwordHash, emailConfirmed: false });

        // Create the fighter linked to this account
        const newFighter = await fighterService.createFighter({ ...fighter, userId: user._id });
        user.fighterId = newFighter._id;
        await user.save();

        // Fire-and-forget the verification email. We don't block registration
        // on the send — soft verification lets the user play right away, and
        // the in-app banner reminds them to confirm. If the email actually
        // fails to send, the user can hit "Resend" from the banner.
        accountService.sendVerifyEmail(user).catch((err) => {
            console.error("[register] sendVerifyEmail failed:", err.message);
        });

        // Fire-and-forget analytics — never blocks or breaks registration.
        analyticsService.track(user._id, "signup", {}, { fighterId: newFighter._id });

        const token = signToken(user);
        res.status(201).json({ token, fighterId: newFighter._id });
    } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ message: err.message || "Internal server error" });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: "Email and password are required" });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user)
            return res.status(401).json({ message: "Invalid email or password" });

        // Soft-deleted accounts: spec-mandated specific copy that hints at the
        // 30-day recovery window. Different from a generic invalid-credentials
        // error so the player understands they can still recover the account.
        if (user.deleted) {
            // Tell the client whether the grace window is still open so the UI
            // can show a "Recover account" button vs a terminal message.
            const requestedAt = user.deletionRequestedAt ? new Date(user.deletionRequestedAt).getTime() : 0;
            const elapsed = requestedAt ? Date.now() - requestedAt : Infinity;
            const recoverable = elapsed <= HARD_DELETE_GRACE_MS;
            const daysLeft = recoverable ? Math.max(1, Math.ceil((HARD_DELETE_GRACE_MS - elapsed) / (24 * 60 * 60 * 1000))) : 0;
            return res.status(403).json({
                message: recoverable
                    ? `This account is scheduled for deletion. You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to recover it.`
                    : "This account has been deleted and the 30-day recovery window has passed.",
                code: recoverable ? "account_deleted" : "account_deleted_expired",
                recoverable,
                daysLeft,
            });
        }

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match)
            return res.status(401).json({ message: "Invalid email or password" });

        const token = signToken(user);
        res.json({ token, fighterId: user.fighterId });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

// ──────────────────────────────────────────────────────────────────
// Guest lane — create / resume (unauthenticated)
// ──────────────────────────────────────────────────────────────────

/**
 * Create an anonymous guest account + fighter. Fighter fields run the same
 * validation + profanity gate as register step-2 (inside fighterService). The
 * recovery code is returned exactly once here and never again.
 */
async function createGuest(req, res) {
    try {
        const { fighter } = req.body || {};
        if (!fighter || typeof fighter !== "object") {
            return res.status(400).json({ message: "Fighter details are required" });
        }
        // Mirror register's required-field gate so we fail fast with a clear 400
        // before touching the DB.
        if (!fighter.firstName || !fighter.lastName || !fighter.weightClass || !fighter.style) {
            return res.status(400).json({
                message: "Fighter first name, last name, weight class, and style are required",
            });
        }

        const { user, fighter: newFighter, recoveryCode } =
            await accountService.createGuestAccount({ fighter });

        // Fire-and-forget analytics — never blocks or breaks guest creation.
        analyticsService.track(user._id, "guest_signup", {}, { fighterId: newFighter._id });

        const token = signToken(user, { guest: true });
        return res.status(201).json({
            token,
            fighterId: String(newFighter._id),
            accountId: String(user._id),
            recoveryCode,
        });
    } catch (err) {
        // Client-fixable errors from fighterService — profanity uses the codebase's
        // { statusCode:400, validation:true } convention; the required-field guard
        // throws a plain "... are required" Error. Both are safe to echo as a 400.
        const msg = err && err.message ? err.message : "";
        if (err && (err.statusCode === 400 || err.validation) ) {
            return res.status(400).json({ message: msg || "Invalid fighter details" });
        }
        if (/required|weight class|style|First name|Last name|Nickname/i.test(msg)) {
            return res.status(400).json({ message: msg });
        }
        console.error("createGuest error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

// Per-IP Redis rate limit on guest resume (~10/hour). Falls open on a Redis
// outage — same posture as the forgot-password limiter. Generic 401 on miss keeps
// the endpoint from becoming an existence oracle.
const GUEST_RESUME_MAX = Number(process.env.GUEST_RESUME_RATE_LIMIT_MAX) || 10;
const GUEST_RESUME_WINDOW_SEC = 60 * 60; // 1 hour
async function checkGuestResumeRateLimit(ip) {
    try {
        const { redis, ensureRedisConnected } = require("../lib/redis");
        await ensureRedisConnected();
        const key = `guestresume:rate:${ip}`;
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, GUEST_RESUME_WINDOW_SEC);
        return count <= GUEST_RESUME_MAX;
    } catch (e) {
        console.warn("[guest-resume] rate limit unavailable, allowing:", e.message);
        return true;
    }
}

/**
 * Resume a guest account from a one-time recovery code. Generic 401 on any miss
 * (never reveals whether a code exists). No sessionEpoch bump — resuming on a new
 * device leaves the original device logged in.
 */
async function resumeGuest(req, res) {
    try {
        const { recoveryCode } = req.body || {};
        if (typeof recoveryCode !== "string" || !recoveryCode.trim()) {
            return res.status(400).json({ message: "Recovery code is required" });
        }

        const allowed = await checkGuestResumeRateLimit(req.ip);
        if (!allowed) {
            return res.status(429).json({
                message: "Too many attempts — please wait and try again.",
                code: "rate_limited",
            });
        }

        const user = await accountService.resumeByRecoveryCode(recoveryCode);
        if (!user) {
            return res.status(401).json({ message: "Invalid recovery code", code: "invalid_code" });
        }

        const token = signToken(user, { guest: true });
        return res.json({
            token,
            fighterId: String(user.fighterId),
            accountId: String(user._id),
        });
    } catch (err) {
        console.error("resumeGuest error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

// ──────────────────────────────────────────────────────────────────
// Forgot password (unauthenticated)
// ──────────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SEC = 60 * 60; // 1 hour
// Redis-based rate limit on forgot-password by email. Falls back to a no-op
// when Redis is unavailable (we'd rather accept the request than fail open
// for an outage on a security-noise endpoint).
async function checkAndIncrementRateLimit(emailLower) {
    try {
        const { redis, ensureRedisConnected } = require("../lib/redis");
        await ensureRedisConnected();
        const key = `pwreset:rate:${emailLower}`;
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
        return count <= RATE_LIMIT_MAX;
    } catch (e) {
        console.warn("[forgot-password] rate limit unavailable, allowing:", e.message);
        return true;
    }
}

async function forgotPassword(req, res) {
    try {
        const { email } = req.body || {};
        // Always pretend it worked, even on rate-limit reject or bad email —
        // never confirm or deny account existence to unauthenticated callers.
        if (typeof email === "string" && email.trim()) {
            const allowed = await checkAndIncrementRateLimit(email.trim().toLowerCase());
            if (allowed) {
                await accountService.requestPasswordReset(email);
            }
        }
        res.json({ success: true });
    } catch (err) {
        // Don't leak the error to the client — same opaque response.
        console.error("forgotPassword error:", err);
        res.json({ success: true });
    }
}

async function checkResetToken(req, res) {
    try {
        const { token } = req.query;
        const result = await accountService.validateResetToken(token);
        res.json(result);
    } catch (err) {
        console.error("checkResetToken error:", err);
        res.json({ valid: false, expired: false });
    }
}

async function resetPassword(req, res) {
    try {
        const { token, new_password: newPassword } = req.body || {};
        if (!token) return res.status(400).json({ error: "Token required" });
        await accountService.applyPasswordReset(token, newPassword);
        res.json({ success: true });
    } catch (err) {
        if (err.code === "expired") return res.status(400).json({ error: "Link expired" });
        if (err.message === "Invalid token") return res.status(400).json({ error: "Invalid token" });
        if (/^Password /.test(err.message || "")) return res.status(400).json({ error: err.message });
        console.error("resetPassword error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function logout(req, res) {
    // Stateless JWT — nothing to invalidate server-side unless we bump the
    // epoch, which would log out every device (we don't want that for a
    // simple logout). The client just discards the token.
    res.json({ success: true });
}

// ──────────────────────────────────────────────────────────────────
// Account recovery (soft-delete undo, within the 30-day grace window)
// ──────────────────────────────────────────────────────────────────

const HARD_DELETE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Restore a soft-deleted account if the user can still authenticate AND we're
 * inside the 30-day grace window. Bumps sessionEpoch so any old tokens (the
 * ones that existed before the deletion request) are revoked, then issues a
 * fresh JWT — same response shape as login so the client can hand off without
 * a separate sign-in step.
 *
 * Error codes returned to the client:
 *   not_deleted    — account exists and isn't deleted; just log in normally
 *   grace_expired  — past the 30-day window; account is gone or about to be
 *   invalid        — wrong email/password (generic — same shape as login)
 */
async function recoverAccount(req, res) {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required", code: "invalid" });
        }

        const user = await User.findOne({ email: String(email).toLowerCase() });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password", code: "invalid" });
        }

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            return res.status(401).json({ message: "Invalid email or password", code: "invalid" });
        }

        if (!user.deleted) {
            // Live account — caller should just log in normally. Don't auto-issue
            // a token here; that'd be a free login path that bypasses the
            // soft-delete branch in `login`. Force them through the standard form.
            return res.status(400).json({
                message: "This account isn't deleted — log in normally.",
                code: "not_deleted",
            });
        }

        // Past the grace window? The daily sweep may not have purged the doc
        // yet, but we refuse to restore it because the data is forfeit.
        const requestedAt = user.deletionRequestedAt ? new Date(user.deletionRequestedAt).getTime() : 0;
        if (!requestedAt || Date.now() - requestedAt > HARD_DELETE_GRACE_MS) {
            return res.status(410).json({
                message: "This account is past the 30-day recovery window and can no longer be restored.",
                code: "grace_expired",
            });
        }

        // Restore — clear the deletion flags and rotate the session epoch so
        // any pre-deletion JWTs are invalidated. The fresh token we return is
        // the only valid session going forward.
        user.deleted = false;
        user.deletionRequestedAt = null;
        user.sessionEpoch = (user.sessionEpoch || 1) + 1;
        await user.save();

        const token = signToken(user);
        res.json({
            success: true,
            token,
            fighterId: user.fighterId,
            message: "Welcome back — your account has been restored.",
        });
    } catch (err) {
        console.error("recoverAccount error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

// ──────────────────────────────────────────────────────────────────
// Email verification (public — hit from the email link, no JWT)
// ──────────────────────────────────────────────────────────────────

/**
 * Apply a verification token and bounce the user back to the frontend with a
 * status query param. Same redirect pattern as /account/email/confirm so the
 * frontend's URL-param handling stays uniform.
 */
async function verifyEmail(req, res) {
    const { APP_URL } = require("../lib/email");
    const { token } = req.query;
    try {
        await accountService.confirmEmailVerification(token);
        return res.redirect(`${APP_URL}/?email_verified=true`);
    } catch (err) {
        const code = err.code || "invalid_token";
        return res.redirect(`${APP_URL}/?email_verify_error=${encodeURIComponent(code)}`);
    }
}

module.exports = {
    register, login, forgotPassword, checkResetToken, resetPassword,
    logout, recoverAccount, verifyEmail, signToken,
    createGuest, resumeGuest,
};
