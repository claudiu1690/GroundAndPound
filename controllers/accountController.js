const User = require("../models/userModel");
const accountService = require("../services/accountService");
const { signToken } = require("./authController");

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Ensure the caller is the same account they're acting on. */
function requireSelf(req, res) {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ message: "Account id required" });
        return null;
    }
    if (String(req.user?.id) !== String(id)) {
        res.status(403).json({ message: "Forbidden — you can only modify your own account" });
        return null;
    }
    return id;
}

function clientError(res, err, fallback = "Bad request") {
    return res.status(400).json({ message: err?.message || fallback, code: err?.code });
}

// ──────────────────────────────────────────────────────────────────
// Profile
// ──────────────────────────────────────────────────────────────────

async function getProfile(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        const profile = await accountService.getAccountProfile(id);
        res.json(profile);
    } catch (err) {
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

// ──────────────────────────────────────────────────────────────────
// Nickname
// ──────────────────────────────────────────────────────────────────

async function patchNickname(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        const { nickname } = req.body || {};
        const result = await accountService.changeNickname(id, nickname);
        res.json({ success: true, ...result });
    } catch (err) {
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        return clientError(res, err);
    }
}

// ──────────────────────────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────────────────────────

async function patchNotifications(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        const { email_enabled: emailEnabled } = req.body || {};
        if (typeof emailEnabled !== "boolean") {
            return res.status(400).json({ message: "email_enabled must be a boolean" });
        }
        const result = await accountService.setEmailNotifications(id, emailEnabled);
        res.json({ success: true, email_enabled: result.emailEnabled });
    } catch (err) {
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        return clientError(res, err);
    }
}

// ──────────────────────────────────────────────────────────────────
// Email change
// ──────────────────────────────────────────────────────────────────

async function requestEmailChange(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        const { new_email: newEmail } = req.body || {};
        await accountService.requestEmailChange(id, newEmail);
        res.json({ success: true });
    } catch (err) {
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        return clientError(res, err);
    }
}

async function resendEmailChange(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        await accountService.resendEmailChange(id);
        res.json({ success: true });
    } catch (err) {
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        // Cooldown response — surface `retryAfter` (seconds) so the client can
        // arm its countdown without guessing. 429 is the standard rate-limit code.
        if (err.code === "cooldown_active") {
            return res.status(429).json({
                message: err.message,
                code: err.code,
                retryAfter: err.retryAfter,
            });
        }
        return clientError(res, err);
    }
}

/**
 * Resend the email-verification link. Same 60s cooldown contract as the
 * email-change resend — service throws `cooldown_active` with `retryAfter`
 * which we forward as 429.
 */
async function resendVerifyEmail(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        await accountService.resendEmailVerification(id);
        res.json({ success: true });
    } catch (err) {
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        if (err.code === "cooldown_active") {
            return res.status(429).json({
                message: err.message,
                code: err.code,
                retryAfter: err.retryAfter,
            });
        }
        if (err.code === "already_verified") {
            return res.status(400).json({ message: err.message, code: err.code });
        }
        return clientError(res, err);
    }
}

async function cancelEmailChange(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        await accountService.cancelEmailChange(id);
        res.json({ success: true });
    } catch (err) {
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        return clientError(res, err);
    }
}

/**
 * Public endpoint — called from the email confirm link. Redirects back to the
 * frontend with a status query param. Spec wants this so the link works without
 * being authenticated.
 */
async function confirmEmailChange(req, res) {
    const { APP_URL } = require("../lib/email");
    const { token } = req.query;
    try {
        await accountService.confirmEmailChange(token);
        return res.redirect(`${APP_URL}/?email_updated=true`);
    } catch (err) {
        const code = err.code || "invalid_token";
        return res.redirect(`${APP_URL}/?email_update_error=${encodeURIComponent(code)}`);
    }
}

// ──────────────────────────────────────────────────────────────────
// Password (logged-in)
// ──────────────────────────────────────────────────────────────────

async function changePassword(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        const { current_password: currentPassword, new_password: newPassword } = req.body || {};
        const result = await accountService.changePassword(id, currentPassword, newPassword);

        // Bumped the epoch — the caller's existing token is now invalid. Mint a
        // fresh one so they stay logged in on the device they just used.
        const user = await User.findById(id);
        const freshToken = signToken(user);
        res.json({ success: true, token: freshToken, sessionEpoch: result.sessionEpoch });
    } catch (err) {
        if (err.code === "incorrect_password") {
            return res.status(401).json({ error: "incorrect_password", message: err.message });
        }
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        return clientError(res, err);
    }
}

// ──────────────────────────────────────────────────────────────────
// Delete
// ──────────────────────────────────────────────────────────────────

async function deleteAccount(req, res) {
    try {
        const id = requireSelf(req, res); if (!id) return;
        const { fighter_name: fighterName } = req.body || {};
        await accountService.deleteAccount(id, fighterName);
        res.json({ success: true });
    } catch (err) {
        if (err.code === "name_mismatch") {
            return res.status(400).json({ message: err.message, code: err.code });
        }
        if (err.message === "Account not found") return res.status(404).json({ message: err.message });
        console.error("deleteAccount error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = {
    getProfile,
    patchNickname,
    patchNotifications,
    requestEmailChange,
    resendEmailChange,
    resendVerifyEmail,
    cancelEmailChange,
    confirmEmailChange,
    changePassword,
    deleteAccount,
};
