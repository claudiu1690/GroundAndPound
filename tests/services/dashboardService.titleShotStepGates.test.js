/**
 * QA cross-check: the Home title-shot strip step (ranking.titleShot.step, built by the
 * real dashboardService.buildRanking) against the real server gates in fightService
 * (titleShotEligibility, checkPromotion, the pickOfferSlots pendingPromotion rule).
 *
 * Two paths: the no-board path (buildRanking without a board: ovrMet falls back to
 * fightService.isTitleContender) and a board-fed path (a fake board that carries a
 * TitleShot slot exactly when pickOfferSlots would, locked per titleShotEligibility).
 * The step is read from the backend result; the frontend only passes it through.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const dashboardService = require("../../services/dashboardService");
const fightService = require("../../services/fightService");
const rankingService = require("../../services/rankingService");

/**
 * The fake board pickOfferSlots + hydrateOffers would serve this fighter: three
 * difficulty slots, plus the TitleShot when the fighter is a contender, locked per
 * titleShotEligibility and acceptable only when unlocked. Meta says the board answered.
 */
function fakeBoardFor(doc) {
    const offers = ["Easy", "Even", "Hard"].map((type) => ({ type, acceptable: true, opponent: { _id: type } }));
    if (fightService.isTitleContender(doc)) {
        const elig = fightService.titleShotEligibility(doc);
        offers.push({ type: "TitleShot", locked: elig.locked, acceptable: !elig.locked, opponent: { _id: "champ" } });
    }
    return {
        offers,
        acceptableOffers: offers.filter((o) => o.acceptable),
        meta: { generatedAt: new Date().toISOString(), blockedCode: null },
    };
}

async function stepFor(state, { withBoard = false } = {}) {
    const rawRank = state.rawRank;
    const fightsInTier = state.fightsInTier ?? 6;
    const doc = {
        promotionTier: state.tier,
        overallRating: state.ovr,
        pendingPromotion: state.pending ?? null,
        topFiveWinsInTier: state.topFiveWins ?? 0,
        titleShotCooldown: state.cooldown ?? 0,
        ranking: { rank: rawRank, fightsInTier },
    };
    const publicFighter = { ...doc, ranking: { rank: rankingService.toDisplayRank(rawRank), fightsInTier } };
    const raw = { ranking: { rank: rawRank, fightsInTier }, gazette: {} };
    const board = withBoard ? fakeBoardFor(doc) : undefined;
    const ranking = await dashboardService.buildRanking(publicFighter, raw, "f", board);
    return { step: ranking.titleShot.step, doc, ranking, board };
}

const hasUnlockedTitle = (board) => board.offers.some((o) => o.type === "TitleShot" && !o.locked);

const BELT_TIERS = ["Amateur", "Regional Pro", "National"];

test("sweep (no board): strip says ready exactly when the server would offer an UNLOCKED title shot", async () => {
    const bad = [];
    for (const tier of BELT_TIERS) {
        const entry = fightService.TIER_LADDER.find((t) => t.from === tier);
        const titleWins = fightService.getTitleShotConfig(tier).titleWins;
        // Consistent pending: set iff OVR reaches the target (what checkPromotion guarantees after a fight).
        for (const ovr of [entry.minOverall - 1, entry.minOverall, entry.minOverall + 5]) {
            for (const rawRank of [null, 2, 5, 6, 12]) {
                for (const topFiveWins of [0, titleWins - 1, titleWins]) {
                    for (const cooldown of [0, 1, 2]) {
                        const pending = ovr >= entry.minOverall ? entry.to : null;
                        const { step, doc } = await stepFor({ tier, ovr, rawRank, topFiveWins, cooldown, pending });
                        const elig = fightService.titleShotEligibility(doc);
                        const offeredUnlocked = !!pending && !elig.locked;
                        if ((step.key === "ready") !== offeredUnlocked) {
                            bad.push({ tier, ovr, rawRank, topFiveWins, cooldown, step: step.key, offeredUnlocked });
                        }
                    }
                }
            }
        }
    }
    assert.deepEqual(bad, []);
});

test("sweep (no board): every non-ready step names a gate that really is unmet, in server order", async () => {
    const bad = [];
    for (const tier of BELT_TIERS) {
        const entry = fightService.TIER_LADDER.find((t) => t.from === tier);
        const titleWins = fightService.getTitleShotConfig(tier).titleWins;
        for (const ovr of [entry.minOverall - 1, entry.minOverall + 2]) {
            for (const rawRank of [null, 2, 5, 6, 12]) {
                for (const topFiveWins of [0, titleWins - 1, titleWins]) {
                    for (const cooldown of [0, 2]) {
                        const pending = ovr >= entry.minOverall ? entry.to : null;
                        const { step, doc } = await stepFor({ tier, ovr, rawRank, topFiveWins, cooldown, pending });
                        const topFive = rankingService.isTopFive(doc);
                        const winsMet = topFiveWins >= titleWins;
                        let expected;
                        if (cooldown > 0) expected = "rematch";
                        else if (rawRank == null) expected = "getRanked";
                        else if (!topFive) expected = "reachTop5";
                        else if (!winsMet) expected = "winTop5";
                        else if (!pending) expected = "reachOvr";
                        else expected = "ready";
                        if (step.key !== expected) bad.push({ tier, ovr, rawRank, topFiveWins, cooldown, got: step.key, expected });
                    }
                }
            }
        }
    }
    assert.deepEqual(bad, []);
});

test("title loss: cooldown 2 with pendingPromotion kept and wins met shows rematch, then ready after 2 wins", async () => {
    const base = { tier: "National", ovr: 62, rawRank: 3, topFiveWins: 3, pending: "GCS Contender" };
    assert.equal((await stepFor({ ...base, cooldown: 2 })).step.key, "rematch");
    assert.equal((await stepFor({ ...base, cooldown: 1 })).step.n, 1);
    assert.equal((await stepFor({ ...base, cooldown: 0 })).step.key, "ready");
});

test("GCS shows the title strip (no longer hidden); GCS Contender is autoPromote with target 62", async () => {
    // GCS is a title tier now (docs/gcs-title-contract.md B18): 0 top-5 wins means winTop5.
    assert.equal((await stepFor({ tier: "GCS", ovr: 80, rawRank: 3 })).step.key, "winTop5");
    const c = (await stepFor({ tier: "GCS Contender", ovr: 61, rawRank: 3 })).step;
    assert.equal(c.key, "autoPromote");
    assert.equal(c.n, 62);
});

test("GCS sweep: strip says ready exactly when the server offers an UNLOCKED GCS title shot", async () => {
    // Server rule at GCS: pickOfferSlots adds the title slot for every contender
    // (isTitleContender, pendingPromotion stays null) and titleShotEligibility locks it.
    const bad = [];
    const titleWins = fightService.getTitleShotConfig("GCS").titleWins;
    for (const rawRank of [null, 2, 5, 6, 12]) {
        for (const topFiveWins of [0, titleWins - 1, titleWins]) {
            for (const cooldown of [0, 1, 2]) {
                const { step, doc } = await stepFor({ tier: "GCS", ovr: 80, rawRank, topFiveWins, cooldown, pending: null });
                const offeredUnlocked = fightService.isTitleContender(doc) && !fightService.titleShotEligibility(doc).locked;
                let expected;
                if (cooldown > 0) expected = "rematch";
                else if (rawRank == null) expected = "getRanked";
                else if (!rankingService.isTopFive(doc)) expected = "reachTop5";
                else if (topFiveWins < titleWins) expected = "winTop5";
                else expected = "ready";
                if (step.key !== expected || (step.key === "ready") !== offeredUnlocked) {
                    bad.push({ rawRank, topFiveWins, cooldown, got: step.key, expected, offeredUnlocked });
                }
            }
        }
    }
    assert.deepEqual(bad, []);
});

test("unranked fighter at fights 0..2 gets getRanked with the exact remaining count", async () => {
    for (const [fights, left] of [[0, 3], [1, 2], [2, 1]]) {
        const { step } = await stepFor({ tier: "Regional Pro", ovr: 40, rawRank: null, fightsInTier: fights });
        assert.deepEqual(step, { key: "getRanked", n: left });
    }
});

// Former confirmed gaps, now covered by the strip.

test("OVR raised by training past the target while pendingPromotion is null says lock in, not reach", async () => {
    const { step } = await stepFor({ tier: "Regional Pro", ovr: 47, rawRank: 3, topFiveWins: 3, pending: null });
    assert.deepEqual(step, { key: "lockInOvr" });
});

test("GCS Contender at OVR 64 with no fight since says the next fight promotes", async () => {
    const { step } = await stepFor({ tier: "GCS Contender", ovr: 64, rawRank: 3 });
    assert.deepEqual(step, { key: "autoPromoteNextFight" });
});

test("ready does not show when OVR is below the target (stale pendingPromotion)", async () => {
    const { step } = await stepFor({ tier: "National", ovr: 55, rawRank: 3, topFiveWins: 3, pending: "GCS Contender" });
    assert.equal(step.key, "reachOvr");
    assert.ok(step.n > 55, "target " + step.n + " should be above OVR 55");
});

test("reach-the-top-5 names the cutoff, which sits below the fighter's display rank", async () => {
    const { step, ranking } = await stepFor({ tier: "Regional Pro", ovr: 40, rawRank: 6, topFiveWins: 0 });
    assert.equal(step.key, "reachTop5");
    assert.equal(step.n, 4);
    assert.equal(step.rank, ranking.rank);
    assert.ok(step.n < step.rank, "display rank " + step.rank + " shown with target #" + step.n);
});

// ── Board-fed path: "ready" is defined by the board ─────────────────────────

test("board sweep: step is ready iff the board has an unlocked title card (belt tiers)", async () => {
    const bad = [];
    for (const tier of BELT_TIERS) {
        const entry = fightService.TIER_LADDER.find((t) => t.from === tier);
        const titleWins = fightService.getTitleShotConfig(tier).titleWins;
        for (const ovr of [entry.minOverall - 1, entry.minOverall, entry.minOverall + 5]) {
            for (const rawRank of [null, 2, 5, 6, 12]) {
                for (const topFiveWins of [0, titleWins - 1, titleWins]) {
                    for (const cooldown of [0, 1, 2]) {
                        // Also stale pendings (set below target, unset above it).
                        for (const pending of [null, entry.to]) {
                            const { step, board, ranking } = await stepFor(
                                { tier, ovr, rawRank, topFiveWins, cooldown, pending }, { withBoard: true });
                            const open = hasUnlockedTitle(board);
                            if ((step.key === "ready") !== open) {
                                bad.push({ tier, ovr, rawRank, topFiveWins, cooldown, pending, step: step.key, open });
                            }
                            const slot = board.offers.some((o) => o.type === "TitleShot");
                            if (ranking.titleShot.ovrMet !== slot) bad.push({ tier, ovr, pending, ovrMet: ranking.titleShot.ovrMet, slot });
                        }
                    }
                }
            }
        }
    }
    assert.deepEqual(bad, []);
});

test("board sweep: GCS step is ready iff the board has an unlocked title card", async () => {
    const bad = [];
    const titleWins = fightService.getTitleShotConfig("GCS").titleWins;
    for (const rawRank of [null, 2, 5, 6, 12]) {
        for (const topFiveWins of [0, titleWins - 1, titleWins]) {
            for (const cooldown of [0, 1, 2]) {
                const { step, board } = await stepFor(
                    { tier: "GCS", ovr: 80, rawRank, topFiveWins, cooldown, pending: null }, { withBoard: true });
                const open = hasUnlockedTitle(board);
                if ((step.key === "ready") !== open) bad.push({ rawRank, topFiveWins, cooldown, step: step.key, open });
                if (!step.gcs) bad.push({ rawRank, topFiveWins, cooldown, missingGcs: true });
            }
        }
    }
    assert.deepEqual(bad, []);
});

test("board sweep: the hero CTA and the step agree on an open title shot", async () => {
    const bad = [];
    for (const tier of BELT_TIERS) {
        const entry = fightService.TIER_LADDER.find((t) => t.from === tier);
        const titleWins = fightService.getTitleShotConfig(tier).titleWins;
        for (const rawRank of [null, 3, 12]) {
            for (const topFiveWins of [0, titleWins]) {
                for (const cooldown of [0, 2]) {
                    const { step, board } = await stepFor(
                        { tier, ovr: entry.minOverall + 1, rawRank, topFiveWins, cooldown, pending: entry.to }, { withBoard: true });
                    const hero = dashboardService.computeHeroAction({ offers: board.acceptableOffers });
                    if ((hero.key === "title_shot") !== (step.key === "ready")) {
                        bad.push({ tier, rawRank, topFiveWins, cooldown, hero: hero.key, step: step.key });
                    }
                }
            }
        }
    }
    assert.deepEqual(bad, []);
});
