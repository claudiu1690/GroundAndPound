/**
 * ranking.titleShot.step: THE single source of truth for the Home title-shot strip
 * (dashboardService.buildTitleShotStep, fed by buildRanking with the live board), plus
 * rankingService.npcDisplayRank, the one rule for an NPC's display rank.
 *
 * The rule cases were ported from the frontend homeModel tests when the rule moved to
 * the server; the frontend now only passes the step through.
 *
 * No DB: buildRanking reads only the loaded docs, the board passed in and constants.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const dashboardService = require("../../services/dashboardService");
const rankingService = require("../../services/rankingService");
const fightService = require("../../services/fightService");

const { buildTitleShotStep, openTitleOffer, buildRanking, computeHeroAction } = dashboardService;

// ── buildTitleShotStep: rule cases (ported from tests/frontend/homeModel.test.js) ──

/** Every gate met, Regional-Pro-like numbers; override per case. */
function shot(over) {
    return {
        mode: "title", ranked: true, fightsInTier: 5, rankedAfter: 3, fightsToRank: 0,
        displayRank: 3, cooldownRemaining: 0, ovr: 55, ovrTarget: 50, topFiveCutoff: 4,
        ovrMet: true, topFive: true, winsMet: true, winsInTier: 3, titleWins: 3,
        gcsTitleWins: 0, division: "Regional Pro", acceptableOffers: [],
        ...over,
    };
}

test("step: mode none is hidden; empty input is hidden", () => {
    assert.deepEqual(buildTitleShotStep(shot({ mode: "none" })), { key: "hidden" });
    assert.deepEqual(buildTitleShotStep(null), { key: "hidden" });
});

test("step: autoPromote carries the OVR target and beats cooldown", () => {
    assert.deepEqual(
        buildTitleShotStep(shot({ mode: "autoPromote", ovr: 55, ovrTarget: 62, cooldownRemaining: 2 })),
        { key: "autoPromote", n: 62 },
    );
});

test("step: autoPromote at or above the target says the next fight promotes", () => {
    assert.deepEqual(buildTitleShotStep(shot({ mode: "autoPromote", ovr: 64, ovrTarget: 62 })), { key: "autoPromoteNextFight" });
    assert.deepEqual(buildTitleShotStep(shot({ mode: "autoPromote", ovr: 62, ovrTarget: 62 })), { key: "autoPromoteNextFight" });
    assert.deepEqual(buildTitleShotStep(shot({ mode: "autoPromote", ovr: 61, ovrTarget: 62 })), { key: "autoPromote", n: 62 });
});

test("step: cooldown wins over every other unmet gate", () => {
    assert.deepEqual(
        buildTitleShotStep(shot({ cooldownRemaining: 2, ranked: false, topFive: false, winsMet: false, ovrMet: false })),
        { key: "rematch", n: 2 },
    );
});

test("step: unranked must get ranked first, n is fightsToRank", () => {
    const unranked = { ranked: false, displayRank: null, topFive: false, winsMet: false, ovrMet: false, winsInTier: 0 };
    assert.deepEqual(buildTitleShotStep(shot({ ...unranked, fightsToRank: 3 })), { key: "getRanked", n: 3 });
    assert.deepEqual(buildTitleShotStep(shot({ ...unranked, fightsToRank: 1 })), { key: "getRanked", n: 1 });
});

test("step: ranked outside the top 5 must reach the cutoff", () => {
    assert.deepEqual(
        buildTitleShotStep(shot({ displayRank: 9, topFive: false, winsMet: false, winsInTier: 0 })),
        { key: "reachTop5", n: 4, rank: 9 },
    );
    assert.deepEqual(buildTitleShotStep(shot({ displayRank: 5, topFive: false })), { key: "reachTop5", n: 4, rank: 5 });
    assert.deepEqual(buildTitleShotStep(shot({ displayRank: null, topFive: false })), { key: "reachTop5", n: 4, rank: null });
});

test("step: in the top 5 with 1 of 3 wins needs 2 more", () => {
    assert.deepEqual(buildTitleShotStep(shot({ winsMet: false, winsInTier: 1, titleWins: 3 })), { key: "winTop5", n: 2 });
});

test("step: wins met but not a contender asks for the OVR target, or says lock it in", () => {
    assert.deepEqual(buildTitleShotStep(shot({ ovrMet: false, ovr: 50, ovrTarget: 55 })), { key: "reachOvr", n: 55 });
    assert.deepEqual(buildTitleShotStep(shot({ ovrMet: false, ovr: 55, ovrTarget: 55 })), { key: "lockInOvr" });
    assert.deepEqual(buildTitleShotStep(shot({ ovrMet: false, ovr: 60, ovrTarget: 55 })), { key: "lockInOvr" });
});

test("step: a stale contender below the target reads reachOvr, not ready", () => {
    assert.deepEqual(buildTitleShotStep(shot({ ovrMet: true, ovr: 48, ovrTarget: 55 })), { key: "reachOvr", n: 55 });
});

test("step: ready with no OVR target, and when everything is met", () => {
    assert.deepEqual(buildTitleShotStep(shot({ ovr: 10, ovrTarget: null })), { key: "ready" });
    assert.deepEqual(buildTitleShotStep(shot({})), { key: "ready" });
});

test("step: an open title offer is ready even with gates unmet; a locked one never is", () => {
    const open = [{ type: "TitleShot", locked: false, acceptable: true }];
    assert.deepEqual(buildTitleShotStep(shot({ ovrMet: true, ovr: 40, ovrTarget: 55, acceptableOffers: open })), { key: "ready" });
    const locked = [{ type: "TitleShot", locked: true, acceptable: false }];
    assert.deepEqual(buildTitleShotStep(shot({ winsMet: false, winsInTier: 1, acceptableOffers: locked })), { key: "winTop5", n: 2 });
});

// ── GCS flags ────────────────────────────────────────────────────────────────

function gcs(over) {
    return shot({ division: "GCS", ovrTarget: null, ...over });
}

test("GCS: ready carries gcs true; champion only once the belt was won", () => {
    assert.deepEqual(buildTitleShotStep(gcs({})), { key: "ready", gcs: true });
    assert.deepEqual(
        buildTitleShotStep(gcs({ winsMet: false, winsInTier: 1, gcsTitleWins: 1 })),
        { key: "winTop5", n: 2, gcs: true, champion: true },
    );
    const never = buildTitleShotStep(gcs({ winsMet: false, winsInTier: 0, gcsTitleWins: 0 }));
    assert.equal(never.gcs, true);
    assert.equal("champion" in never, false);
});

test("GCS: step order holds (cooldown, then top 5 before wins)", () => {
    assert.deepEqual(buildTitleShotStep(gcs({ cooldownRemaining: 2, gcsTitleWins: 1 })), { key: "rematch", n: 2, gcs: true, champion: true });
    assert.equal(buildTitleShotStep(gcs({ topFive: false, displayRank: 6 })).key, "reachTop5");
});

test("GCS flags appear only when true, never on hidden, never below GCS", () => {
    assert.deepEqual(buildTitleShotStep(gcs({ mode: "none", gcsTitleWins: 1 })), { key: "hidden" });
    assert.deepEqual(buildTitleShotStep(shot({ division: "National" })), { key: "ready" });
    assert.deepEqual(buildTitleShotStep(shot({ division: "GCS Contender" })), { key: "ready" });
    const flags = buildTitleShotStep(shot({ division: "National", gcsTitleWins: 0 }));
    assert.equal("gcs" in flags, false);
    assert.equal("champion" in flags, false);
});

// ── openTitleOffer ───────────────────────────────────────────────────────────

test("openTitleOffer: the unlocked TitleShot or null; junk tolerated", () => {
    const t = { type: "TitleShot", locked: false };
    assert.equal(openTitleOffer([{ type: "Easy" }, null, t]), t);
    assert.equal(openTitleOffer([{ type: "TitleShot", locked: true }]), null);
    assert.equal(openTitleOffer(null), null);
    assert.equal(openTitleOffer("nope"), null);
});

// ── buildRanking with a board ────────────────────────────────────────────────

const ANSWERED = { generatedAt: "2026-10-21T10:00:00.000Z", blockedCode: null, frozen: false };

/** Public + raw fighter docs for a ranked National fighter with every gate met. */
function docs(over = {}) {
    const has = (k) => Object.prototype.hasOwnProperty.call(over, k);
    const rawRank = has("rawRank") ? over.rawRank : 3;
    const fighter = {
        promotionTier: over.tier || "National",
        overallRating: over.ovr ?? 65,
        pendingPromotion: has("pending") ? over.pending : "GCS Contender",
        topFiveWinsInTier: over.topFiveWins ?? 3,
        titleShotCooldown: over.cooldown ?? 0,
        gcsTitleWins: over.gcsTitleWins ?? 0,
        ranking: { rank: rankingService.toDisplayRank(rawRank), fightsInTier: 6 },
    };
    return { fighter, rawFighter: { ranking: { rank: rawRank, fightsInTier: 6 }, gazette: {} } };
}

function board(offers, meta = ANSWERED) {
    return { offers, acceptableOffers: offers.filter((o) => o && o.acceptable), meta };
}

const EASY = { type: "Easy", acceptable: true };
const OPEN_TITLE = { type: "TitleShot", locked: false, acceptable: true, titleShotMeta: { titleDefense: false } };
const LOCKED_TITLE = { type: "TitleShot", locked: true, acceptable: false };

async function titleShotWith(over, b) {
    const { fighter, rawFighter } = docs(over);
    return (await buildRanking(fighter, rawFighter, "f1", b)).titleShot;
}

test("open acceptable title offer with OVR below target: ready, and ovrMet true", async () => {
    const ts = await titleShotWith({ ovr: 55 }, board([EASY, OPEN_TITLE]));
    assert.deepEqual(ts.step, { key: "ready" });
    assert.equal(ts.ovrMet, true);
});

test("board without a title slot, stale pendingPromotion, OVR below target: reachOvr and ovrMet false", async () => {
    const ts = await titleShotWith({ ovr: 55, pending: "GCS Contender" }, board([EASY]));
    assert.equal(ts.ovrMet, false, "board-derived, not isTitleContender");
    assert.deepEqual(ts.step, { key: "reachOvr", n: 60 });
});

test("frozen board with every gate met: ready via the gates, while the hero is not title_shot", async () => {
    const b = board([{ ...EASY, acceptable: false }, { ...OPEN_TITLE, acceptable: false }], { ...ANSWERED, frozen: true });
    const ts = await titleShotWith({}, b);
    assert.equal(ts.ovrMet, true, "the title slot is on the board");
    assert.deepEqual(ts.step, { key: "ready" });
    assert.notEqual(computeHeroAction({ offers: b.acceptableOffers }).key, "title_shot");
});

test("injury-blocked board with gates met: ready, ovrMet from the fighter", async () => {
    const blocked = board([], { generatedAt: null, blockedCode: "INJURY" });
    const contender = await titleShotWith({}, blocked);
    assert.equal(contender.ovrMet, true);
    assert.deepEqual(contender.step, { key: "ready" });
    const notContender = await titleShotWith({ pending: null, ovr: 55 }, blocked);
    assert.equal(notContender.ovrMet, false);
    assert.deepEqual(notContender.step, { key: "reachOvr", n: 60 });
});

test("a board that did not answer (no generatedAt) falls back to isTitleContender", async () => {
    const ts = await titleShotWith({}, board([EASY], { generatedAt: null, blockedCode: null }));
    assert.equal(ts.ovrMet, true);
});

test("locked title card: the gate step, never ready", async () => {
    const cases = [
        [{ cooldown: 2 }, "rematch"],
        [{ rawRank: 9 }, "reachTop5"],
        [{ topFiveWins: 1 }, "winTop5"],
    ];
    for (const [over, key] of cases) {
        const ts = await titleShotWith(over, board([EASY, LOCKED_TITLE]));
        assert.equal(ts.step.key, key, JSON.stringify(over));
        assert.equal(ts.ovrMet, true);
    }
});

test("GCS via buildRanking: gcs and champion flags only when true", async () => {
    const first = await titleShotWith({ tier: "GCS", pending: null, ovr: 80, topFiveWins: 0 }, board([EASY]));
    assert.deepEqual(first.step, { key: "winTop5", n: 3, gcs: true });
    const holder = await titleShotWith({ tier: "GCS", pending: null, ovr: 80, gcsTitleWins: 1 }, board([EASY, OPEN_TITLE]));
    assert.deepEqual(holder.step, { key: "ready", gcs: true, champion: true });
    const lower = await titleShotWith({}, board([EASY, OPEN_TITLE]));
    assert.deepEqual(lower.step, { key: "ready" });
});

test("computeHeroAction and the step agree on 4 boards", async () => {
    const boards = [
        ["open title", board([EASY, OPEN_TITLE]), true],
        ["locked title", board([EASY, LOCKED_TITLE]), false],
        ["no title", board([EASY]), false],
        ["frozen title", board([{ ...EASY, acceptable: false }, { ...OPEN_TITLE, acceptable: false }], { ...ANSWERED, frozen: true }), false],
    ];
    for (const [name, b, heroTitle] of boards) {
        // Gates unmet (1 of 3 wins), so only an open title offer can make the step ready.
        const ts = await titleShotWith({ topFiveWins: 1 }, b);
        const hero = computeHeroAction({ offers: b.acceptableOffers });
        assert.equal(hero.key === "title_shot", heroTitle, name);
        assert.equal(ts.step.key === "ready", heroTitle, name);
    }
});

test("no board argument: no acceptable offers, ovrMet is isTitleContender", async () => {
    const { fighter, rawFighter } = docs({ topFiveWins: 1 });
    const ts = (await buildRanking(fighter, rawFighter, "f1")).titleShot;
    assert.equal(ts.ovrMet, fightService.isTitleContender(fighter));
    assert.deepEqual(ts.step, { key: "winTop5", n: 2 });
});

// ── rankingService.npcDisplayRank ────────────────────────────────────────────

test("npcDisplayRank: the Rankings-tab number", () => {
    const T = "Regional Pro";
    const cases = [
        // [fixedRank, npcTier, playerTier, playerInternalRank, expected, why]
        [1, T, T, 4, null, "champion"],
        [1, T, T, null, null, "champion, unranked player"],
        [3, T, T, 6, 2, "same tier, above the player: unshifted"],
        [6, T, T, 6, 6, "same tier, at the player's rank: shifts down one"],
        [9, T, T, 6, 9, "same tier, below the player: shifts down one"],
        [9, T, T, null, 8, "unranked player: no shift"],
        [9, "National", T, 6, 8, "cross tier: never shifted"],
        [2, "National", T, 2, 1, "cross tier top contender"],
        [null, T, T, 6, null, "non-number fixedRank"],
        [undefined, T, T, 6, null, "missing fixedRank"],
        ["7", T, T, 6, null, "string fixedRank"],
    ];
    for (const [fixed, npcTier, playerTier, playerRank, expected, why] of cases) {
        assert.equal(rankingService.npcDisplayRank(fixed, npcTier, playerTier, playerRank), expected, why);
    }
});
