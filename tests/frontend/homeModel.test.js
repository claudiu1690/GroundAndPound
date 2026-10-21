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

// ── titleShotStep (passthrough of ranking.titleShot.step) ──────────────────
// The server decides the step from the live fight board; the client only reads it.

test("titleShotStep: returns the server step object as-is", async () => {
    const { titleShotStep } = homeModel;
    const step = { key: "reachTop5", n: 4, rank: 9 };
    assert.equal(titleShotStep({ titleShot: { step } }), step);
    assert.deepEqual(titleShotStep({ titleShot: { step: { key: "getRanked", n: 2 } } }), { key: "getRanked", n: 2 });
});

test("titleShotStep: GCS and champion flags pass through untouched", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep({ titleShot: { step: { key: "ready", gcs: true } } }),
        { key: "ready", gcs: true },
    );
    assert.deepEqual(
        titleShotStep({ titleShot: { step: { key: "winTop5", n: 2, gcs: true, champion: true } } }),
        { key: "winTop5", n: 2, gcs: true, champion: true },
    );
});

test("titleShotStep: does not derive a step from the other titleShot fields", async () => {
    const { titleShotStep } = homeModel;
    // Gates all met, but the server sent no step: hidden, not "ready".
    const ranking = { division: "GCS", titleShot: { mode: "title", ranked: true, topFive: true, winsMet: true, ovrMet: true, gcsTitleWins: 1 } };
    assert.deepEqual(titleShotStep(ranking), { key: "hidden" });
});

test("titleShotStep: missing step is hidden", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep({ titleShot: {} }), { key: "hidden" });
    assert.deepEqual(titleShotStep({ titleShot: { step: null } }), { key: "hidden" });
    assert.deepEqual(titleShotStep({}), { key: "hidden" });
});

test("titleShotStep: null or undefined ranking is hidden", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(null), { key: "hidden" });
    assert.deepEqual(titleShotStep(undefined), { key: "hidden" });
});

// ── gameConstants helpers (display top-5 cutoff, contender flag) ──────────

test("gameConstants: display rank 4 is top 5, display rank 5 is not", async () => {
    const mod = await import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/constants/gameConstants.js")));
    assert.equal(mod.TOP_FIVE_DISPLAY_CUTOFF, 4);
    assert.equal(mod.isTopFiveDisplayRank(1), true);
    assert.equal(mod.isTopFiveDisplayRank(4), true);
    assert.equal(mod.isTopFiveDisplayRank(5), false);
    assert.equal(mod.isTopFiveDisplayRank(null), false);
    assert.equal(mod.isTopFiveDisplayRank(undefined), false);
});

test("gameConstants: isTitleContender prefers the server flag and falls back to pendingPromotion", async () => {
    const mod = await import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/constants/gameConstants.js")));
    assert.equal(mod.TOP_TIER, "GCS");
    assert.equal(mod.isTitleContender({ titleContender: true, pendingPromotion: null, promotionTier: "GCS" }), true);
    assert.equal(mod.isTitleContender({ titleContender: false, pendingPromotion: "National" }), false);
    assert.equal(mod.isTitleContender({ pendingPromotion: "National" }), true);
    assert.equal(mod.isTitleContender({ promotionTier: "GCS" }), false);
    assert.equal(mod.isTitleContender(null), false);
});

test("titleShotProgress: counts met conditions, no nextLabel", async () => {
    const { titleShotProgress } = homeModel;
    assert.deepEqual(titleShotProgress(null), { done: 0, total: 3 });
    assert.deepEqual(
        titleShotProgress({ titleShot: { ovrMet: false, topFive: true, winsMet: false } }),
        { done: 1, total: 3 },
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
