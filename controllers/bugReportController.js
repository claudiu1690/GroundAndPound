const bugReportService = require("../services/bugReportService");

/**
 * POST /bug-reports — public, optional-auth. Persists a bug report, then
 * best-effort emails a notification. When a valid JWT is present (via
 * optionalAuthMiddleware), identity is attached to the report.
 *
 * req.user (set by authMiddleware/optionalAuthMiddleware) has shape:
 *   { ...jwtPayload, fighterId, email }  where jwtPayload.id is the account id.
 */
async function submitBugReport(req, res) {
    const identity = req.user
        ? { accountId: req.user.id, fighterId: req.user.fighterId, email: req.user.email }
        : null;

    try {
        const { category, description, email, pageUrl } = req.body || {};
        const { reportId } = await bugReportService.createBugReport({
            category,
            description,
            email,
            pageUrl,
            userAgent: req.headers["user-agent"],
            identity,
        });
        return res.status(201).json({ ok: true, reportId });
    } catch (err) {
        if (err.expose) {
            return res.status(err.statusCode || 400).json({ message: err.message, code: err.code });
        }
        console.error("[bugReport] submit failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { submitBugReport };
