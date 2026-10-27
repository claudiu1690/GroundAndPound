/**
 * GCS title shot: the derived contender helper (fightService.isTitleContender) and the
 * unchanged promotion ladder. A GCS fighter is always a contender without ever getting a
 * pendingPromotion; checkPromotion never sets one at GCS.
 *
 * No DB: pure functions on plain objects.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fightService = require("../../services/fightService");

const { isTitleContender, checkPromotion, TOP_TIER, TIER_ORDER, TIER_LADDER } = fightService;

test("TOP_TIER is the last tier, GCS", () => {
    assert.equal(TOP_TIER, TIER_ORDER[TIER_ORDER.length - 1]);
    assert.equal(TOP_TIER, "GCS");
});

test("isTitleContender: true for GCS with pendingPromotion null", () => {
    assert.equal(isTitleContender({ promotionTier: "GCS", pendingPromotion: null }), true);
    assert.equal(isTitleContender({ promotionTier: "GCS" }), true);
});

test("isTitleContender: true for Regional Pro pending National", () => {
    assert.equal(isTitleContender({ promotionTier: "Regional Pro", pendingPromotion: "National" }), true);
});

test("isTitleContender: false for National with no pending promotion", () => {
    assert.equal(isTitleContender({ promotionTier: "National", pendingPromotion: null }), false);
});

test("isTitleContender: false for GCS Contender with no pending promotion", () => {
    assert.equal(isTitleContender({ promotionTier: "GCS Contender", pendingPromotion: null }), false);
});

test("checkPromotion at GCS returns null and leaves pendingPromotion null", () => {
    const f = { promotionTier: "GCS", overallRating: 99, pendingPromotion: null };
    assert.equal(checkPromotion(f), null);
    assert.equal(f.pendingPromotion, null);
});

test("TIER_LADDER stays one shorter than TIER_ORDER (no GCS -> GCS entry)", () => {
    assert.equal(TIER_LADDER.length, TIER_ORDER.length - 1);
    assert.equal(TIER_LADDER.find((t) => t.from === TOP_TIER), undefined);
});

test("GCS config gains defenseFame 100; first-win numbers unchanged", () => {
    const cfg = fightService.getTitleShotConfig("GCS");
    assert.deepEqual(cfg, { titleWins: 3, beltFame: 200, defenseFame: 100, beltBadge: "Champion" });
});
