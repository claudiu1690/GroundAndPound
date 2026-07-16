/**
 * Ownership guard for fighter-scoped routes.
 *
 * Ensures the authenticated account can only act on its own fighter. Mirrors the
 * `requireSelf` pattern in accountController.js: respond + return on failure, never
 * throw. Must run AFTER authMiddleware (which populates req.user.fighterId).
 *
 * String comparison happens before any DB hit, so a malformed :id simply fails the
 * compare and returns 403 rather than 500.
 */
function ownFighterMiddleware(req, res, next) {
    const fighterId = req.user && req.user.fighterId;
    if (!fighterId) {
        return res.status(403).json({ message: "Forbidden — no fighter linked to this account" });
    }
    if (String(fighterId) !== String(req.params.id)) {
        return res.status(403).json({ message: "Forbidden — you can only act on your own fighter" });
    }
    return next();
}

/**
 * Factory variant — same ownership guard but keyed on an arbitrary route param name
 * (e.g. `ownFighterParam("fighterId")` for routes mounted as /media/:fighterId/...).
 * Same 403 messages/behaviour as the default guard.
 */
function ownFighterParam(paramName) {
    return function ownFighterParamGuard(req, res, next) {
        const fighterId = req.user && req.user.fighterId;
        if (!fighterId) {
            return res.status(403).json({ message: "Forbidden — no fighter linked to this account" });
        }
        if (String(fighterId) !== String(req.params[paramName])) {
            return res.status(403).json({ message: "Forbidden — you can only act on your own fighter" });
        }
        return next();
    };
}

module.exports = ownFighterMiddleware;
module.exports.ownFighterParam = ownFighterParam;
