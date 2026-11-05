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

// ── Acquisition (where a new player came from) ─────────────────────────────

// Campaign tags are our own link labels ("reddit", "ig-bio"), never free text:
// lowercase letters, digits, "-" and "_", at most 40 characters.
const ACQUISITION_TAG = /^[a-z0-9_-]{1,40}$/;

function cleanTag(value) {
    if (typeof value !== "string") return null;
    const tag = value.trim().toLowerCase();
    return ACQUISITION_TAG.test(tag) ? tag : null;
}

/**
 * Turn the client's `acquisition` body field into signup-event meta.
 * Hostile or malformed input is dropped silently: it must never fail a signup.
 *
 * @param {*} raw  Expected `{ src?: string, campaign?: string }`.
 * @returns {Object} `{ src, campaign? }`, or `{}` when there is no usable source.
 */
function acquisitionMeta(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const src = cleanTag(raw.src);
    // "direct" is the report's label for untagged signups, so a link tagged "direct" is untagged.
    if (!src || src === "direct") return {};
    const campaign = cleanTag(raw.campaign);
    return campaign ? { src, campaign } : { src };
}

/**
 * Coarse device class from a User-Agent header (first-session funnel split).
 * @param {*} ua
 * @returns {"phone"|"desktop"|"unknown"}
 */
function deviceFromUserAgent(ua) {
    if (typeof ua !== "string" || ua.trim() === "") return "unknown";
    return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "phone" : "desktop";
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
        acquisition,
        firstSession,
    ] = await Promise.all([
        computeRetentionCohorts(range),
        computeFirstFight(range),
        computeFightsPerActiveUser(range),
        computeGymPurchases(range),
        computePvpUnlock(range),
        computeEnergyReturn(),
        computeAcquisition(range),
        module.exports.computeFirstSession(range),
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
        acquisition,
        firstSession,
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

/**
 * New players by source. Counts BOTH signup lanes (email `signup` and
 * `guest_signup`) in range, grouped by the link tag captured at signup
 * (`meta.src` / `meta.campaign`; no tag = "direct"). `firstFight` = how many of
 * those players have resolved at least one fight (any time), the quickest
 * "did this source bring real players" check.
 */
async function computeAcquisition(range) {
    const groups = await AnalyticsEvent.aggregate([
        { $match: { type: { $in: ["signup", "guest_signup"] }, createdAt: range } },
        {
            $group: {
                _id: {
                    src: { $ifNull: ["$meta.src", "direct"] },
                    campaign: { $ifNull: ["$meta.campaign", null] },
                },
                signups: { $sum: 1 },
                guests: { $sum: { $cond: [{ $eq: ["$type", "guest_signup"] }, 1, 0] } },
                userIds: { $addToSet: "$userId" },
            },
        },
    ]);
    if (groups.length === 0) return [];

    const allUserIds = groups.flatMap((g) => g.userIds);
    const fought = await AnalyticsEvent.aggregate([
        { $match: { type: "fight_resolved", userId: { $in: allUserIds } } },
        { $group: { _id: "$userId" } },
    ]);
    const foughtSet = new Set(fought.map((r) => String(r._id)));

    return groups
        .map((g) => ({
            src: g._id.src,
            campaign: g._id.campaign,
            signups: g.signups,
            guests: g.guests,
            firstFight: g.userIds.filter((id) => foughtSet.has(String(id))).length,
        }))
        .sort((a, b) => b.signups - a.signups || (a.src < b.src ? -1 : 1));
}

// ── First-session funnel (docs/first-session-contract.md D.3) ───────────────

/**
 * @typedef {Object} StageCounts  distinct cohort users reaching each first-session stage
 * @property {number} created         fighter_created
 * @property {number} debutAccepted   fight_accepted, meta.fightNumber 1
 * @property {number} revealWatched   fight_reveal, fightNumber 1, result "watched"
 * @property {number} revealSkipped   fight_reveal, fightNumber 1, result "skipped"
 * @property {number} debutResolved   fight_resolved, fightNumber 1
 * @property {number} fight2Accepted  fight_accepted, fightNumber 2
 * @property {number} fight3Resolved  fight_resolved, fightNumber 3
 * @property {number} returnedD1      any event on created day + 1
 *
 * @typedef {Object} FirstSessionReport
 * @property {number} cohort   distinct users with fighter_created in range
 * @property {StageCounts} stages
 * @property {{phone:StageCounts, desktop:StageCounts, unknown:StageCounts}} byDevice
 * @property {Array<{src:string, campaign:?string} & StageCounts>} bySource  sorted by created desc
 * @property {{n:number, median:?number, p75:?number}} msToBell  debut_step step 5 msSinceStart
 */

const FIRST_SESSION_EVENT_TYPES = Object.freeze(["fight_accepted", "fight_resolved", "fight_reveal", "debut_step"]);
const FIRST_SESSION_DEVICES = Object.freeze(["phone", "desktop", "unknown"]);

function emptyStages() {
    return {
        created: 0, debutAccepted: 0, revealWatched: 0, revealSkipped: 0,
        debutResolved: 0, fight2Accepted: 0, fight3Resolved: 0, returnedD1: 0,
    };
}

/** Nearest-rank percentile over an ascending array; null when empty. */
function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx];
}

/**
 * Pure tally for the first-session funnel (unit-tested with stubbed rows).
 * @param {Array<{userId:*, day:string, device?:string, src?:?string, campaign?:?string}>} cohortRows
 *        one row per cohort user (their first fighter_created)
 * @param {Array<{userId:*, type:string, day:string, fightNumber?:*, result?:*, step?:*, msSinceStart?:*}>} eventRows
 *        the cohort's first-session events (any time), FIRST_SESSION_EVENT_TYPES
 * @param {Array<{userId:*, day:string}>} activityRows  distinct (user, day) activity
 * @returns {FirstSessionReport}
 */
function tallyFirstSession(cohortRows, eventRows, activityRows) {
    const users = new Map(); // userId -> { day, device, src, campaign, flags:Set }
    for (const r of cohortRows || []) {
        const id = String(r.userId);
        if (users.has(id)) continue;
        const device = FIRST_SESSION_DEVICES.includes(r.device) ? r.device : "unknown";
        users.set(id, {
            day: r.day,
            device,
            src: typeof r.src === "string" && r.src ? r.src : "direct",
            campaign: typeof r.campaign === "string" && r.campaign ? r.campaign : null,
            flags: new Set(["created"]),
        });
    }

    const bellMs = new Map(); // userId -> first step-5 msSinceStart
    for (const e of eventRows || []) {
        const u = users.get(String(e.userId));
        if (!u) continue;
        const n = e.fightNumber;
        if (e.type === "fight_accepted") {
            if (n === 1) u.flags.add("debutAccepted");
            else if (n === 2) u.flags.add("fight2Accepted");
        } else if (e.type === "fight_resolved") {
            if (n === 1) u.flags.add("debutResolved");
            else if (n === 3) u.flags.add("fight3Resolved");
        } else if (e.type === "fight_reveal" && n === 1) {
            if (e.result === "watched") u.flags.add("revealWatched");
            else if (e.result === "skipped") u.flags.add("revealSkipped");
        } else if (e.type === "debut_step" && e.step === 5
            && typeof e.msSinceStart === "number" && Number.isFinite(e.msSinceStart)) {
            const id = String(e.userId);
            const prev = bellMs.get(id);
            if (prev === undefined || e.msSinceStart < prev) bellMs.set(id, e.msSinceStart);
        }
    }

    for (const a of activityRows || []) {
        const u = users.get(String(a.userId));
        if (u && a.day === addDays(u.day, 1)) u.flags.add("returnedD1");
    }

    const stages = emptyStages();
    const byDevice = { phone: emptyStages(), desktop: emptyStages(), unknown: emptyStages() };
    const bySourceMap = new Map();
    for (const u of users.values()) {
        const key = `${u.src}\u0000${u.campaign ?? ""}`;
        if (!bySourceMap.has(key)) bySourceMap.set(key, { src: u.src, campaign: u.campaign, ...emptyStages() });
        const targets = [stages, byDevice[u.device], bySourceMap.get(key)];
        for (const flag of u.flags) for (const t of targets) t[flag] += 1;
    }

    const ms = [...bellMs.values()].sort((a, b) => a - b);
    return {
        cohort: users.size,
        stages,
        byDevice,
        bySource: [...bySourceMap.values()].sort(
            (a, b) => b.created - a.created || (a.src < b.src ? -1 : a.src > b.src ? 1 : 0)
        ),
        msToBell: { n: ms.length, median: percentile(ms, 0.5), p75: percentile(ms, 0.75) },
    };
}

/**
 * First-session funnel for fighters created in range (D.3). The cohort is the users with a
 * fighter_created event in range; stages count their events at ANY time.
 * @param {{$gte:Date,$lte:Date}} range
 * @returns {Promise<FirstSessionReport>}
 */
async function computeFirstSession(range) {
    const cohort = await AnalyticsEvent.aggregate([
        { $match: { type: "fighter_created", createdAt: range } },
        { $sort: { createdAt: 1 } },
        {
            $group: {
                _id: "$userId",
                day: { $first: "$day" },
                device: { $first: "$meta.device" },
                src: { $first: "$meta.src" },
                campaign: { $first: "$meta.campaign" },
            },
        },
    ]);
    if (cohort.length === 0) return tallyFirstSession([], [], []);

    const userIds = cohort.map((c) => c._id);
    const [events, activity] = await Promise.all([
        AnalyticsEvent.aggregate([
            { $match: { userId: { $in: userIds }, type: { $in: [...FIRST_SESSION_EVENT_TYPES] } } },
            {
                $project: {
                    _id: 0, userId: 1, type: 1, day: 1,
                    fightNumber: "$meta.fightNumber", result: "$meta.result",
                    step: "$meta.step", msSinceStart: "$meta.msSinceStart",
                },
            },
        ]),
        AnalyticsEvent.aggregate([
            { $match: { userId: { $in: userIds } } },
            { $group: { _id: { userId: "$userId", day: "$day" } } },
            { $project: { _id: 0, userId: "$_id.userId", day: "$_id.day" } },
        ]),
    ]);

    return tallyFirstSession(
        cohort.map((c) => ({ userId: c._id, day: c.day, device: c.device, src: c.src, campaign: c.campaign })),
        events,
        activity
    );
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
// First-session beacons (docs/first-session-contract.md B.6).
const DEBUT_DEVICES = new Set(["phone", "desktop"]);
const REVEAL_RESULTS = new Set(["watched", "skipped"]);
const NEXT_GOAL_CHOICES = new Set(["next_fight", "train"]);
const SECTION_TIP_RESULTS = new Set(["done", "hidden"]);
const MAX_MS_SINCE_START = 2592000000; // 30 days
const { SECTION_TIP_KEYS } = require("../consts/tutorialConfig");
const SECTION_TIP_SET = new Set(SECTION_TIP_KEYS);

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
    debut_step: (m) => (
        intInRange(m.step, 1, 6) && intInRange(m.msSinceStart, 0, MAX_MS_SINCE_START) && DEBUT_DEVICES.has(m.device)
            ? { step: m.step, msSinceStart: m.msSinceStart, device: m.device }
            : null
    ),
    fight_reveal: (m) => (
        REVEAL_RESULTS.has(m.result) && intInRange(m.beatIndex, 0, 500) && intInRange(m.beatsTotal, 0, 500)
            && (m.speed === 1 || m.speed === 2) && intInRange(m.fightNumber, 1, 100000)
            ? { result: m.result, beatIndex: m.beatIndex, beatsTotal: m.beatsTotal, speed: m.speed, fightNumber: m.fightNumber }
            : null
    ),
    next_goal_click: (m) => (
        NEXT_GOAL_CHOICES.has(m.choice) && intInRange(m.fightNumber, 1, 100000)
            ? { choice: m.choice, fightNumber: m.fightNumber }
            : null
    ),
    section_tip: (m) => (
        typeof m.section === "string" && SECTION_TIP_SET.has(m.section) && SECTION_TIP_RESULTS.has(m.result)
            ? { section: m.section, result: m.result }
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
    computeFirstSession,
    tallyFirstSession,
    deviceFromUserAgent,
    CLIENT_EVENT_TYPES,
    sanitizeClientEvent,
    trackClientEvent,
    acquisitionMeta,
};
