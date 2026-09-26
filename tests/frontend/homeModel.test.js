/**
 * homeModel.js is a plain ESM module under frontend/src (no JSX, no i18n),
 * loaded directly with Node's native loader via pathToFileURL, no Vite/
 * bundler needed. Covers the pure helpers used by the Athlete Page
 * (offer-board-contract.md §5/§7).
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = path.resolve(__dirname, "../../frontend/src/components/dashboard/homeModel.js");

let homeModel;

test("load homeModel.js", async () => {
    homeModel = await import(pathToFileURL(modulePath));
    assert.equal(typeof homeModel.formatTimeLeft, "function");
});

// ── formatTimeLeft ────────────────────────────────────────────────────────

test("formatTimeLeft: null/invalid input returns null", async () => {
    const { formatTimeLeft } = homeModel;
    assert.equal(formatTimeLeft(null), null);
    assert.equal(formatTimeLeft(undefined), null);
    assert.equal(formatTimeLeft("not-a-date"), null);
});

test("formatTimeLeft: past timestamp returns null", async () => {
    const { formatTimeLeft } = homeModel;
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    const past = "2026-01-01T11:00:00.000Z";
    assert.equal(formatTimeLeft(past, now), null);
});

test("formatTimeLeft: future timestamp under an hour formats as minutes", async () => {
    const { formatTimeLeft } = homeModel;
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    const future = "2026-01-01T12:45:00.000Z";
    assert.equal(formatTimeLeft(future, now), "45m");
});

test("formatTimeLeft: future timestamp an hour or more formats as hours", async () => {
    const { formatTimeLeft } = homeModel;
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    const future = "2026-01-02T06:00:00.000Z"; // +18h
    assert.equal(formatTimeLeft(future, now), "18h");
});

// ── rerollButtonState ────────────────────────────────────────────────────

test("rerollButtonState: every rerollBlockedBy value", async () => {
    const { rerollButtonState } = homeModel;

    assert.deepEqual(
        rerollButtonState({ rerollBlockedBy: "frozen", rerollCost: 150 }),
        { visible: false, disabled: true, reasonKey: null, cost: 150 }
    );
    assert.deepEqual(
        rerollButtonState({ rerollBlockedBy: "blocked", rerollCost: 150 }),
        { visible: false, disabled: true, reasonKey: null, cost: 150 }
    );
    assert.deepEqual(
        rerollButtonState({ rerollBlockedBy: "no_board", rerollCost: null }),
        { visible: false, disabled: true, reasonKey: null, cost: null }
    );
    assert.deepEqual(
        rerollButtonState({ rerollBlockedBy: "used", rerollCost: 150 }),
        { visible: true, disabled: true, reasonKey: "used", cost: 150 }
    );
    assert.deepEqual(
        rerollButtonState({ rerollBlockedBy: "cash", rerollCost: 2400 }),
        { visible: true, disabled: true, reasonKey: "cash", cost: 2400 }
    );
    assert.deepEqual(
        rerollButtonState({ rerollBlockedBy: null, rerollCost: 150 }),
        { visible: true, disabled: false, reasonKey: null, cost: 150 }
    );
});

test("rerollButtonState: null/missing offers block degrades safely", async () => {
    const { rerollButtonState } = homeModel;
    assert.deepEqual(rerollButtonState(null), { visible: true, disabled: false, reasonKey: null, cost: null });
    assert.deepEqual(rerollButtonState(undefined), { visible: true, disabled: false, reasonKey: null, cost: null });
});

// ── titleLockKey ──────────────────────────────────────────────────────────

test("titleLockKey: null titleLock returns null", async () => {
    const { titleLockKey } = homeModel;
    assert.equal(titleLockKey(null), null);
    assert.equal(titleLockKey(undefined), null);
});

test("titleLockKey: cooldown takes precedence over rank and wins", async () => {
    const { titleLockKey } = homeModel;
    assert.deepEqual(
        titleLockKey({ cooldownRemaining: 2, winsNeeded: 3, rankNeeded: true }),
        { key: "lockedCooldown", n: 2 }
    );
});

test("titleLockKey: rank takes precedence over wins once cooldown clears", async () => {
    const { titleLockKey } = homeModel;
    assert.deepEqual(
        titleLockKey({ cooldownRemaining: 0, winsNeeded: 3, rankNeeded: true }),
        { key: "lockedRank", n: null }
    );
});

test("titleLockKey: wins needed once ranked top-5 and cooldown clear", async () => {
    const { titleLockKey } = homeModel;
    assert.deepEqual(
        titleLockKey({ cooldownRemaining: 0, winsNeeded: 2, rankNeeded: false }),
        { key: "lockedWins", n: 2 }
    );
});

test("titleLockKey: default when nothing else applies", async () => {
    const { titleLockKey } = homeModel;
    assert.deepEqual(
        titleLockKey({ cooldownRemaining: 0, winsNeeded: 0, rankNeeded: false }),
        { key: "lockedDefault", n: null }
    );
});

// ── bookingRowFlags ───────────────────────────────────────────────────────

test("bookingRowFlags: isMain when the row is the offer-branch hero bout", async () => {
    const { bookingRowFlags } = homeModel;
    const item = { opponentId: "abc123" };
    const heroBout = { source: "offer", opponentId: "abc123" };
    assert.deepEqual(bookingRowFlags(item, heroBout), { isMain: true, isSigned: false });
});

test("bookingRowFlags: isSigned when the row is the accepted fight", async () => {
    const { bookingRowFlags } = homeModel;
    const item = { opponentId: "abc123" };
    const heroBout = { source: "accepted", opponentId: "abc123" };
    assert.deepEqual(bookingRowFlags(item, heroBout), { isMain: false, isSigned: true });
});

test("bookingRowFlags: neither when opponent ids differ or heroBout is null", async () => {
    const { bookingRowFlags } = homeModel;
    const item = { opponentId: "abc123" };
    assert.deepEqual(bookingRowFlags(item, { source: "offer", opponentId: "other" }), { isMain: false, isSigned: false });
    assert.deepEqual(bookingRowFlags(item, null), { isMain: false, isSigned: false });
});

// ── oppStreak ─────────────────────────────────────────────────────────────

test("oppStreak: win/loss/none shapes", async () => {
    const { oppStreak } = homeModel;
    assert.deepEqual(oppStreak({ result: "win", count: 4 }), { key: "win", n: 4 });
    assert.deepEqual(oppStreak({ result: "loss", count: 2 }), { key: "loss", n: 2 });
    assert.deepEqual(oppStreak(null), { key: "none", n: 0 });
    assert.deepEqual(oppStreak({ result: "win", count: 0 }), { key: "none", n: 0 });
});

// ── fighterStreak ─────────────────────────────────────────────────────────

test("fighterStreak: win/loss/none shapes", async () => {
    const { fighterStreak } = homeModel;
    assert.deepEqual(fighterStreak({ winStreak: 3, consecutiveLosses: 0 }), { key: "win", n: 3 });
    assert.deepEqual(fighterStreak({ winStreak: 0, consecutiveLosses: 2 }), { key: "loss", n: 2 });
    assert.deepEqual(fighterStreak({ winStreak: 0, consecutiveLosses: 0 }), { key: "none", n: 0 });
    assert.deepEqual(fighterStreak({}), { key: "none", n: 0 });
});
