const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/userModel");

/**
 * Auth middleware.
 *
 * Beyond JWT signature/expiry checks, we revalidate against the live User doc
 * on every request:
 *  - sessionEpoch must match — a password change / reset / account deletion
 *    bumps this, invalidating all outstanding tokens.
 *  - deleted=false — soft-deleted accounts can't make authenticated requests
 *    even with a still-valid JWT.
 *
 * Adds one Mongo lookup per request. Acceptable at this scale; revisit with a
 * short-TTL Redis cache if it ever becomes a bottleneck.
 */
async function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized — no token provided" });
    }
    const token = header.slice(7);
    let payload;
    try {
        payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
    try {
        const user = await User.findById(payload.id).select("sessionEpoch deleted fighterId email").lean();
        if (!user || user.deleted) {
            return res.status(401).json({ message: "Account no longer accessible", code: "account_deleted" });
        }
        const expectedEpoch = user.sessionEpoch || 1;
        const tokenEpoch = payload.epoch || 1;
        if (tokenEpoch !== expectedEpoch) {
            // Token was minted before a password change / reset — force re-login.
            return res.status(401).json({ message: "Session expired", code: "session_revoked" });
        }
        req.user = { ...payload, fighterId: user.fighterId, email: user.email };
        next();
    } catch (err) {
        console.error("authMiddleware error:", err);
        return res.status(500).json({ message: "Auth check failed" });
    }
}

module.exports = authMiddleware;
