/**
 * Unit tests for the additive ranking.titleShot progress fields on the dashboard
 * (mode, ranked, fightsInTier, rankedAfter, displayRank, cooldownRemaining, ovr,
 * ovrTarget). The Home title-shot strip names the FIRST unmet step from these, so an
 * unranked fighter must read "get ranked", not "win 3 more".
 *
 * No DB: buildRanking only touches the already-loaded fighter docs and constants.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const dashboardService = require("../../services/dashboardService");
const rankingService = require("../../services/rankingService");
const fightService = require("../../services/fightService");
const { PROMOTION_TIERS } = require("../../consts/gameConstants");

const { buildRanking } = dashboardService;

/** Public fighter (ranking.rank display-shifted) plus the matching raw doc. */
function fixture(over = {}) {
    const rawRank = Object.prototype.hasOwnProperty.call(over, "rawRank") ? over.rawRank : 4;
    const fightsInTier = over.fightsInTier ?? 6;
    const fighter = {
        promotionTier: over.tier || "Regional Pro",
        overallRating: Object.prototype.hasOwnProperty.call(over, "ovr") ? over.ovr : 40,
        pendingPromotion: over.pendingPromotion ?? null,
        topFiveWinsInTier: over.topFiveWinsInTier ?? 1,
        titleShotCooldown: over.titleShotCooldown,
        gcsTitleWins: over.gcsTitleWins,
        ranking: {
            rank: rankingService.toDisplayRank(rawRank),
            fightsInTier,
        },
    };
    const rawFighter = { ranking: { rank: rawRank, fightsInTier }, gazette: {} };
    return { fighter, rawFighter };
}

async function titleShotFor(over) {
    const { fighter, rawFighter } = fixture(over);
    const ranking = await buildRanking(fighter, rawFighter, "f1");
    return { ranking, titleShot: ranking.titleShot };
}

test("mode per tier: belt tiers and GCS are title, GCS Contender autoPromote", async () => {
    const expected = {
        "Amateur": "title",
        "Regional Pro": "title",
        "National": "title",
        "GCS Contender": "autoPromote",
        "GCS": "title",
    };
    for (const [tier, mode] of Object.entries(expected)) {
        const { titleShot } = await titleShotFor({ tier });
        assert.equal(titleShot.mode, mode, tier);
    }
});

test("mode is derived from the fightService ladder, which covers every tier", () => {
    assert.deepEqual(fightService.TIER_ORDER, Object.keys(PROMOTION_TIERS));
    assert.equal(fightService.TIER_LADDER.length, fightService.TIER_ORDER.length - 1);
    assert.ok(fightService.NO_CHAMPION_TIERS.includes("GCS Contender"));
});

test("ovrTarget per tier is the next tier's minOverall, null on the top tier", async () => {
    const expected = {
        "Amateur": 30,
        "Regional Pro": 45,
        "National": 60,
        "GCS Contender": 62,
        "GCS": null,
    };
    for (const [tier, target] of Object.entries(expected)) {
        const { titleShot } = await titleShotFor({ tier });
        assert.equal(titleShot.ovrTarget, target, tier);
    }
});

test("unranked fighter: ranked false, fightsInTier passes through, rankedAfter 3", async () => {
    const { ranking, titleShot } = await titleShotFor({ rawRank: null, fightsInTier: 1, topFiveWinsInTier: 0 });
    assert.equal(titleShot.ranked, false);
    assert.equal(titleShot.fightsInTier, 1);
    assert.equal(titleShot.rankedAfter, 3);
    assert.equal(titleShot.displayRank, null);
    assert.equal(ranking.rank, null);
    assert.equal(titleShot.topFive, false);
});

test("ranked fighter: ranked true and displayRank equals ranking.rank", async () => {
    const { ranking, titleShot } = await titleShotFor({ rawRank: 4 });
    assert.equal(titleShot.ranked, true);
    assert.equal(ranking.rank, 3);
    assert.equal(titleShot.displayRank, ranking.rank);
});

test("missing fightsInTier defaults to 0", async () => {
    const { fighter, rawFighter } = fixture({ rawRank: null });
    delete fighter.ranking.fightsInTier;
    delete rawFighter.ranking.fightsInTier;
    const { titleShot } = await buildRanking(fighter, rawFighter, "f1");
    assert.equal(titleShot.fightsInTier, 0);
});

test("ranked falls back to the public fighter when the raw read failed", async () => {
    const { fighter } = fixture({ rawRank: 6 });
    const { titleShot } = await buildRanking(fighter, null, "f1");
    assert.equal(titleShot.ranked, true);
    const unranked = fixture({ rawRank: null }).fighter;
    assert.equal((await buildRanking(unranked, null, "f1")).titleShot.ranked, false);
});

test("cooldownRemaining passes through and defaults to 0", async () => {
    assert.equal((await titleShotFor({ titleShotCooldown: 2 })).titleShot.cooldownRemaining, 2);
    assert.equal((await titleShotFor({})).titleShot.cooldownRemaining, 0);
});

test("ovr passes through, null when absent", async () => {
    assert.equal((await titleShotFor({ ovr: 41 })).titleShot.ovr, 41);
    assert.equal((await titleShotFor({ ovr: undefined })).titleShot.ovr, null);
});

test("existing titleShot fields keep their meaning", async () => {
    const { titleShot } = await titleShotFor({
        tier: "Amateur",
        rawRank: 3,
        pendingPromotion: "Regional Pro",
        topFiveWinsInTier: 5,
    });
    assert.equal(titleShot.ovrMet, true);
    assert.equal(titleShot.topFive, true);
    assert.equal(titleShot.winsMet, true);
    assert.equal(titleShot.titleWins, 2);
    assert.equal(titleShot.winsInTier, 2, "capped at titleWins");

    const notMet = (await titleShotFor({ rawRank: 9, topFiveWinsInTier: 1 })).titleShot;
    assert.equal(notMet.ovrMet, false);
    assert.equal(notMet.topFive, false);
    assert.equal(notMet.winsMet, false);
    assert.equal(notMet.winsInTier, 1);
    assert.equal(notMet.titleWins, 3);
});

test("titleShot carries exactly the contract keys", async () => {
    const { titleShot } = await titleShotFor({});
    assert.deepEqual(Object.keys(titleShot).sort(), [
        "cooldownRemaining", "displayRank", "fightsInTier", "gcsTitleWins", "mode", "ovr",
        "ovrMet", "ovrTarget", "ranked", "rankedAfter", "titleWins", "topFive",
        "topFiveCutoff", "winsInTier", "winsMet",
    ]);
});

// ── GCS title shot (docs/gcs-title-contract.md B17, B18) ────────────────────

test("GCS: mode title, ovrMet true with pendingPromotion null, ovrTarget null", async () => {
    const { titleShot } = await titleShotFor({ tier: "GCS", ovr: 80, pendingPromotion: null });
    assert.equal(titleShot.mode, "title");
    assert.equal(titleShot.ovrMet, true);
    assert.equal(titleShot.ovrTarget, null);
    assert.equal(titleShot.titleWins, 3);
});

test("gcsTitleWins passes through, defaults to 0", async () => {
    assert.equal((await titleShotFor({ tier: "GCS" })).titleShot.gcsTitleWins, 0);
    assert.equal((await titleShotFor({ tier: "GCS", gcsTitleWins: 2 })).titleShot.gcsTitleWins, 2);
    assert.equal((await titleShotFor({})).titleShot.gcsTitleWins, 0);
});

test("ovrMet stays false below GCS without a pending promotion", async () => {
    for (const tier of ["Amateur", "Regional Pro", "National", "GCS Contender"]) {
        const { titleShot } = await titleShotFor({ tier, pendingPromotion: null });
        assert.equal(titleShot.ovrMet, false, tier);
    }
});

test("mode none now means an unknown tier only", async () => {
    const { titleShot } = await titleShotFor({ tier: "Backyard" });
    assert.equal(titleShot.mode, "none");
    assert.equal(titleShot.ovrTarget, null);
});
