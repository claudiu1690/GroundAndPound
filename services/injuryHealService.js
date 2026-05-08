/**
 * Daily injury auto-heal job.
 * Runs once per 24h via the BullMQ scheduler. For every fighter with
 * active auto-heal injuries (requiresDoctorVisit=false, recoveryDaysLeft>0),
 * decrements the day counter by the number of full 24h periods elapsed since
 * the last tick. Heals (and reverses stat penalties) when it hits 0.
 */
const Fighter = require("../models/fighterModel");
const { tickRecoveryForFighter } = require("../utils/injuryUtils");

async function runInjuryHealBatch() {
    const now = new Date();
    // Only fighters with at least one auto-heal injury still ticking.
    const cursor = Fighter.find({
        injuries: {
            $elemMatch: {
                requiresDoctorVisit: false,
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
