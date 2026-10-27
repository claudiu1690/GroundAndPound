const Fight = require("../models/fightModel");

/** Same strict ObjectId shape fightController uses; rejects objects, arrays and 12-char strings. */
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * Ownership guard for fight-scoped routes (e.g. /fights/camp/:fightId/...).
 *
 * Loads the Fight named by req.params[paramName] and lets the request through only when
 * that fight belongs to the authenticated account's fighter (req.user.fighterId). A client
 * supplied fighterId is never consulted. Must run AFTER authMiddleware.
 *
 * Responds and returns on failure, never throws:
 *   403 no fighter on the account, 404 malformed id (no DB call) or missing fight,
 *   403 fight belongs to another fighter, 500 on any unexpected error (logged, not echoed).
 * Attaches nothing to req.
 */
function ownFightParam(paramName) {
    return async function ownFightParamGuard(req, res, next) {
        try {
            const own = req.user && req.user.fighterId;
            if (!own) {
                return res.status(403).json({ message: "Forbidden: no fighter linked to this account" });
            }
            const id = req.params ? req.params[paramName] : undefined;
            if (typeof id !== "string" || !OBJECT_ID_RE.test(id)) {
                return res.status(404).json({ message: "Fight not found" });
            }
            const fight = await Fight.findById(id).select("fighterId").lean();
            if (!fight) {
                return res.status(404).json({ message: "Fight not found" });
            }
            if (String(fight.fighterId) !== String(own)) {
                return res.status(403).json({ message: "Forbidden: you can only act on your own fighter" });
            }
        } catch (err) {
            console.error("[ownFightParam]", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        return next();
    };
}

module.exports = { ownFightParam };
