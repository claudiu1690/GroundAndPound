const jwt = require("jsonwebtoken");
const config = require("../config");

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized — no token provided" });
    }
    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, config.jwtSecret);
        req.user = payload; // { id, email, fighterId }
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

module.exports = authMiddleware;
