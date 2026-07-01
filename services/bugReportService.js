const BugReport = require("../models/bugReportModel");
const { sendEmail, bugReportNotificationTemplate } = require("../lib/email");

const CATEGORIES = ["gameplay", "ui_display", "account_payments", "other"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 2000;
const EMAIL_MAX = 254;
const URL_MAX = 500;
const UA_MAX = 500;

/**
 * Tagged 400 error the global error handler (and the controller) knows how to
 * expose to the client without leaking internals.
 */
function badRequest(code, message) {
    const err = new Error(message);
    err.statusCode = 400;
    err.expose = true;
    err.code = code;
    return err;
}

function truncate(value, max) {
    if (value == null) return null;
    const str = String(value);
    return str.length > max ? str.slice(0, max) : str;
}

/**
 * Create a bug report. Validates hostile input, persists the report FIRST, then
 * best-effort emails an ops notification (a failed email never fails the request).
 *
 * @param {Object}  params
 * @param {string}  params.category
 * @param {string}  params.description
 * @param {string} [params.email]      body email — required & used only when anonymous
 * @param {string} [params.pageUrl]
 * @param {string} [params.userAgent]
 * @param {{accountId:string, fighterId:string, email:string}|null} params.identity
 * @returns {Promise<{reportId:string}>}
 */
async function createBugReport({ category, description, email, pageUrl, userAgent, identity }) {
    // 1. Validate every field.
    if (!CATEGORIES.includes(category)) {
        throw badRequest("bad_category", "Invalid bug category.");
    }

    if (typeof description !== "string") {
        throw badRequest("bad_description", "Description is required.");
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length < DESCRIPTION_MIN || trimmedDescription.length > DESCRIPTION_MAX) {
        throw badRequest(
            "bad_description",
            `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`
        );
    }

    let validatedBodyEmail = null;
    if (!identity) {
        // Anonymous submissions must carry a contact email.
        if (typeof email !== "string") {
            throw badRequest("bad_email", "A valid email is required.");
        }
        const trimmedEmail = email.trim();
        if (!EMAIL_RE.test(trimmedEmail) || trimmedEmail.length > EMAIL_MAX) {
            throw badRequest("bad_email", "A valid email is required.");
        }
        validatedBodyEmail = trimmedEmail;
    }
    // When identity is present, any body email is ignored entirely.

    const safePageUrl   = truncate(pageUrl, URL_MAX);
    const safeUserAgent = truncate(userAgent, UA_MAX);

    // 2. Resolve reporter email — logged-in identity wins over any body value.
    const reporterEmail = identity?.email ?? validatedBodyEmail;

    // 3. Persist — after this point the report is safe regardless of email.
    const doc = new BugReport({
        category,
        description: trimmedDescription,
        reporterEmail: reporterEmail || null,
        fighterId: identity?.fighterId || null,
        accountId: identity?.accountId || null,
        pageUrl: safePageUrl,
        userAgent: safeUserAgent,
    });
    await doc.save();

    // 4. Best-effort notification. NEVER fail the request on email trouble.
    try {
        const to = process.env.BUG_REPORT_EMAIL || process.env.EMAIL_FROM;
        const { subject, html } = bugReportNotificationTemplate({
            category,
            description: trimmedDescription,
            reporterEmail: reporterEmail || null,
            fighterId: identity?.fighterId || null,
            accountId: identity?.accountId || null,
            pageUrl: safePageUrl,
            userAgent: safeUserAgent,
            createdAt: doc.createdAt,
        });
        await sendEmail({ to, subject, html });
    } catch (err) {
        console.error("[bugReport] notification email failed (report is saved):", err.message);
    }

    // 5. Done.
    return { reportId: doc._id.toString() };
}

module.exports = { createBugReport };
