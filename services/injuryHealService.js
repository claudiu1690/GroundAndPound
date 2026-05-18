/**
 * Daily injury auto-heal job.
 * Runs once per 24h via the BullMQ scheduler. For every fighter with an injury
 * that still has a recovery timer (recoveryDaysLeft>0 — including doctor-required
 * injuries), decrements the day counter by the number of full 24h periods elapsed
 * since the last tick. Heals (and reverses stat penalties) when it hits 0.
 *
 * Note: fighter loads also tick injuries lazily (see fighterService.getFighterById),
 * so healing stays accurate even if this background job is delayed or not running.
 */
const Fighter = require("../models/fighterModel");
const { tickRecoveryForFighter } = require("../utils/injuryUtils");

async function runInjuryHealBatch() {
    const now = new Date();
    // Any fighter with at least one injury still ticking down.
    const cursor = Fighter.find({
        injuries: {
            $elemMatch: {
                recoveryDaysLeft: { $gt: 0 },
            },
        },
    }).cursor();

    let touched = 0;
    let healedCount = 0;
    for await (const fighter of cursor) {
        const healed = tickRecoveryForFighter(fighter, now);
        if (healed.length > 0) healedCount += healed.length;
        // Save unconditionally — even if no injury reached 0, we may have advanced
        // recoveryLastTickAt and decremented recoveryDaysLeft.
        await fighter.save();
        touched += 1;
    }
    return { touched, healed: healedCount };
}

module.exports = { runInjuryHealBatch };
