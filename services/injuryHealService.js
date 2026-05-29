/**
 * Hourly injury auto-heal job.
 * Runs once per hour via the BullMQ scheduler. For every fighter with an injury
 * that still has a recovery timer (recoveryHoursLeft>0 — including doctor-required
 * injuries), decrements the hour counter by the number of full 1h periods elapsed
 * since the last tick. Heals (and reverses stat penalties) when it hits 0.
 *
 * Note: fighter loads also tick injuries lazily (see fighterService.getFighterById),
 * so healing stays accurate even if this background job is delayed or not running.
 */
const Fighter = require("../models/fighterModel");
const { tickRecoveryForFighter } = require("../utils/injuryUtils");
const saveWithVersionRetry = require("../utils/saveWithVersionRetry");

async function runInjuryHealBatch() {
    const now = new Date();
    // Any fighter with at least one injury still ticking down. The $or covers
    // legacy day-based injuries that haven't been auto-migrated yet by a lazy
    // tick — they get picked up here and converted. The cursor is used ONLY to
    // collect candidate ids; the actual mutate+save happens on a freshly loaded
    // doc through saveWithVersionRetry so a concurrent lazy GET-tick can't be
    // clobbered (and vice-versa).
    const cursor = Fighter.find({
        injuries: {
            $elemMatch: {
                $or: [
                    { recoveryHoursLeft: { $gt: 0 } },
                    { recoveryDaysLeft:  { $gt: 0 } },
                ],
            },
        },
    }).select("_id").cursor();

    let touched = 0;
    let healedCount = 0;
    let failed = 0;
    for await (const candidate of cursor) {
        const id = candidate._id;
        try {
            await saveWithVersionRetry(
                () => Fighter.findById(id),
                (f) => {
                    const healed = tickRecoveryForFighter(f, now);
                    // Stash on the doc so we can read it after the (possibly retried) save.
                    f.$locals.healedCount = healed.length;
                }
            ).then((doc) => {
                if (doc) {
                    healedCount += doc.$locals.healedCount || 0;
                    touched += 1;
                }
            });
        } catch (err) {
            // Never abort the whole batch on a single fighter — silent/whole-batch
            // failure is unacceptable in async gameplay. Count it and move on.
            failed += 1;
            console.error(`runInjuryHealBatch: failed to heal fighter ${id}:`, err);
        }
    }
    return { touched, healed: healedCount, failed };
}

module.exports = { runInjuryHealBatch };
