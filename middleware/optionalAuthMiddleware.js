const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/userModel");

/**
 * Optional (soft) auth middleware.
 *
 * Mirrors authMiddleware's validation — JWT verify + live-User revalidation
 * (sessionEpoch match, not deleted) — but NEVER 401s. On any failure (missing
 * header, bad/expired token, epoch mismatch, deleted/missing account) it simply
 * calls next() with req.user left UNSET. On success it sets req.user to the exact
 * same shape authMiddleware produces (payload spread + live fighterId + email).
 *
 * Used by public endpoints that want to attach identity when present but must
 * keep working for logged-out callers. Never throws to the client.
 */
async function optionalAuthMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return next();
    }
    const token = header.slice(7);
    let payload;
    try {
        payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
        return next();
    }
    try {
        const user = await User.findById(payload.id).select("sessionEpoch deleted fighterId email").lean();
        if (!user || user.deleted) {
            return next();
        }
        const expectedEpoch = user.sessionEpoch || 1;
        const tokenEpoch = payload.epoch || 1;
        if (tokenEpoch !== expectedEpoch) {
            // Token minted before a password change / reset — treat as anonymous.
            return next();
        }
        req.user = { ...payload, fighterId: user.fighterId, email: user.email };
        return next();
    } catch (err) {
        // Never surface an auth-lookup error on a public endpoint — log and
        // continue as anonymous.
        console.error("optionalAuthMiddleware error:", err);
        return next();
    }
}

module.exports = optionalAuthMiddleware;
