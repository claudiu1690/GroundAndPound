const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/userModel");

// Throttle window for the guest lastActiveAt stamp. We only write when the
// stored value is older than this, keeping an active guest's lastActiveAt at most
// ~6h stale — far inside the 30-day purge window — while avoiding a write on
// every request.
const GUEST_ACTIVE_STAMP_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Fire-and-forget stamp of lastActiveAt for an active guest. Never awaited by the
 * request path and never surfaces errors to the client — a failed stamp just means
 * the guest reads slightly staler on the next purge scan.
 */
function stampGuestActivity(user) {
    if (!user || user.isGuest !== true) return;
    const last = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
    if (Date.now() - last <= GUEST_ACTIVE_STAMP_THROTTLE_MS) return;
    User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch((e) => {
        console.error("[authMiddleware] guest lastActiveAt stamp failed:", e.message);
    });
}

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
        const user = await User.findById(payload.id).select("sessionEpoch deleted fighterId email isGuest lastActiveAt").lean();
        if (!user || user.deleted) {
            return res.status(401).json({ message: "Account no longer accessible", code: "account_deleted" });
        }
        const expectedEpoch = user.sessionEpoch || 1;
        const tokenEpoch = payload.epoch || 1;
        if (tokenEpoch !== expectedEpoch) {
            // Token was minted before a password change / reset — force re-login.
            return res.status(401).json({ message: "Session expired", code: "session_revoked" });
        }
        req.user = { ...payload, fighterId: user.fighterId, email: user.email, isGuest: user.isGuest === true };
        // Throttled activity stamp for guests — un-awaited so the request path is
        // unaffected. Drives the inactivity purge.
        stampGuestActivity(user);
        next();
    } catch (err) {
        console.error("authMiddleware error:", err);
        return res.status(500).json({ message: "Auth check failed" });
    }
}

module.exports = authMiddleware;
