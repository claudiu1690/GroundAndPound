/**
 * QA coverage for homeCampService's condition-decay idempotency (contract §1.1
 * / §6 Q1: "the decay job run repeatedly in one day, the lazy read path, and a
 * training session in the same day must not compound").
 *
 * Pure unit tests against applyIdleNeglect / applySessionConditionDelta —
 * both operate on a plain camp-shaped object (no Mongoose doc required), so
 * no DB harness is needed. This mirrors the pure-helper style already used in
 * tests/services/trainingService.batch.test.js.
 *
 * Run with: node --test tests/services/homeCampService.condition.qa.test.js
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const homeCampService = require("../../services/homeCampService");
const { NEGLECT_PER_IDLE_DAY, NEGLECT_MAX_CATCHUP_DAYS, CONDITION_MAX } = require("../../consts/homeCampConfig");

function makeCamp(overrides = {}) {
    return {
        condition: {
            value: CONDITION_MAX,
            lastNeglectAt: new Date("2026-01-01T00:00:00.000Z"),
            lastNeglectDayKey: null,
            lastSessionDayKey: null,
            ...overrides,
        },
    };
}

// ── First sight (new/legacy doc) never retro-decays ──────────────────────────
test("applyIdleNeglect: first sight (no lastNeglectDayKey) anchors to today, zero decay", () => {
    const camp = makeCamp({ lastNeglectDayKey: null, value: CONDITION_MAX });
    const now = new Date("2026-03-10T12:00:00.000Z");
    const tick = homeCampService.applyIdleNeglect(camp, now);
    assert.equal(tick.points, 0);
    assert.equal(tick.decayedDays, 0);
    assert.equal(camp.condition.lastNeglectDayKey, "2026-03-10");
    assert.equal(camp.condition.value, CONDITION_MAX);
});

// ── Running 5x in one day applies decay ONCE ──────────────────────────────────
test("applyIdleNeglect: running 5x on the same day after a 1-idle-day gap applies -2 exactly once", () => {
    const camp = makeCamp({ lastNeglectDayKey: "2026-03-09", value: 72 });
    const now = new Date("2026-03-10T08:00:00.000Z");

    const first = homeCampService.applyIdleNeglect(camp, now);
    assert.equal(first.points, NEGLECT_PER_IDLE_DAY);
    assert.equal(camp.condition.value, 70);

    // Simulate the daily job firing 4 more times the same UTC day, plus the
    // lazy read tick firing on every subsequent request.
    for (let i = 0; i < 4; i++) {
        const later = new Date(now.getTime() + (i + 1) * 3_600_000);
        const tick = homeCampService.applyIdleNeglect(camp, later);
        assert.equal(tick.points, 0, `run ${i + 2} must be a no-op`);
        assert.equal(tick.changed, false);
    }
    assert.equal(camp.condition.value, 70, "condition must still be exactly -2, not -10");
});

// ── A session today suppresses today's neglect ────────────────────────────────
test("applyIdleNeglect: a session logged today suppresses neglect for today", () => {
    const camp = makeCamp({ lastNeglectDayKey: "2026-03-09", lastSessionDayKey: "2026-03-09", value: 72 });
    const now = new Date("2026-03-10T09:00:00.000Z");
    const tick = homeCampService.applyIdleNeglect(camp, now);
    // Window is [2026-03-09, 2026-03-10) — the single day in that window equals
    // lastSessionDayKey, so it must be suppressed entirely.
    assert.equal(tick.decayedDays, 0);
    assert.equal(tick.points, 0);
    assert.equal(camp.condition.value, 72);
});

// ── An active day (session run) suppresses that day's neglect on a later tick ─
test("an active day (session run) yields no same-day decay on a later lazy read", () => {
    // lastNeglectDayKey = "2026-03-10" models ensureCamp's own tick already having
    // run once that morning (a same-day no-op) BEFORE the player trains later that day.
    const camp = makeCamp({ lastNeglectDayKey: "2026-03-10", value: 72 });
    // Player trains on 2026-03-10 — applySessionConditionDelta stamps lastSessionDayKey.
    const trainAt = new Date("2026-03-10T10:00:00.000Z");
    homeCampService.applySessionConditionDelta(camp, -1, trainAt);
    assert.equal(camp.condition.lastSessionDayKey, "2026-03-10");
    assert.equal(camp.condition.value, 71, "the drill's own -1 condDelta still applies");

    // A lazy read tick the *next* day must not additionally charge 03-10 as an
    // idle neglect day, because it was a session day.
    const nextDay = new Date("2026-03-11T09:00:00.000Z");
    const tick = homeCampService.applyIdleNeglect(camp, nextDay);
    assert.equal(tick.decayedDays, 0, "03-10 was a session day and must not be charged as idle");
    assert.equal(camp.condition.value, 71, "value must be unchanged by the neglect tick");
});

// ── Catch-up cap: NEGLECT_MAX_CATCHUP_DAYS ceiling on a single lazy tick ──────
test("applyIdleNeglect: a 60-day-idle catch-up is capped at NEGLECT_MAX_CATCHUP_DAYS", () => {
    const camp = makeCamp({ lastNeglectDayKey: "2026-01-01", value: CONDITION_MAX });
    const now = new Date("2026-03-02T00:00:00.000Z"); // 60 days later
    const tick = homeCampService.applyIdleNeglect(camp, now);
    assert.equal(tick.decayedDays, NEGLECT_MAX_CATCHUP_DAYS);
    assert.equal(tick.points, NEGLECT_MAX_CATCHUP_DAYS * NEGLECT_PER_IDLE_DAY);
    // Value must be floored at 0, never negative.
    assert.ok(camp.condition.value >= 0);
});

test("applyIdleNeglect: value never goes below 0 even with a huge idle gap", () => {
    const camp = makeCamp({ lastNeglectDayKey: "2020-01-01", value: 10 });
    const now = new Date("2026-03-02T00:00:00.000Z");
    homeCampService.applyIdleNeglect(camp, now);
    assert.equal(camp.condition.value, 0);
});

// ── Same-day call (diff <= 0) is always a no-op, regardless of value ──────────
test("applyIdleNeglect: calling again later the same UTC day is a no-op", () => {
    const camp = makeCamp({ lastNeglectDayKey: "2026-03-10", value: 50 });
    const tick = homeCampService.applyIdleNeglect(camp, new Date("2026-03-10T23:59:00.000Z"));
    assert.equal(tick.changed, false);
    assert.equal(camp.condition.value, 50);
});
