const AnalyticsEvent = require("../models/analyticsEventModel");

/**
 * Internal analytics — fire-and-forget event logging + a retention/funnel report.
 *
 * Mirrors the house style of activityLogService: `track` NEVER throws or rejects
 * in a way that breaks its caller. Any failure (Mongoose validation, Redis error,
 * etc.) is caught, logged server-side, and swallowed. Analytics must never break
 * a gameplay code path.
 */

/** UTC calendar day for a Date, "YYYY-MM-DD". */
function dayOf(date) {
    return date.toISOString().slice(0, 10);
}

/**
 * Record an analytics event.
 *
 * @param {string|ObjectId} userId  Account id (required — must come from req.user).
 * @param {string} type             One of the schema enum types.
 * @param {Object} [meta]           Free-form event metadata.
 * @param {Object} [opts]
 * @param {string|ObjectId|null} [opts.fighterId=null]
 * @param {boolean} [opts.dedupeSession=false]  If true, use a Redis NX guard so
 *        only the first `session` event per fighter per UTC day is written.
 * @returns {Promise<void>} Always resolves; never rejects.
 */
async function track(userId, type, meta = {}, opts = {}) {
    const { fighterId = null, dedupeSession = false } = opts;
    try {
        const day = dayOf(new Date());

        if (dedupeSession) {
            // First-session-per-day guard. If Redis is unreachable we DELIBERATELY
            // skip the whole write (accept undercounting on a Redis outage) rather
            // than fall back to an unguarded write that would over-count sessions.
            let acquired;
            try {
                const { redis, ensureRedisConnected } = require("../lib/redis");
                await ensureRedisConnected();
                // SET key 1 NX EX 172800 → returns "OK" on first write of the day,
                // null if the key already exists (already tracked this fighter today).
                acquired = await redis.set(
                    `analytics:session:${fighterId}:${day}`,
                    "1",
                    "EX",
                    172800,
                    "NX"
                );
            } catch (redisErr) {
                console.error("[analytics] session dedupe redis unavailable — skipping:", redisErr.message);
                return;
            }
            if (acquired === null) return; // already recorded a session for this fighter today
        }

        await AnalyticsEvent.create({ userId, fighterId, type, day, meta });
    } catch (err) {
        // Never rethrow — analytics must not break the caller.
        console.error("[analytics]", err);
    }
}

// ── Retention / funnel report ───────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Add `n` whole days to a "YYYY-MM-DD" string, returning a new "YYYY-MM-DD". */
function addDays(dayStr, n) {
    const d = new Date(`${dayStr}T00:00:00.000Z`);
    return dayOf(new Date(d.getTime() + n * DAY_MS));
}

function round2(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

/**
 * Compute the retention / funnel report over [from, to].
 *
 * All heavy lifting is done in Mongo aggregation pipelines — no application-level
 * loops over the full event set. `from`/`to` are Dates; `to` defaults to now and
 * `from` defaults to the earliest signup in the collection.
 *
 * @param {Date} [from]
 * @param {Date} [to]
 * @returns {Promise<Object>} report (see route contract for exact shape)
 */
async function computeRetention(from, to) {
    const now = new Date();
    const toDate = to instanceof Date && !isNaN(to) ? to : now;

    let fromDate = from instanceof Date && !isNaN(from) ? from : null;
    if (!fromDate) {
        // Default `from` = earliest signup ever recorded (fallback: epoch 0).
        const earliest = await AnalyticsEvent.aggregate([
            { $match: { type: "signup" } },
            { $group: { _id: null, at: { $min: "$createdAt" } } },
        ]);
        fromDate = earliest.length && earliest[0].at ? earliest[0].at : new Date(0);
    }

    const range = { $gte: fromDate, $lte: toDate };

    const [
        retention,
        firstFight,
        fightsPerActiveUserPerDay,
        gymPurchases,
        pvpUnlock,
        energyReturn,
    ] = await Promise.all([
        computeRetentionCohorts(range),
        computeFirstFight(range),
        computeFightsPerActiveUser(range),
        computeGymPurchases(range),
        computePvpUnlock(range),
        computeEnergyReturn(),
    ]);

    return {
        generatedAt: now.toISOString(),
        window: { from: fromDate.toISOString(), to: toDate.toISOString() },
        cohorts: {
            retention,
            firstFight,
            fightsPerActiveUserPerDay,
            gymPurchases,
            pvpUnlock,
            energyReturn,
        },
    };
}

/**
 * Retention cohorts. Signups in range are grouped by signup day into cohorts.
 * For each cohort we count DISTINCT users who returned (any event) within the
 * d1 / d7 / d30 windows. These are INDEPENDENT, NON-OVERLAPPING day-range
 * checks, not cumulative "returned within N days" totals — a user active
 * every day of their first month will show up in d1, d7, AND d30:
 *   d1  = signupDay+1 exactly
 *   d7  = signupDay+2 .. signupDay+7   (does not include the d1 day)
 *   d30 = signupDay+8 .. signupDay+30  (does not include the d1/d7 days)
 * A cohort whose signupDay is within `range.$to` minus 30 days has not yet
 * had time to complete its d30 window — read a fresh/recent cohort's low
 * d7/d30 as "too early to tell", not "churned".
 */
async function computeRetentionCohorts(range) {
    // 1. Cohort membership: earliest signup day per user, restricted to the window.
    const signups = await AnalyticsEvent.aggregate([
        { $match: { type: "signup", createdAt: range } },
        { $sort: { createdAt: 1 } },
        { $group: { _id: "$userId", signupDay: { $first: "$day" } } },
    ]);

    if (signups.length === 0) return [];

    const signupDayByUser = new Map(signups.map((s) => [String(s._id), s.signupDay]));
    const userIds = signups.map((s) => s._id);

    // 2. All distinct (user, day) activity for those users. One row per user/day is
    //    enough to answer "did they come back on/within a window".
    const activity = await AnalyticsEvent.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: { userId: "$userId", day: "$day" } } },
    ]);

    // 3. Tally per cohort in-memory over the COMPACT distinct-day set (not the raw
    //    event stream). Cohort count is bounded by #signup-days, activity by
    //    #(user,active-day) pairs — both small relative to total events.
    const cohorts = new Map(); // signupDay -> { users:Set, d1:Set, d7:Set, d30:Set }
    for (const [userId, signupDay] of signupDayByUser) {
        if (!cohorts.has(signupDay)) {
            cohorts.set(signupDay, { users: new Set(), d1: new Set(), d7: new Set(), d30: new Set() });
        }
        cohorts.get(signupDay).users.add(userId);
    }

    for (const row of activity) {
        const userId = String(row._id.userId);
        const day = row._id.day;
        const signupDay = signupDayByUser.get(userId);
        if (!signupDay || day <= signupDay) continue; // ignore day-0 and any pre-signup noise
        const c = cohorts.get(signupDay);
        if (!c) continue;
        if (day === addDays(signupDay, 1)) c.d1.add(userId);
        if (day > signupDay && day <= addDays(signupDay, 7)) c.d7.add(userId);
        if (day >= addDays(signupDay, 8) && day <= addDays(signupDay, 30)) c.d30.add(userId);
    }

    return [...cohorts.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([signupDay, c]) => ({
            signupDay,
            cohortSize: c.users.size,
            d1: c.d1.size,
            d7: c.d7.size,
            d30: c.d30.size,
        }));
}

/**
 * First-fight funnel. `signups` = signup events in range. `firstAccepted` /
 * `firstResolved` = users whose EARLIEST accepted/resolved event falls in range
 * (dedupe to first-per-user via $sort + $first, then range-match that first event).
 */
async function computeFirstFight(range) {
    const signupsAgg = await AnalyticsEvent.aggregate([
        { $match: { type: "signup", createdAt: range } },
        { $count: "n" },
    ]);
    const signups = signupsAgg.length ? signupsAgg[0].n : 0;

    async function firstPerUserInRange(type) {
        const res = await AnalyticsEvent.aggregate([
            { $match: { type } },
            { $sort: { createdAt: 1 } },
            { $group: { _id: "$userId", firstAt: { $first: "$createdAt" } } },
            { $match: { firstAt: range } },
            { $count: "n" },
        ]);
        return res.length ? res[0].n : 0;
    }

    const firstAccepted = await firstPerUserInRange("fight_accepted");
    const firstResolved = await firstPerUserInRange("fight_resolved");

    return {
        signups,
        firstAccepted,
        firstResolved,
        acceptRate: signups > 0 ? round2(firstAccepted / signups) : 0,
        resolveRate: signups > 0 ? round2(firstResolved / signups) : 0,
    };
}

/**
 * Fights per active user per day. For each day in range: activeUsers = distinct
 * users with ANY event that day; fights = count of fight_resolved that day.
 */
async function computeFightsPerActiveUser(range) {
    // fight_resolved counts per day.
    const fightsByDay = await AnalyticsEvent.aggregate([
        { $match: { type: "fight_resolved", createdAt: range } },
        { $group: { _id: "$day", fights: { $sum: 1 } } },
    ]);
    const fightsMap = new Map(fightsByDay.map((r) => [r._id, r.fights]));

    // Distinct active users per day (any event type) over the days that had fights.
    const days = [...fightsMap.keys()];
    if (days.length === 0) return [];

    const activeByDay = await AnalyticsEvent.aggregate([
        { $match: { day: { $in: days } } },
        { $group: { _id: { day: "$day", userId: "$userId" } } },
        { $group: { _id: "$_id.day", activeUsers: { $sum: 1 } } },
    ]);
    const activeMap = new Map(activeByDay.map((r) => [r._id, r.activeUsers]));

    return days
        .sort()
        .map((day) => {
            const fights = fightsMap.get(day) || 0;
            const activeUsers = activeMap.get(day) || 0;
            return {
                day,
                activeUsers,
                fights,
                perUser: activeUsers > 0 ? round2(fights / activeUsers) : 0,
            };
        });
}

/**
 * Gym-purchase funnel. `totalPurchasers` = distinct users with a gym_purchase
 * event in range. `signupToPurchaseRate` = totalPurchasers / signups-in-range.
 */
async function computeGymPurchases(range) {
    const purchasers = await AnalyticsEvent.aggregate([
        { $match: { type: "gym_purchase", createdAt: range } },
        { $group: { _id: "$userId" } },
        { $count: "n" },
    ]);
    const totalPurchasers = purchasers.length ? purchasers[0].n : 0;

    const signups = await countSignups(range);
    return {
        totalPurchasers,
        signupToPurchaseRate: signups > 0 ? round2(totalPurchasers / signups) : 0,
    };
}

/**
 * PvP unlock funnel. `unlocked` / `firstPvpFight` = distinct users with the
 * respective event in range. Rates are against signups-in-range.
 */
async function computePvpUnlock(range) {
    async function distinctUsers(type) {
        const res = await AnalyticsEvent.aggregate([
            { $match: { type, createdAt: range } },
            { $group: { _id: "$userId" } },
            { $count: "n" },
        ]);
        return res.length ? res[0].n : 0;
    }

    const unlocked = await distinctUsers("pvp_unlocked");
    const firstPvpFight = await distinctUsers("pvp_first_fight");
    const signups = await countSignups(range);

    return {
        unlocked,
        signupToUnlockRate: signups > 0 ? round2(unlocked / signups) : 0,
        firstPvpFight,
    };
}

async function countSignups(range) {
    const res = await AnalyticsEvent.aggregate([
        { $match: { type: "signup", createdAt: range } },
        { $count: "n" },
    ]);
    return res.length ? res[0].n : 0;
}

/**
 * Energy-on-return. Considers `session` events on days AFTER the user's own signup
 * day (day-0 starts at full energy, so it's excluded). We first fold signup days
 * into a per-user map, then $lookup sessions against it and keep only day > signupDay.
 *
 * avgEnergyPctOnReturn  = mean of meta.energyCurrent/meta.energyMax over qualifying sessions.
 * nearFullReturnRate    = fraction of qualifying sessions with that ratio >= 0.9.
 *
 * Note: this is a lifetime metric (not window-scoped) — it answers "when players
 * come back, how full is their energy", which is inherently cross-day.
 */
async function computeEnergyReturn() {
    // Build a per-user signup-day collection inline, then join sessions to it. Using
    // $unionWith-free two-source aggregation: run a signups pipeline that emits
    // {_id:userId, signupDay}, and $lookup from analyticsevents for that user's sessions.
    const rows = await AnalyticsEvent.aggregate([
        { $match: { type: "signup" } },
        { $sort: { createdAt: 1 } },
        { $group: { _id: "$userId", signupDay: { $first: "$day" } } },
        {
            $lookup: {
                from: "analyticsevents",
                let: { uid: "$_id", signupDay: "$signupDay" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$type", "session"] },
                                    { $eq: ["$userId", "$$uid"] },
                                    { $gt: ["$day", "$$signupDay"] }, // exclude day-0
                                ],
                            },
                        },
                    },
                    {
                        $project: {
                            _id: 0,
                            energyCurrent: "$meta.energyCurrent",
                            energyMax: "$meta.energyMax",
                        },
                    },
                ],
                as: "sessions",
            },
        },
        { $unwind: "$sessions" },
        // Guard against divide-by-zero / missing meta.
        {
            $match: {
                "sessions.energyMax": { $gt: 0 },
                "sessions.energyCurrent": { $type: "number" },
            },
        },
        {
            $project: {
                pct: { $divide: ["$sessions.energyCurrent", "$sessions.energyMax"] },
            },
        },
        {
            $group: {
                _id: null,
                returnSessions: { $sum: 1 },
                avgPct: { $avg: "$pct" },
                nearFull: { $sum: { $cond: [{ $gte: ["$pct", 0.9] }, 1, 0] } },
            },
        },
    ]);

    if (rows.length === 0) {
        return { returnSessions: 0, avgEnergyPctOnReturn: 0, nearFullReturnRate: 0 };
    }
    const r = rows[0];
    return {
        returnSessions: r.returnSessions,
        avgEnergyPctOnReturn: round2(r.avgPct || 0),
        nearFullReturnRate: r.returnSessions > 0 ? round2(r.nearFull / r.returnSessions) : 0,
    };
}

// ── Client beacon (POST /fighters/:id/analytics/events) ─────────────────────
//
// The browser may report a few UI-only events. The request body is hostile: the type must be
// on this whitelist and the meta is rebuilt from scratch per type (unknown keys dropped, every
// required key validated). Server-only types (premium_panel_shown) are NOT accepted here.
//
// The track() call for these lives in THIS file on purpose: the enum drift test scans call
// sites, and a dynamic type at a controller call site would be unresolvable there.

const ENERGY_OFFER_SOURCES = new Set(["pvp", "fight", "camp", "fightcamp"]);
const PANEL_EXPAND_FROM = new Set(["bar", "chip", "offer", "purchase_return"]);
const ENERGY_OFFER_CHOICES = new Set(["wait", "use_shot", "buy_use_shot", "use_drink", "see_bundles", "dismiss"]);

function intInRange(v, lo, hi) {
    return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

/** Per-type meta builders. Each returns the clean meta, or null when invalid. */
const CLIENT_EVENT_SANITIZERS = {
    premium_panel_expanded: (m) => (PANEL_EXPAND_FROM.has(m.from) ? { from: m.from } : null),
    energy_offer_shown: (m) => (
        ENERGY_OFFER_SOURCES.has(m.source) && intInRange(m.need, 1, 100) && intInRange(m.have, 0, 100)
            ? { source: m.source, need: m.need, have: m.have }
            : null
    ),
    energy_offer_choice: (m) => (
        ENERGY_OFFER_SOURCES.has(m.source) && ENERGY_OFFER_CHOICES.has(m.choice)
            ? { source: m.source, choice: m.choice }
            : null
    ),
};

/** Event types the client beacon accepts. Every one is in the AnalyticsEvent type enum. */
const CLIENT_EVENT_TYPES = Object.freeze(Object.keys(CLIENT_EVENT_SANITIZERS));

/**
 * Validate a client event. Pure.
 * @param {*} type
 * @param {*} meta
 * @returns {{ type: string, meta: object }|null} the clean event, or null when rejected
 */
function sanitizeClientEvent(type, meta) {
    if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(CLIENT_EVENT_SANITIZERS, type)) {
        return null;
    }
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    // Only the payload's OWN string-keyed values are read; a prototype-polluted or getter-laden
    // object cannot smuggle a value in.
    const own = {};
    for (const key of Object.keys(meta)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        own[key] = meta[key];
    }
    const clean = CLIENT_EVENT_SANITIZERS[type](own);
    return clean ? { type, meta: clean } : null;
}

/**
 * Record a client-reported event. Throws `{ code: "invalid_event" }` when rejected; the write
 * itself is fire-and-forget through track(), which never rejects.
 * @param {string} userId     req.user.id
 * @param {string} fighterId  the owner-checked :id
 * @param {*} type
 * @param {*} meta
 */
function trackClientEvent(userId, fighterId, type, meta) {
    const clean = sanitizeClientEvent(type, meta);
    if (!clean) {
        const err = new Error("Invalid event");
        err.code = "invalid_event";
        throw err;
    }
    // Through module.exports so tests can stub track without a database.
    module.exports.track(userId, clean.type, clean.meta, { fighterId });
}

module.exports = {
    track,
    computeRetention,
    CLIENT_EVENT_TYPES,
    sanitizeClientEvent,
    trackClientEvent,
};
