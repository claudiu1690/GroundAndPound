/**
 * First-session funnel (first-session contract D.3): analyticsService.tallyFirstSession (pure)
 * and computeFirstSession with a stubbed AnalyticsEvent.aggregate. Also: the retention read
 * carries `firstSession`, and authController tracks fighter_created server-side.
 * No DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const AnalyticsEvent = require("../../models/analyticsEventModel");
const analyticsService = require("../../services/analyticsService");

const { tallyFirstSession } = analyticsService;

const ZERO = {
    created: 0, debutAccepted: 0, revealWatched: 0, revealSkipped: 0,
    debutResolved: 0, fight2Accepted: 0, fight3Resolved: 0, returnedD1: 0,
};

test("empty cohort: zeros everywhere, msToBell nulls", () => {
    const r = tallyFirstSession([], [], []);
    assert.deepEqual(r, {
        cohort: 0,
        stages: ZERO,
        byDevice: { phone: ZERO, desktop: ZERO, unknown: ZERO },
        bySource: [],
        msToBell: { n: 0, median: null, p75: null },
    });
});

test("stages count distinct cohort users by fightNumber; non-cohort and legacy events ignored", () => {
    const cohort = [
        { userId: "a", day: "2026-11-10", device: "phone", src: "reddit", campaign: "launch-01" },
        { userId: "b", day: "2026-11-10", device: "desktop" },
        { userId: "c", day: "2026-11-11", device: "weird" },
    ];
    const events = [
        { userId: "a", type: "fight_accepted", day: "2026-11-10", fightNumber: 1 },
        { userId: "a", type: "fight_accepted", day: "2026-11-10", fightNumber: 1 }, // dup counts once
        { userId: "a", type: "fight_reveal", day: "2026-11-10", fightNumber: 1, result: "watched" },
        { userId: "a", type: "fight_resolved", day: "2026-11-10", fightNumber: 1 },
        { userId: "a", type: "fight_accepted", day: "2026-11-10", fightNumber: 2 },
        { userId: "a", type: "fight_resolved", day: "2026-11-11", fightNumber: 3 },
        { userId: "a", type: "debut_step", day: "2026-11-10", step: 5, msSinceStart: 80000 },
        { userId: "b", type: "fight_accepted", day: "2026-11-10", fightNumber: 1 },
        { userId: "b", type: "fight_reveal", day: "2026-11-10", fightNumber: 1, result: "skipped" },
        { userId: "b", type: "fight_reveal", day: "2026-11-10", fightNumber: 2, result: "watched" }, // not the debut
        { userId: "b", type: "debut_step", day: "2026-11-10", step: 5, msSinceStart: 120000 },
        { userId: "b", type: "debut_step", day: "2026-11-10", step: 4, msSinceStart: 1000 },     // not step 5
        { userId: "c", type: "fight_resolved", day: "2026-11-11" },                               // legacy, no fightNumber
        { userId: "zzz", type: "fight_accepted", day: "2026-11-10", fightNumber: 1 },             // not in cohort
    ];
    const activity = [
        { userId: "a", day: "2026-11-11" }, // D1
        { userId: "b", day: "2026-11-12" }, // D2, not D1
        { userId: "c", day: "2026-11-11" }, // same day, not D1
    ];
    const r = tallyFirstSession(cohort, events, activity);
    assert.equal(r.cohort, 3);
    assert.deepEqual(r.stages, {
        created: 3, debutAccepted: 2, revealWatched: 1, revealSkipped: 1,
        debutResolved: 1, fight2Accepted: 1, fight3Resolved: 1, returnedD1: 1,
    });
    assert.equal(r.byDevice.phone.created, 1);
    assert.equal(r.byDevice.phone.returnedD1, 1);
    assert.equal(r.byDevice.desktop.revealSkipped, 1);
    assert.equal(r.byDevice.unknown.created, 1, "unrecognised device folds into unknown");
    assert.deepEqual(r.bySource.map((s) => [s.src, s.campaign, s.created]),
        [["direct", null, 2], ["reddit", "launch-01", 1]]);
    assert.equal(r.bySource[1].fight3Resolved, 1);
    assert.deepEqual(r.msToBell, { n: 2, median: 80000, p75: 120000 });
});

test("computeFirstSession: cohort aggregate, then one events + one activity aggregate; tallies", async () => {
    const calls = [];
    const orig = AnalyticsEvent.aggregate;
    AnalyticsEvent.aggregate = async (pipeline) => {
        calls.push(pipeline);
        const m = pipeline[0].$match;
        if (m.type === "fighter_created") {
            return [{ _id: "u1", day: "2026-11-10", device: "phone", src: "reddit", campaign: null }];
        }
        if (m.type && m.type.$in) {
            assert.deepEqual([...m.type.$in].sort(), ["debut_step", "fight_accepted", "fight_resolved", "fight_reveal"]);
            return [{ userId: "u1", type: "fight_accepted", day: "2026-11-10", fightNumber: 1 }];
        }
        return [{ userId: "u1", day: "2026-11-11" }];
    };
    try {
        const range = { $gte: new Date("2026-11-01"), $lte: new Date("2026-11-30") };
        const r = await analyticsService.computeFirstSession(range);
        assert.equal(calls.length, 3);
        assert.deepEqual(calls[0][0].$match, { type: "fighter_created", createdAt: range });
        assert.equal(r.cohort, 1);
        assert.equal(r.stages.debutAccepted, 1);
        assert.equal(r.stages.returnedD1, 1);
        assert.deepEqual(r.bySource.map((s) => s.src), ["reddit"]);
    } finally {
        AnalyticsEvent.aggregate = orig;
    }
});

test("computeFirstSession: empty cohort skips the follow-up aggregates", async () => {
    let n = 0;
    const orig = AnalyticsEvent.aggregate;
    AnalyticsEvent.aggregate = async () => { n += 1; return []; };
    try {
        const r = await analyticsService.computeFirstSession({ $gte: new Date(0), $lte: new Date() });
        assert.equal(n, 1);
        assert.equal(r.cohort, 0);
    } finally {
        AnalyticsEvent.aggregate = orig;
    }
});

test("computeRetention returns the firstSession block", async () => {
    const orig = AnalyticsEvent.aggregate;
    const origFs = analyticsService.computeFirstSession;
    AnalyticsEvent.aggregate = async () => [];
    analyticsService.computeFirstSession = async () => ({ marker: true });
    try {
        const r = await analyticsService.computeRetention(new Date("2026-11-01"), new Date("2026-11-30"));
        assert.deepEqual(r.firstSession, { marker: true });
    } finally {
        AnalyticsEvent.aggregate = orig;
        analyticsService.computeFirstSession = origFs;
    }
});

test("fighter_created is in the event enum and tracked by register and createGuest", async () => {
    assert.ok(AnalyticsEvent.schema.path("type").enumValues.includes("fighter_created"));
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "controllers", "authController.js"), "utf8");
    assert.equal((src.match(/"fighter_created"/g) || []).length, 2);
});
