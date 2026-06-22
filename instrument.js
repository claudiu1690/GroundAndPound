/**
 * Sentry initialization — MUST be required at the very top of app.js, before any
 * other module (so the SDK can auto-instrument them).
 *
 * No-ops cleanly when SENTRY_DSN is unset: the app runs identically with no
 * monitoring, so local dev and pre-signup deploys are unaffected. Set SENTRY_DSN
 * (Railway → Variables, or .env locally) to turn it on — works with Sentry's free
 * tier or any Sentry-API-compatible backend (e.g. GlitchTip) via the same DSN.
 */
const Sentry = require("@sentry/node");

const dsn = process.env.SENTRY_DSN;
if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || "development",
        // Errors only — no performance transactions (keeps us inside free quotas).
        tracesSampleRate: 0,
    });
    console.log("[Sentry] Error monitoring enabled.");
} else {
    console.log("[Sentry] SENTRY_DSN not set — error monitoring disabled.");
}

module.exports = Sentry;
