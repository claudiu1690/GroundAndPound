/**
 * Ground & Pound — PVP inactivity decay.
 *
 * Once per day (BullMQ cron) any active-season record that hasn't fought in
 * DECAY_AFTER_DAYS and isn't in the skip division (prospect) loses DECAY_AMOUNT DP,
 * floored at its division floor. Idempotent within a UTC day via `lastDecayAt`.
 */

const PVPRecord = require("../models/pvpRecordModel");
const Season = require("../models/seasonModel");
const {
    DECAY_AFTER_DAYS,
    DECAY_AMOUNT,
    INACTIVITY_DECAY_SKIP,
    divisionFloor,
} = require("../consts/pvpConfig");

function utcDayKey(date) {
    return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

/**
 * @returns {number} count of records decayed this run.
 */
async function runDecayBatch(now = new Date()) {
    const activeSeasons = await Season.find({ status: "active" }).select("_id").lean();
    if (activeSeasons.length === 0) return 0;
    const seasonIds = activeSeasons.map((s) => s._id);

    const cutoff = new Date(now.getTime() - DECAY_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const todayKey = utcDayKey(now);

    const candidates = await PVPRecord.find({
        seasonId: { $in: seasonIds },
        division: { $ne: INACTIVITY_DECAY_SKIP },
        lastFightAt: { $ne: null, $lt: cutoff },
    });

    let count = 0;
    for (const record of candidates) {
        // Same-day idempotency guard.
        if (record.lastDecayAt && utcDayKey(new Date(record.lastDecayAt)) === todayKey) continue;

        const floor = divisionFloor(record.division);
        const next = Math.max(floor, record.dp - DECAY_AMOUNT);
        record.lastDecayAt = now;
        record.lastActiveAt = now; // touch activity; do NOT touch lastFightAt.
        if (next !== record.dp) {
            record.dp = next;
        }
        try {
            // eslint-disable-next-line no-await-in-loop
            await record.save();
            count += 1;
        } catch (err) {
            console.error(`[PVP decay] failed to decay record ${record._id}:`, err.message);
        }
    }

    return count;
}

module.exports = { runDecayBatch };
