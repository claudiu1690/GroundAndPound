const ActivityLog = require("../models/activityLogModel");

/**
 * Write a career activity log entry. Failures are silently swallowed —
 * activity logging must never break the fight resolution flow.
 */
async function log(fighterId, type, detail, meta = {}) {
    try {
        await ActivityLog.create({
            fighterId,
            type,
            detail,
            tier: meta.tier ?? null,
            meta,
        });
    } catch (err) {
        console.error("[activityLog] Failed to write entry:", err.message);
    }
}

module.exports = { log };
