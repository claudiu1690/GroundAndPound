/**
 * GDD: 1 Energy per minute, server-side. Energy ticks in the DB even when the user is idle.
 * - On read/action: fighterService.reconcileEnergy() (date-fns) brings energy up to date.
 * - Every minute: cron runs reconcileAllFightersEnergy() so stored energy stays current
 *   (so when the frontend polls or user returns, the value is already correct).
 */
const cron = require("node-cron");
const fighterService = require("../services/fighterService");

function startEnergyIncrementScheduler() {
    // Every minute, reconcile energy for all fighters with energy < max (time-based, not +1 flat).
    cron.schedule("*/1 * * * *", async () => {
        try {
            const updated = await fighterService.reconcileAllFightersEnergy();
            if (updated > 0) {
                console.log(`[Energy] Reconciled ${updated} fighter(s)`);
            }
        } catch (err) {
            console.error("[Energy] Cron reconcile error:", err.message);
        }
    });
    console.log("[Energy] Scheduler started: energy reconciles every minute (GDD 1/min).");
}

module.exports = {
    startEnergyIncrementScheduler,
};
