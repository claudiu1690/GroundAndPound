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

// ── titleShotStep ─────────────────────────────────────────────────────────

function shot(over) {
    return {
        titleShot: {
            mode: "title", ranked: true, fightsInTier: 5, rankedAfter: 3,
            displayRank: 3, cooldownRemaining: 0, ovr: 55, ovrTarget: 50,
            ovrMet: true, topFive: true, winsMet: true, winsInTier: 3, titleWins: 3,
            ...over,
        },
    };
}

test("titleShotStep: no ranking or no titleShot is hidden", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(null), { key: "hidden" });
    assert.deepEqual(titleShotStep(undefined), { key: "hidden" });
    assert.deepEqual(titleShotStep({}), { key: "hidden" });
});

test("titleShotStep: mode none is hidden", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(shot({ mode: "none" })), { key: "hidden" });
});

test("titleShotStep: autoPromote carries the OVR target and beats cooldown", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ mode: "autoPromote", ovrTarget: 62, cooldownRemaining: 2 })),
        { key: "autoPromote", n: 62 }
    );
});

test("titleShotStep: autoPromote at or above the target says the next fight promotes", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ mode: "autoPromote", ovr: 64, ovrTarget: 62 })),
        { key: "autoPromoteNextFight" }
    );
    assert.deepEqual(
        titleShotStep(shot({ mode: "autoPromote", ovr: 62, ovrTarget: 62 })),
        { key: "autoPromoteNextFight" }
    );
    assert.deepEqual(
        titleShotStep(shot({ mode: "autoPromote", ovr: 61, ovrTarget: 62 })),
        { key: "autoPromote", n: 62 }
    );
});

test("titleShotStep: cooldown wins over every other unmet step", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ cooldownRemaining: 2, ranked: false, topFive: false, winsMet: false, ovrMet: false })),
        { key: "rematch", n: 2 }
    );
});

test("titleShotStep: unranked National fighter must get ranked first", async () => {
    const { titleShotStep } = homeModel;
    const unranked = { ranked: false, displayRank: null, topFive: false, winsMet: false, ovrMet: false, winsInTier: 0 };
    assert.deepEqual(titleShotStep(shot({ ...unranked, fightsInTier: 0 })), { key: "getRanked", n: 3 });
    assert.deepEqual(titleShotStep(shot({ ...unranked, fightsInTier: 2 })), { key: "getRanked", n: 1 });
    // Never below 1, even if the counter overshoots.
    assert.deepEqual(titleShotStep(shot({ ...unranked, fightsInTier: 9 })), { key: "getRanked", n: 1 });
});

test("titleShotStep: ranked outside the top 5 must reach it", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ displayRank: 9, topFive: false, winsMet: false, winsInTier: 0, topFiveCutoff: 4 })),
        { key: "reachTop5", n: 4, rank: 9 }
    );
    assert.deepEqual(
        titleShotStep(shot({ displayRank: null, topFive: false, topFiveCutoff: 4 })),
        { key: "reachTop5", n: 4, rank: null }
    );
});

test("titleShotStep: display #5 is outside the top 5, so it must climb to 4", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ displayRank: 5, topFive: false, topFiveCutoff: 4 })),
        { key: "reachTop5", n: 4, rank: 5 }
    );
});

test("titleShotStep: reachTop5 uses topFiveCutoff when given and falls back to 4 without it", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ displayRank: 7, topFive: false, topFiveCutoff: 5 })),
        { key: "reachTop5", n: 5, rank: 7 }
    );
    assert.deepEqual(
        titleShotStep(shot({ displayRank: 7, topFive: false })),
        { key: "reachTop5", n: 4, rank: 7 }
    );
});

test("titleShotStep: in the top 5 with 1 of 3 wins needs 2 more", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ winsMet: false, winsInTier: 1, titleWins: 3 })),
        { key: "winTop5", n: 2 }
    );
});

test("titleShotStep: wins met but OVR not asks for the OVR target", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ ovrMet: false, ovr: 50, ovrTarget: 55 })),
        { key: "reachOvr", n: 55 }
    );
});

test("titleShotStep: OVR at the target but ovrMet still false says the next fight locks it in", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ ovrMet: false, ovr: 55, ovrTarget: 55 })),
        { key: "lockInOvr" }
    );
    assert.deepEqual(
        titleShotStep(shot({ ovrMet: false, ovr: 60, ovrTarget: 55 })),
        { key: "lockInOvr" }
    );
});

test("titleShotStep: ready is blocked when OVR fell below the target", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(shot({ ovrMet: true, ovr: 48, ovrTarget: 55 })),
        { key: "reachOvr", n: 55 }
    );
});

test("titleShotStep: ready when there is no OVR target", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(shot({ ovrMet: true, ovr: 10, ovrTarget: null })), { key: "ready" });
});

test("titleShotStep: everything met is ready", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(shot({})), { key: "ready" });
});

test("titleShotStep: old payload without the new fields keeps the old behaviour", async () => {
    const { titleShotStep } = homeModel;
    const old = (over) => ({ titleShot: { ovrMet: true, topFive: true, winsMet: true, winsInTier: 3, titleWins: 3, ...over } });
    assert.deepEqual(titleShotStep(old({ winsMet: false, winsInTier: 1 })), { key: "winTop5", n: 2 });
    assert.deepEqual(titleShotStep(old({})), { key: "ready" });
});

// GCS title shot (docs/gcs-title-contract.md F11). The GCS flags are added only
// when true so every lower-tier result above keeps its exact shape.

function gcsRanking(over, division = "GCS") {
    return { division, ...shot({ ovrMet: true, ovrTarget: null, ...over }) };
}

test("titleShotStep: GCS ready carries gcs true", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(gcsRanking({})), { key: "ready", gcs: true });
});

test("titleShotStep: GCS champion still banking top-5 wins carries champion true", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(
        titleShotStep(gcsRanking({ winsMet: false, winsInTier: 1, titleWins: 3, gcsTitleWins: 1 })),
        { key: "winTop5", n: 2, gcs: true, champion: true },
    );
    assert.deepEqual(
        titleShotStep(gcsRanking({ winsMet: false, winsInTier: 2, titleWins: 3, gcsTitleWins: 2 })),
        { key: "winTop5", n: 1, gcs: true, champion: true },
    );
});

test("titleShotStep: GCS fighter who never won the belt is not a champion", async () => {
    const { titleShotStep } = homeModel;
    const step = titleShotStep(gcsRanking({ winsMet: false, winsInTier: 0, gcsTitleWins: 0 }));
    assert.equal(step.key, "winTop5");
    assert.equal(step.gcs, true);
    assert.equal("champion" in step, false);
});

test("titleShotStep: GCS keeps the step order (cooldown, unranked, top 5 before wins)", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(gcsRanking({ cooldownRemaining: 2, gcsTitleWins: 1 })), { key: "rematch", n: 2, gcs: true, champion: true });
    assert.equal(titleShotStep(gcsRanking({ topFive: false, displayRank: 6, topFiveCutoff: 4 })).key, "reachTop5");
});

test("titleShotStep: GCS payload without gcsTitleWins (older backend) is ready with no champion flag", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(gcsRanking({ gcsTitleWins: undefined })), { key: "ready", gcs: true });
});

test("titleShotStep: lower tiers never carry GCS flags", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(gcsRanking({}, "National")), { key: "ready" });
    assert.deepEqual(titleShotStep(gcsRanking({}, "GCS Contender")), { key: "ready" });
});

test("titleShotStep: GCS mode none is still hidden", async () => {
    const { titleShotStep } = homeModel;
    assert.deepEqual(titleShotStep(gcsRanking({ mode: "none", gcsTitleWins: 1 })), { key: "hidden" });
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
    assert.deepEqual(titleShotProgress(shot({ ovrMet: false, winsMet: false })), { done: 1, total: 3 });
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
