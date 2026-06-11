/**
 * Ground & Pound — PVP season lifecycle service.
 *
 * Owns: current-season resolution, idempotent seeding (launch + N+1), and the daily
 * self-healing transition sweep (end due seasons → start due upcoming seasons).
 */

const Season = require("../models/seasonModel");
const {
    WEIGHT_CLASSES_PVP,
    TWIST_KEYS,
    TWISTS,
    SEASON_LENGTH_DAYS,
} = require("../consts/pvpConfig");

// Twists eligible for the deterministic N+1 rotation (all of them, including iron_circuit).
const ROTATION_TWISTS = TWIST_KEYS;

// The season's flavour name IS its twist's display name (e.g. "Iron Circuit"). The UI
// renders "Season {n} — {name}", so name must NOT repeat the number or weight class
// (that produced "Season 1 — Season 1 — Middleweight").
function seasonNameFor(twist) {
    return (TWISTS[twist] && TWISTS[twist].name) || "Iron Circuit";
}

/**
 * Deterministic twist for season N (>1). Season 1 is always iron_circuit (handled by
 * the seed caller). Rotation is index-based so it is reproducible and never random.
 */
function pickTwistForSeason(seasonNumber) {
    if (seasonNumber <= 1) return "iron_circuit";
    const idx = (seasonNumber - 1) % ROTATION_TWISTS.length;
    return ROTATION_TWISTS[idx];
}

function addDays(date, days) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Resolve the "current" season for a weight class: the active one, else the next
 * upcoming one (so the hub can show a countdown), else null.
 */
async function getCurrentSeason(weightClass) {
    const active = await Season.findOne({ weightClass, status: "active" }).sort({ seasonNumber: -1 });
    if (active) return active;
    return Season.findOne({ weightClass, status: "upcoming" }).sort({ startDate: 1 });
}

async function getSeasonById(seasonId) {
    return Season.findById(seasonId);
}

/**
 * Idempotent single-season create. The unique {weightClass,seasonNumber} index guards
 * against duplicates on re-run — a dup-key error returns the existing doc.
 * @param {Date} startDate
 * @param {"upcoming"|"active"} status
 */
async function seedSeason(seasonNumber, weightClass, twist, startDate, status = "upcoming") {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = addDays(start, SEASON_LENGTH_DAYS);
    const resolvedTwist = twist || "iron_circuit";
    try {
        const doc = await Season.create({
            seasonNumber,
            name: seasonNameFor(resolvedTwist),
            twist: resolvedTwist,
            weightClass,
            startDate: start,
            endDate: end,
            status,
        });
        return doc;
    } catch (err) {
        if (err && err.code === 11000) {
            // Idempotent re-run: heal a stale name (e.g. seasons seeded before the
            // name format was fixed) so re-running the seed corrects the display.
            const existing = await Season.findOne({ weightClass, seasonNumber });
            if (existing) {
                const canonical = seasonNameFor(existing.twist);
                if (existing.name !== canonical) {
                    existing.name = canonical;
                    await existing.save();
                }
            }
            return existing;
        }
        throw err;
    }
}

/**
 * Seed all 4 weight-class seasons for a cycle. Season 1 forces iron_circuit.
 */
async function seedAllForCycle(seasonNumber, twist, startDate, status = "active") {
    const chosenTwist = seasonNumber <= 1 ? "iron_circuit" : (twist || pickTwistForSeason(seasonNumber));
    const out = [];
    for (const wc of WEIGHT_CLASSES_PVP) {
        // eslint-disable-next-line no-await-in-loop
        const doc = await seedSeason(seasonNumber, wc, chosenTwist, startDate, status);
        out.push(doc);
    }
    return out;
}

/**
 * Daily self-healing transition sweep — called by the BullMQ worker.
 *  Phase 1: end every active season past its endDate (delegates to pvpRewardService.finalizeSeason).
 *  Phase 2: start every upcoming season whose startDate has passed.
 * Idempotent: each phase re-queries by status, and finalizeSeason is itself idempotent.
 * @returns {{ ended:number, started:number, failed:number }}
 */
async function runSeasonTransitionSweep(now = new Date()) {
    const pvpRewardService = require("./pvpRewardService");
    let ended = 0;
    let started = 0;
    let failed = 0;

    // Phase 1 — end due seasons.
    const due = await Season.find({ status: "active", endDate: { $lte: now } });
    for (const season of due) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await pvpRewardService.finalizeSeason(season);
            ended += 1;
        } catch (err) {
            failed += 1;
            console.error(`[PVP transition] finalizeSeason failed for season ${season._id}:`, err.message);
        }
    }

    // Phase 2 — start due upcoming seasons.
    const upcoming = await Season.find({ status: "upcoming", startDate: { $lte: now } });
    for (const season of upcoming) {
        try {
            season.status = "active";
            // eslint-disable-next-line no-await-in-loop
            await season.save();
            started += 1;
        } catch (err) {
            failed += 1;
            console.error(`[PVP transition] start failed for season ${season._id}:`, err.message);
        }
    }

    return { ended, started, failed };
}

module.exports = {
    getCurrentSeason,
    getSeasonById,
    seedSeason,
    seedAllForCycle,
    runSeasonTransitionSweep,
    pickTwistForSeason,
    seasonNameFor,
    addDays,
};
