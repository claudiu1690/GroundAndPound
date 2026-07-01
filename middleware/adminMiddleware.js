/**
 * Admin gate for internal analytics endpoints. Runs AFTER authMiddleware, which
 * populates `req.user` with `{ ...jwtPayload, fighterId, email }` — we authorize
 * on the live `email` field.
 *
 * Allowlist comes from ANALYTICS_ADMIN_EMAILS (comma-separated). Empty/unset =>
 * nobody is admin (fails closed).
 */
module.exports = function adminMiddleware(req, res, next) {
    const allowlist = (process.env.ANALYTICS_ADMIN_EMAILS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (!req.user?.email || !allowlist.includes(req.user.email)) {
        return res.status(403).json({ message: "Forbidden" });
    }
    next();
};
