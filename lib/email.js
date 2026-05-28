/**
 * Email — transactional email utility.
 *
 * Uses Resend when `RESEND_API_KEY` is set. When the key is missing, falls back
 * to logging the email content to console — the rest of the app still flows
 * (links work, success messages show), the email simply doesn't go out. Plug
 * the real key in via the host's env vars and emails start sending; no code
 * changes needed.
 *
 * Honours the user's notifications.emailEnabled preference for non-essential
 * emails. Security-critical mail (password reset, deletion confirmation) is
 * always sent regardless of the toggle.
 */

const FROM_DEFAULT = process.env.EMAIL_FROM || "Ground & Pound <noreply@example.com>";
const APP_URL = process.env.APP_URL || "http://localhost:5173";

let resendClient = null;
let resendLoaded = false;

function getResend() {
    if (resendLoaded) return resendClient;
    resendLoaded = true;
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    try {
        // Lazy-loaded so the dependency is optional until you're ready to wire
        // Resend up. If the package isn't installed yet, we just log instead.
        const { Resend } = require("resend");
        resendClient = new Resend(key);
        return resendClient;
    } catch (err) {
        console.warn("[email] Resend SDK not installed; falling back to console log.", err.message);
        return null;
    }
}

/**
 * Low-level send. Used directly only by security emails (which always go out).
 * Most callers should use sendAccountEmail() which respects the notifications
 * toggle.
 */
async function sendEmail({ to, subject, html, from }) {
    const client = getResend();
    if (!client) {
        // Dev / not-yet-configured fallback. Prints just enough to verify the
        // wiring without spamming the console with the full HTML.
        const preview = (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
        console.log(`[email:no-key] To: ${to}  Subject: "${subject}"`);
        console.log(`[email:no-key] Body preview: ${preview}…`);
        return { id: "console-only", consoleFallback: true };
    }
    return client.emails.send({
        from: from || FROM_DEFAULT,
        to,
        subject,
        html,
    });
}

/**
 * Send a non-essential ("account") email. Skipped silently when the user has
 * notifications.emailEnabled = false. Always pass the user document so we can
 * check the toggle without an extra DB hit.
 */
async function sendAccountEmail(user, { subject, html }) {
    if (user?.notifications?.emailEnabled === false) {
        return { id: null, skipped: true, reason: "notifications-disabled" };
    }
    return sendEmail({ to: user.email, subject, html });
}

// ──────────────────────────────────────────────────────────────────
// Templates — plain HTML, minimal styling. High deliverability.
// ──────────────────────────────────────────────────────────────────

function passwordResetTemplate({ fighterName, resetUrl }) {
    return {
        subject: "Reset your Ground & Pound password",
        html: `
            <p>Hi ${escapeHtml(fighterName || "fighter")},</p>
            <p>You requested a password reset for your Ground &amp; Pound account.</p>
            <p>Click the link below to set a new password:</p>
            <p><a href="${escapeAttr(resetUrl)}">${escapeAttr(resetUrl)}</a></p>
            <p>This link expires in 1 hour.</p>
            <p>If you didn't request this, ignore this email.</p>
            <p>— The Octagon Gazette</p>
        `.trim(),
    };
}

function emailChangeTemplate({ fighterName, confirmUrl }) {
    return {
        subject: "Confirm your new email address",
        html: `
            <p>Hi ${escapeHtml(fighterName || "fighter")},</p>
            <p>You requested to change your Ground &amp; Pound email to this address.</p>
            <p>Click below to confirm:</p>
            <p><a href="${escapeAttr(confirmUrl)}">${escapeAttr(confirmUrl)}</a></p>
            <p>This link expires in 24 hours.</p>
            <p>If you didn't request this, ignore this email.</p>
            <p>— The Octagon Gazette</p>
        `.trim(),
    };
}

function accountDeletedTemplate({ fighterName }) {
    return {
        subject: "Your Ground & Pound account has been deleted",
        html: `
            <p>Hi ${escapeHtml(fighterName || "fighter")},</p>
            <p>Your Ground &amp; Pound account and all associated data
            have been permanently deleted as requested.</p>
            <p>If this was a mistake, contact us at
            <a href="mailto:support@example.com">support@example.com</a>
            within 30 days and we may be able to recover your data.</p>
            <p>— The Octagon Gazette</p>
        `.trim(),
    };
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s) { return escapeHtml(s); }

module.exports = {
    sendEmail,
    sendAccountEmail,
    passwordResetTemplate,
    emailChangeTemplate,
    accountDeletedTemplate,
    APP_URL,
};
