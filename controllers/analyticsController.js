const analyticsService = require("../services/analyticsService");

/**
 * GET /admin/analytics/retention?from=&to=
 * Admin-only (mounted behind authMiddleware + adminMiddleware).
 *
 * `from`/`to` are optional ISO dates. When omitted the service defaults `to` to
 * now and `from` to the earliest signup. If both are supplied and inverted, 400.
 */
async function getRetention(req, res) {
    try {
        const { from: fromRaw, to: toRaw } = req.query;

        const from = fromRaw !== undefined ? new Date(fromRaw) : undefined;
        const to = toRaw !== undefined ? new Date(toRaw) : undefined;

        if (from !== undefined && isNaN(from.getTime())) {
            return res.status(400).json({ message: "Invalid date range" });
        }
        if (to !== undefined && isNaN(to.getTime())) {
            return res.status(400).json({ message: "Invalid date range" });
        }
        if (from !== undefined && to !== undefined && from > to) {
            return res.status(400).json({ message: "Invalid date range" });
        }

        const report = await analyticsService.computeRetention(from, to);
        return res.status(200).json(report);
    } catch (err) {
        console.error("[analytics] getRetention failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getRetention };
