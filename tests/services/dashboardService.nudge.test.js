/**
 * Unit tests for the Home nudge and the titleShot.topFiveCutoff field.
 *
 *   - topFiveCutoff is the DISPLAY rank of rankingService's internal top-5 boundary.
 *   - An unranked fighter is told how many fights remain before placement.
 *   - The top-5 nudge quotes the cutoff, not a hardcoded number.
 *   - When the raw doc read failed, a display rank is never treated as internal.
 *
 * No DB: buildRanking and buildNudge read only the loaded docs and constants.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const dashboardService = require("../../services/dashboardService");
const rankingService = require("../../services/rankingService");

const { buildRanking, buildNudge } = dashboardService;

function docs({ rawRank = null, fightsInTier = 0, tier = "Regional Pro", cooldown = 0, comeback = false } = {}) {
    const fighter = {
        promotionTier: tier,
        overallRating: 40,
        pendingPromotion: null,
        topFiveWinsInTier: 0,
        titleShotCooldown: cooldown,
        comebackMode: comeback,
        ranking: { rank: rankingService.toDisplayRank(rawRank), fightsInTier },
    };
    const rawFighter = { ranking: { rank: rawRank, fightsInTier }, gazette: {} };
    return { fighter, rawFighter };
}

async function nudgeFor(over) {
    const { fighter, rawFighter } = docs(over);
    const ranking = await buildRanking(fighter, rawFighter, "f1");
    return buildNudge(fighter, ranking);
}

// ── topFiveCutoff ────────────────────────────────────────────────────────────

test("topFiveCutoff is toDisplayRank of the internal top-5 boundary, 4 today", async () => {
    assert.equal(rankingService.TOP_FIVE_INTERNAL_RANK, 5);
    const { fighter, rawFighter } = docs({ rawRank: 9, fightsInTier: 6 });
    const { titleShot } = await buildRanking(fighter, rawFighter, "f1");
    assert.equal(titleShot.topFiveCutoff, rankingService.toDisplayRank(rankingService.TOP_FIVE_INTERNAL_RANK));
    assert.equal(titleShot.topFiveCutoff, 4);
});

test("isTopFive uses the exported boundary: internal 5 in, internal 6 out", () => {
    const b = rankingService.TOP_FIVE_INTERNAL_RANK;
    assert.equal(rankingService.isTopFive({ ranking: { rank: b } }), true);
    assert.equal(rankingService.isTopFive({ ranking: { rank: b + 1 } }), false);
    assert.equal(rankingService.isTopFive({ ranking: { rank: null } }), false);
});

test("topFiveCutoff is present for unranked fighters too", async () => {
    const { fighter, rawFighter } = docs({ rawRank: null, fightsInTier: 1 });
    const { titleShot } = await buildRanking(fighter, rawFighter, "f1");
    assert.equal(titleShot.topFiveCutoff, 4);
});

// ── Unranked nudge ───────────────────────────────────────────────────────────

test("unranked at 0 fights: play 3 more fights", async () => {
    const n = await nudgeFor({ rawRank: null, fightsInTier: 0 });
    assert.equal(n.text, "Play 3 more fights to get ranked in your division.");
    assert.equal(n.linkTarget, "fights");
});

test("unranked at 2 fights: play 1 more fight (singular)", async () => {
    const n = await nudgeFor({ rawRank: null, fightsInTier: 2 });
    assert.equal(n.text, "Play 1 more fight to get ranked in your division.");
    assert.equal(n.linkTarget, "fights");
});

test("unranked past the threshold still asks for at least 1 fight", async () => {
    const n = await nudgeFor({ rawRank: null, fightsInTier: rankingService.RANKED_AFTER_FIGHTS + 2 });
    assert.equal(n.text, "Play 1 more fight to get ranked in your division.");
});

test("unranked nudge beats the comeback and keep-training fallbacks", async () => {
    const n = await nudgeFor({ rawRank: null, fightsInTier: 1, comeback: true });
    assert.match(n.text, /^Play 2 more fights/);
});

test("cooldown still comes first, without an em dash", async () => {
    const n = await nudgeFor({ rawRank: null, fightsInTier: 0, cooldown: 1 });
    assert.equal(n.text, "Title shot locked. Win 1 more fight to earn a rematch (1/2).");
    assert.equal(n.linkTarget, "fights");
    assert.ok(!n.text.includes("—"));
});

// ── Top-5 nudge ──────────────────────────────────────────────────────────────

test("ranked outside the top 5: nudge quotes the cutoff", async () => {
    const n = await nudgeFor({ rawRank: 9, fightsInTier: 6 });
    const cutoff = rankingService.toDisplayRank(rankingService.TOP_FIVE_INTERNAL_RANK);
    assert.equal(n.text, `Climb to #${cutoff} to enter the title zone.`);
    assert.equal(n.text, "Climb to #4 to enter the title zone.");
    assert.equal(n.linkTarget, "rankings");
    assert.ok(!n.text.includes("—"));
});

test("ranked at the boundary (internal 5) does not get the climb nudge", async () => {
    const n = await nudgeFor({ rawRank: 5, fightsInTier: 6 });
    assert.ok(!n.text.startsWith("Climb to"), n.text);
});

// ── Raw-read fallback ────────────────────────────────────────────────────────

test("raw read failed: display rank is never treated as internal for topFive", async () => {
    // Internal 6 (outside) shows as display 5; feeding 5 into isTopFive would say true.
    const { fighter } = docs({ rawRank: 6, fightsInTier: 6 });
    assert.equal(fighter.ranking.rank, 5);
    const ranking = await buildRanking(fighter, null, "f1");
    assert.equal(ranking.isTopFive, false);
    assert.equal(ranking.titleShot.topFive, false);
});

test("raw read failed: topFive is false even for a real top-5 fighter (no internal rank known)", async () => {
    const { fighter } = docs({ rawRank: 3, fightsInTier: 6 });
    const ranking = await buildRanking(fighter, null, "f1");
    assert.equal(ranking.isTopFive, false);
    assert.equal(ranking.titleShot.topFive, false);
});

test("raw doc present: topFive follows the internal rank", async () => {
    const inside = docs({ rawRank: 5, fightsInTier: 6 });
    assert.equal((await buildRanking(inside.fighter, inside.rawFighter, "f1")).isTopFive, true);
    const outside = docs({ rawRank: 6, fightsInTier: 6 });
    assert.equal((await buildRanking(outside.fighter, outside.rawFighter, "f1")).isTopFive, false);
});

// ── Gazette shares the constant ─────────────────────────────────────────────

test("gazetteService loads with the shared RANKED_AFTER_FIGHTS (no require cycle)", () => {
    const gazette = require("../../services/gazetteService");
    assert.equal(typeof gazette.regenerateGazette, "function");
    assert.equal(rankingService.RANKED_AFTER_FIGHTS, 3);
});

// ── GCS title shot copy (docs/gcs-title-contract.md B19) ────────────────────

function gcsDocs({ rawRank = 3, topFiveWins = 0, gcsTitleWins = 0, cooldown = 0, pending = null, tier = "GCS" } = {}) {
    const fighter = {
        promotionTier: tier,
        overallRating: 80,
        pendingPromotion: pending,
        topFiveWinsInTier: topFiveWins,
        titleShotCooldown: cooldown,
        gcsTitleWins,
        comebackMode: false,
        ranking: { rank: rankingService.toDisplayRank(rawRank), fightsInTier: 9 },
    };
    return { fighter, rawFighter: { ranking: { rank: rawRank, fightsInTier: 9 }, gazette: {} } };
}

async function gcsNudge(over) {
    const { fighter, rawFighter } = gcsDocs(over);
    return buildNudge(fighter, await buildRanking(fighter, rawFighter, "f1"));
}

test("GCS ready: top 5 with 3 top-5 wins and no cooldown", async () => {
    const n = await gcsNudge({ topFiveWins: 3 });
    assert.equal(n.text, "Your GCS title shot is ready. Go take the belt.");
    assert.equal(n.linkTarget, "fights");
});

test("GCS grinding before the first belt", async () => {
    assert.equal((await gcsNudge({ topFiveWins: 0 })).text, "Win 3 more fights to earn your GCS title shot.");
    assert.equal((await gcsNudge({ topFiveWins: 2 })).text, "Win 1 more fight to earn your GCS title shot.");
});

test("GCS grinding as champion", async () => {
    assert.equal((await gcsNudge({ topFiveWins: 0, gcsTitleWins: 1 })).text,
        "GCS Champion. Bank 3 more top-5 wins for your next title fight.");
    assert.equal((await gcsNudge({ topFiveWins: 2, gcsTitleWins: 4 })).text,
        "GCS Champion. Bank 1 more top-5 win for your next title fight.");
});

test("GCS cooldown branch is unchanged", async () => {
    const n = await gcsNudge({ topFiveWins: 3, cooldown: 2 });
    assert.equal(n.text, "Title shot locked. Win 2 more fights to earn a rematch (0/2).");
});

test("GCS outside the top 5 keeps the cutoff wording; unranked keeps the placement wording", async () => {
    assert.equal((await gcsNudge({ rawRank: 9 })).text, "Climb to #4 to enter the title zone.");
    const { fighter, rawFighter } = gcsDocs({ rawRank: null });
    fighter.ranking.fightsInTier = 1;
    rawFighter.ranking.fightsInTier = 1;
    const n = buildNudge(fighter, await buildRanking(fighter, rawFighter, "f1"));
    assert.equal(n.text, "Play 2 more fights to get ranked in your division.");
});

test("lower-tier ready copy keeps its wording, without an em dash", async () => {
    const pro = await gcsNudge({ tier: "Amateur", pending: "Regional Pro", topFiveWins: 2 });
    assert.equal(pro.text, "You're ready to turn pro. Go take the fight.");
    const belt = await gcsNudge({ tier: "National", pending: "GCS Contender", topFiveWins: 3 });
    assert.equal(belt.text, "Your title shot is ready. Go fight for the belt.");
    const grind = await gcsNudge({ tier: "Amateur", pending: "Regional Pro", topFiveWins: 1 });
    assert.equal(grind.text, "Win 1 more fight to earn your shot at turning pro.");
    for (const n of [pro, belt, grind]) assert.ok(!n.text.includes(String.fromCharCode(0x2014)));
});

test("National without a pending promotion is not a contender (no title copy)", async () => {
    const n = await gcsNudge({ tier: "National", pending: null, topFiveWins: 3 });
    assert.ok(!/title shot is ready/.test(n.text), n.text);
});

test("comeback fallback has no em dash", () => {
    const n = buildNudge(
        { promotionTier: "Regional Pro", pendingPromotion: null, topFiveWinsInTier: 0, titleShotCooldown: 0, comebackMode: true },
        { rank: null, isTopFive: false, titleShot: { ranked: true } },
    );
    assert.match(n.text, /^Comeback bonuses are live\. \+30% cash/);
    assert.ok(!n.text.includes(String.fromCharCode(0x2014)));
});

// ── Hero action (B20) ───────────────────────────────────────────────────────

test("computeHeroAction: an unlocked GCS defense says Defend the Belt", () => {
    const { computeHeroAction } = dashboardService;
    const defense = computeHeroAction({
        offers: [{ type: "TitleShot", locked: false, titleShotMeta: { targetTier: null, tier: "GCS", titleDefense: true, gcsTitleWins: 1 } }],
    });
    assert.deepEqual(defense, {
        key: "title_shot",
        label: "Defend the Belt",
        sublabel: "Your GCS title defense is on the table. Take it.",
        linkTarget: "fights",
    });
    const first = computeHeroAction({
        offers: [{ type: "TitleShot", locked: false, titleShotMeta: { targetTier: null, tier: "GCS", titleDefense: false, gcsTitleWins: 0 } }],
    });
    assert.equal(first.label, "Fight for the Belt");
    const locked = computeHeroAction({
        offers: [{ type: "TitleShot", locked: true, titleShotMeta: { titleDefense: true } }],
    });
    assert.notEqual(locked.key, "title_shot");
});
