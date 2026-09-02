/**
 * Ground & Pound — PVP season lifecycle service.
 *
 * Owns: current-season resolution, idempotent seeding (launch + N+1), and the daily
 * self-healing transition sweep (end due seasons → start due upcoming seasons).
 */

const Season = require("../models/seasonModel");
const {
    WEIGHT_CLASSES_PVP,
    OPEN_WEIGHT_CLASS,
    TWIST_KEYS,
    TWISTS,
    TWIST_METHOD_LABELS,
    NEXT_SEASON_TEASE,
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
 * THE single producer of player-facing twist copy. Every surface (season hub block,
 * public landing hero, next-season tease) reads it from here so the wording can never
 * drift between an authenticated screen and the marketing page.
 *
 *   methods + pct → "+25% Division Points on KO/Submission wins"  (labelled, never raw keys)
 *   streakFrom    → "Streak bonus from 3 straight wins"
 *   neither       → twistEffect: null   (iron_circuit has no effect line)
 *
 * @param {string} twistKey
 * @returns {{ twistName: string|null, twistEffect: string|null }}
 */
function twistCopyFor(twistKey) {
    const twist = TWISTS[twistKey] || {};
    const twistName = twist.name || (twistKey ? String(twistKey) : null);

    if (Array.isArray(twist.methods) && twist.methods.length && typeof twist.pct === "number") {
        const methods = twist.methods.map((m) => TWIST_METHOD_LABELS[m] || m).join("/");
        return { twistName, twistEffect: `+${Math.round(twist.pct * 100)}% Division Points on ${methods} wins` };
    }
    if (typeof twist.streakFrom === "number") {
        return { twistName, twistEffect: `Streak bonus from ${twist.streakFrom} straight wins` };
    }
    return { twistName, twistEffect: null };
}

/**
 * Player-facing weight-class label for a season doc. Open (cross-weight-class) seasons
 * are one merged ladder, so naming the sentinel class ("Open") alone reads like a fifth
 * division — spell out that everyone is in it.
 */
function publicWeightClassLabel(season) {
    if (!season) return null;
    if (isCrossWeightClass(season)) return "Open · All Weight Classes";
    return season.weightClass || null;
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

/** Is this an Open (cross-weight-class) season? */
function isCrossWeightClass(season) {
    return !!(season && season.config && season.config.crossWeightClass);
}

/**
 * Resolve the season a fighter of `realWeightClass` plays in, with Open taking
 * precedence over the per-WC season. Precedence (first match wins):
 *   1. active Open season
 *   2. active per-WC season for the fighter's real class
 *   3. upcoming Open season (so the hub can show a countdown)
 *   4. upcoming per-WC season
 * Returns null if none exist.
 */
async function getCurrentSeasonForFighter(realWeightClass) {
    const activeOpen = await Season.findOne({ weightClass: OPEN_WEIGHT_CLASS, status: "active" })
        .sort({ seasonNumber: -1 });
    if (activeOpen) return activeOpen;

    const activeWc = await Season.findOne({ weightClass: realWeightClass, status: "active" })
        .sort({ seasonNumber: -1 });
    if (activeWc) return activeWc;

    const upcomingOpen = await Season.findOne({ weightClass: OPEN_WEIGHT_CLASS, status: "upcoming" })
        .sort({ startDate: 1 });
    if (upcomingOpen) return upcomingOpen;

    return Season.findOne({ weightClass: realWeightClass, status: "upcoming" }).sort({ startDate: 1 });
}

/**
 * Resolve the season to surface on the public marketing landing "Live Now / countdown"
 * band. Unauthenticated + cheap to poll. Precedence (first non-null wins):
 *   1. active Open season
 *   2. active per-WC season (any PVP weight class)
 *   3. upcoming Open season (soonest to start)
 *   4. upcoming per-WC season (soonest to start)
 * "ended" seasons are never queried. Returns null if none exist. All reads are .lean().
 */
async function getPublicSeason() {
    const activeOpen = await Season.findOne({ weightClass: OPEN_WEIGHT_CLASS, status: "active" })
        .sort({ seasonNumber: -1 }).lean();
    if (activeOpen) return activeOpen;

    const activeWc = await Season.findOne({ weightClass: { $in: WEIGHT_CLASSES_PVP }, status: "active" })
        .sort({ seasonNumber: -1 }).lean();
    if (activeWc) return activeWc;

    const upcomingOpen = await Season.findOne({ weightClass: OPEN_WEIGHT_CLASS, status: "upcoming" })
        .sort({ startDate: 1 }).lean();
    if (upcomingOpen) return upcomingOpen;

    // A per-WC cycle seeds 4 docs sharing one startDate, so weightClass is a REQUIRED
    // tie-break: without it the pick is arbitrary and the landing band can show a
    // different class on every poll.
    const upcomingWc = await Season.findOne({ weightClass: { $in: WEIGHT_CLASSES_PVP }, status: "upcoming" })
        .sort({ startDate: 1, weightClass: 1 }).lean();
    if (upcomingWc) return upcomingWc;

    return null;
}

/**
 * Collapse a per-weight-class upcoming CYCLE into one logical season for public display.
 *
 * A per-WC cycle seeds 4 docs that share an identical startDate, so
 * `findOne(...).sort({startDate:1})` has an undefined tie-break: consecutive 30-second
 * polls could each surface a DIFFERENT weight class and make the landing tease flicker.
 * When the whole cycle is present we therefore expose it as ONE season carrying
 * cross-weight-class semantics ("all four classes run") instead of an arbitrary class.
 *
 * Display-only projection: it is never saved, and gameplay reads
 * (getCurrentSeasonForFighter) still resolve the real per-WC doc.
 *
 * @returns {object} the collapsed season, or `doc` unchanged when no full cycle exists.
 */
async function collapseUpcomingPerWcCycle(doc) {
    if (!doc) return doc;

    const cycle = await Season.find({
        seasonNumber: doc.seasonNumber,
        status: "upcoming",
        weightClass: { $in: WEIGHT_CLASSES_PVP },
    }).lean();

    // Not a full cycle (partial seed / genuinely single-class season) — leave it alone.
    if (!Array.isArray(cycle) || cycle.length < WEIGHT_CLASSES_PVP.length) return doc;

    // Stable base pick so the id/name/dates are identical on every poll.
    const base = [...cycle].sort(
        (a, b) => WEIGHT_CLASSES_PVP.indexOf(a.weightClass) - WEIGHT_CLASSES_PVP.indexOf(b.weightClass)
    )[0] || doc;

    return {
        ...base,
        weightClass: OPEN_WEIGHT_CLASS,
        config: { ...(base.config || {}), crossWeightClass: true },
    };
}

/**
 * The configured marketing tease, shaped like a Season doc so every consumer (shapers,
 * the self-tease guard) can treat it exactly like a real one. Returns null when the
 * switch is off. The `_id` is a sentinel string — it can never collide with an ObjectId.
 */
function teaseSeason() {
    const cfg = NEXT_SEASON_TEASE;
    if (!cfg || !cfg.enabled) return null;

    const start = new Date(cfg.startDate);
    if (Number.isNaN(start.getTime())) {
        console.error("[pvpSeasonService] NEXT_SEASON_TEASE.startDate is unparseable — tease suppressed.");
        return null;
    }
    const twist = TWIST_KEYS.includes(cfg.twist) ? cfg.twist : "iron_circuit";

    return {
        _id: `tease:season-${cfg.seasonNumber}`,
        seasonNumber: cfg.seasonNumber,
        name: seasonNameFor(twist),
        twist,
        weightClass: cfg.crossWeightClass ? OPEN_WEIGHT_CLASS : null,
        startDate: start,
        endDate: addDays(start, SEASON_LENGTH_DAYS),
        status: "upcoming",
        beltHolderId: null,
        config: { crossWeightClass: !!cfg.crossWeightClass },
    };
}

/**
 * The NEXT season to tease on the public landing. Resolution order:
 *   (a) a real upcoming Season doc — Open first, then a per-WC cycle (collapsed);
 *   (b) else the NEXT_SEASON_TEASE config block, when armed;
 *   (c) else null.
 *
 * getPublicSeason resolves active-before-upcoming, so while a season is live the one
 * after it is invisible to the landing page — exactly the window where a "next season
 * starts in N days" tease is worth the most, hence this second read. In practice (a) is
 * almost always empty mid-season: finalizeSeason seeds N+1 with startDate = the ending
 * season's endDate and the same sweep immediately activates it, so no upcoming doc
 * survives. That is why (b) exists.
 *
 * Cheap + .lean() — this is polled anonymously by every landing visitor.
 */
async function getNextSeason() {
    const open = await Season.findOne({ weightClass: OPEN_WEIGHT_CLASS, status: "upcoming" })
        .sort({ startDate: 1, seasonNumber: 1 }).lean();
    if (open) return open;

    const perWc = await Season.findOne({ weightClass: { $in: WEIGHT_CLASSES_PVP }, status: "upcoming" })
        .sort({ startDate: 1, seasonNumber: 1, weightClass: 1 }).lean();
    if (perWc) return collapseUpcomingPerWcCycle(perWc);

    return teaseSeason();
}

/**
 * Resolve the "current" season for a weight class. Alias kept for existing callers —
 * delegates to getCurrentSeasonForFighter so Open seasons take precedence. When no Open
 * season exists this returns the per-WC season exactly as before.
 */
async function getCurrentSeason(weightClass) {
    return getCurrentSeasonForFighter(weightClass);
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
async function seedSeason(seasonNumber, weightClass, twist, startDate, status = "upcoming", config = {}) {
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
            config: { crossWeightClass: !!(config && config.crossWeightClass) },
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
        const doc = await seedSeason(seasonNumber, wc, chosenTwist, startDate, status, {});
        out.push(doc);
    }
    return out;
}

/**
 * Seed a single Open (cross-weight-class) season — one merged ladder for all classes.
 * Idempotent via {weightClass:"Open", seasonNumber} unique index.
 */
async function seedOpenSeason(seasonNumber, twist, startDate, status = "active") {
    return seedSeason(seasonNumber, OPEN_WEIGHT_CLASS, twist, startDate, status, { crossWeightClass: true });
}

/**
 * Seed the 4 per-weight-class seasons for a cycle and RETURN a Map<realWeightClass,
 * seasonDoc> so the Open→per-WC redistribution can resolve each player's target. Twist
 * is the deterministic rotation pick for the season number. Idempotent per-WC.
 */
async function seedPerWcCycle(seasonNumber, startDate, status = "upcoming") {
    const chosenTwist = seasonNumber <= 1 ? "iron_circuit" : pickTwistForSeason(seasonNumber);
    const map = new Map();
    for (const wc of WEIGHT_CLASSES_PVP) {
        // eslint-disable-next-line no-await-in-loop
        const doc = await seedSeason(seasonNumber, wc, chosenTwist, startDate, status, {});
        if (doc) map.set(wc, doc);
    }
    return map;
}

/**
 * Daily self-healing transition sweep — called by the BullMQ worker.
 *  Phase 1: end every active season past its endDate (delegates to pvpRewardService.finalizeSeason).
 *  Phase 2: start every upcoming season whose startDate has passed.
 * Idempotent: each phase re-queries by status, and finalizeSeason is itself idempotent.
 * Phase 1 also recovers ended-but-unredistributed seasons (crash recovery) — counted
 * separately as `recovered`.
 * @returns {{ ended:number, started:number, failed:number, recovered:number }}
 */
async function runSeasonTransitionSweep(now = new Date()) {
    const pvpRewardService = require("./pvpRewardService");
    let ended = 0;
    let started = 0;
    let failed = 0;

    // Phase 1 — end due seasons + recover stranded finalizes.
    //   (a) active seasons past their endDate (normal end).
    //   (b) ended-but-unredistributed seasons (a crash left finalize half-done; the
    //       redistributedAt sentinel is still null). finalizeSeason is idempotent, so
    //       re-running completes redistribution + N+1 seeding without double-paying.
    const due = await Season.find({ status: "active", endDate: { $lte: now } });
    const stranded = await Season.find({ status: "ended", redistributedAt: null });

    // Dedupe: a season can only appear in one set (status differs), but guard anyway so a
    // race never double-processes the same doc in a single sweep.
    const seen = new Set();
    const toFinalize = [];
    for (const season of [...due, ...stranded]) {
        const key = String(season._id);
        if (seen.has(key)) continue;
        seen.add(key);
        toFinalize.push(season);
    }

    let recovered = 0;
    for (const season of toFinalize) {
        const wasStranded = season.status === "ended";
        try {
            // eslint-disable-next-line no-await-in-loop
            await pvpRewardService.finalizeSeason(season);
            if (wasStranded) {
                recovered += 1;
                console.warn(`[PVP transition] recovered stranded finalize for season ${season._id}.`);
            } else {
                ended += 1;
            }
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

    return { ended, started, failed, recovered };
}

module.exports = {
    getCurrentSeason,
    getCurrentSeasonForFighter,
    getPublicSeason,
    getNextSeason,
    isCrossWeightClass,
    twistCopyFor,
    publicWeightClassLabel,
    getSeasonById,
    seedSeason,
    seedAllForCycle,
    seedOpenSeason,
    seedPerWcCycle,
    runSeasonTransitionSweep,
    pickTwistForSeason,
    seasonNameFor,
    addDays,
};
