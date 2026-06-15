const ActivityLog = require("../models/activityLogModel");

/**
 * Career-feed event types that should regenerate the persisted Octagon Gazette.
 * A successful feed write of one of these types triggers a new gazette edition.
 * Anything not in this set leaves the existing edition untouched.
 */
const REGEN_TRIGGERS = new Set([
    "FIGHT_WIN", "FIGHT_LOSS", "FIGHT_DRAW",
    "TIER_PROMOTION", "TITLE_WON",
    "NEMESIS_SET", "NEMESIS_CLEARED",
    "BADGE_EARNED", "TITLE_SHOT_ELIGIBLE", "MENTAL_RESET",
    "pvp_win", "pvp_loss", "pvp_promoted", "pvp_belt_won", "pvp_rivalry_resolved",
]);

/**
 * Write a career activity log entry. Failures are silently swallowed —
 * activity logging must never break the fight resolution flow.
 *
 * After a successful write of a REGEN_TRIGGERS type, we regenerate the persisted
 * Octagon Gazette. The regen call is wrapped so a regen failure NEVER affects the
 * feed write (which has already committed).
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
        return; // feed write failed — do not attempt regen
    }

    if (REGEN_TRIGGERS.has(type)) {
        try {
            // LAZY require — MANDATORY. gazetteService is not required at module top
            // level to avoid a circular dependency (gazetteService -> models, and the
            // fight/pvp services pull in both this module and gazette-adjacent code).
            const gazetteService = require("./gazetteService");
            await gazetteService.regenerateGazette(fighterId, type);
        } catch (e) {
            console.warn("[gazette] regenerate failed (feed write preserved):", e.message);
        }
    }
}

module.exports = { log, REGEN_TRIGGERS };
