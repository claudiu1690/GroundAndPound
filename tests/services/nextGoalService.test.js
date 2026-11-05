/**
 * services/nextGoalService.computeNextGoal: the result screen's Next goal priority table
 * (first-session contract B.5). Pure: plain fighter objects, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { computeNextGoal } = require("../../services/nextGoalService");
const { TIER_LADDER } = require("../../services/fightService");

function fighter(over = {}) {
    return {
        promotionTier: "Amateur",
        overallRating: 18,
        record: { wins: 0, losses: 0, draws: 0 },
        ranking: { rank: null, fightsInTier: 0 },
        pvpOnboarding: { unlocked: false },
        pendingPromotion: null,
        topFiveWinsInTier: 0,
        ...over,
    };
}

const PVP = (n) => ({ key: "pvp_unlock", current: n, target: 3 });

test("1. unranked -> rank (fightsInTier / 3) with the Proving Ground secondary", () => {
    const g = computeNextGoal(fighter({ record: { wins: 1, losses: 0, draws: 0 }, ranking: { rank: null, fightsInTier: 1 } }));
    assert.deepEqual(g, { key: "rank", current: 1, target: 3, rank: null, tier: null, threshold: null, titleTier: null, secondary: PVP(1) });
});

test("1. unranked with PvP already unlocked -> no secondary", () => {
    const g = computeNextGoal(fighter({ ranking: { rank: null, fightsInTier: 2 }, pvpOnboarding: { unlocked: true } }));
    assert.equal(g.key, "rank");
    assert.equal(g.secondary, null);
});

test("2. ranked, PvP locked -> pvp_unlock (wins capped at 3), no secondary", () => {
    const g = computeNextGoal(fighter({ record: { wins: 2, losses: 1, draws: 0 }, ranking: { rank: 12, fightsInTier: 3 } }));
    assert.deepEqual(g, { key: "pvp_unlock", current: 2, target: 3, rank: null, tier: null, threshold: null, titleTier: null, secondary: null });
    // A legacy fighter with 5 wins whose flag never flipped still reads 3 / 3.
    assert.equal(computeNextGoal(fighter({ record: { wins: 5 }, ranking: { rank: 12 } })).current, 3);
});

test("3. contender not top 5 -> top5 with the display rank", () => {
    const g = computeNextGoal(fighter({
        ranking: { rank: 9, fightsInTier: 6 }, pvpOnboarding: { unlocked: true }, pendingPromotion: "Regional Pro",
    }));
    assert.deepEqual(g, { key: "top5", current: null, target: null, rank: 8, tier: null, threshold: null, titleTier: "Amateur", secondary: null });
});

test("4. contender in top 5 with title wins left -> title (Amateur needs 2)", () => {
    const g = computeNextGoal(fighter({
        ranking: { rank: 4, fightsInTier: 8 }, pvpOnboarding: { unlocked: true },
        pendingPromotion: "Regional Pro", topFiveWinsInTier: 1,
    }));
    assert.deepEqual(g, { key: "title", current: 1, target: 2, rank: null, tier: null, threshold: null, titleTier: "Amateur", secondary: null });
});

test("5. not a contender -> tier: next tier and its minOverall, current = OVR", () => {
    const entry = TIER_LADDER.find((e) => e.from === "Amateur");
    const g = computeNextGoal(fighter({ ranking: { rank: 14 }, pvpOnboarding: { unlocked: true }, overallRating: 21 }));
    assert.deepEqual(g, {
        key: "tier", current: 21, target: entry.minOverall, rank: null, tier: entry.to, threshold: entry.minOverall, titleTier: "Amateur", secondary: null,
    });
});

test("5. contender who banked every title win falls through to tier", () => {
    const g = computeNextGoal(fighter({
        ranking: { rank: 3 }, pvpOnboarding: { unlocked: true }, pendingPromotion: "Regional Pro", topFiveWinsInTier: 2,
    }));
    assert.equal(g.key, "tier");
});

test("6. GCS in top 5 with every title win banked -> top", () => {
    const g = computeNextGoal(fighter({
        promotionTier: "GCS", ranking: { rank: 2 }, pvpOnboarding: { unlocked: true }, topFiveWinsInTier: 3, overallRating: 90,
    }));
    assert.deepEqual(g, { key: "top", current: null, target: null, rank: null, tier: null, threshold: null, titleTier: null, secondary: null });
});

test("GCS outside the top 5 -> top5 (always a contender at the top tier)", () => {
    const g = computeNextGoal(fighter({ promotionTier: "GCS", ranking: { rank: 11 }, pvpOnboarding: { unlocked: true } }));
    assert.equal(g.key, "top5");
    assert.equal(g.rank, 10);
});

test("secondary shows whenever PvP is locked and the main key is not pvp_unlock", () => {
    // A ranked legacy fighter with 3+ wins whose flag never flipped: main pvp_unlock, no secondary.
    assert.equal(computeNextGoal(fighter({ ranking: { rank: 9 }, record: { wins: 3 } })).secondary, null);
    // Unranked and locked: secondary present.
    assert.deepEqual(computeNextGoal(fighter()).secondary, PVP(0));
});

test("tolerates a sparse legacy doc", () => {
    const g = computeNextGoal({ promotionTier: "Amateur" });
    assert.equal(g.key, "rank");
    assert.equal(g.current, 0);
    assert.deepEqual(g.secondary, PVP(0));
});
