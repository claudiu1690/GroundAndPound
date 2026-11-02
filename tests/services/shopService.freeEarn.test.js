/**
 * Shop redesign: the free-earn progress line (shopService.buildFreeEarn) and the A1/A2 panel
 * precedence (shopService.premiumPanelState). Both are pure: no DB, no Redis.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const shopService = require("../../services/shopService");
const { FREE_DRINK_GRANTS, SOFT_CAP } = require("../../consts/shopConfig");
const { TOP_TIER } = require("../../services/fightService");

const { buildFreeEarn, premiumPanelState } = shopService;

const base = { winStreak: 0, promotionTier: "Regional", gcsTitleWins: 0, energyDrinks: 0, activeRewardDrinks: [] };
const fe = (over) => buildFreeEarn({ ...base, ...over });

test("FREE_DRINK_GRANTS holds the shipped numbers", () => {
    assert.deepEqual({ ...FREE_DRINK_GRANTS.streak }, { 5: 1, 10: 2, 15: 2, 20: 3 });
    assert.equal(FREE_DRINK_GRANTS.promotion, 3);
});

test("fightService reads the grants from config, not a local table", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "services", "fightService.js"), "utf8");
    assert.equal(src.includes("{ 5: 1, 10: 2"), false, "the streak table must live only in shopConfig");
    assert.ok(src.includes("FREE_DRINK_GRANTS.streak"));
    assert.ok(src.includes("FREE_DRINK_GRANTS.promotion"));
});

test("streak: next milestone strictly above the current streak", () => {
    assert.deepEqual(fe({ winStreak: 0 }).streak, { current: 0, next: 5, drinks: 1 });
    assert.deepEqual(fe({ winStreak: 5 }).streak, { current: 5, next: 10, drinks: 2 });
    assert.deepEqual(fe({ winStreak: 7 }).streak, { current: 7, next: 10, drinks: 2 });
    assert.deepEqual(fe({ winStreak: 15 }).streak, { current: 15, next: 20, drinks: 3 });
    assert.deepEqual(fe({ winStreak: 19 }).streak, { current: 19, next: 20, drinks: 3 });
});

test("streak: null at 20 and beyond", () => {
    assert.equal(fe({ winStreak: 20 }).streak, null);
    assert.equal(fe({ winStreak: 25 }).streak, null);
});

test("streak: missing or garbage winStreak reads as 0", () => {
    for (const winStreak of [undefined, null, NaN, "abc", -3]) {
        assert.deepEqual(fe({ winStreak }).streak, { current: 0, next: 5, drinks: 1 }, String(winStreak));
    }
});

test("promotion: below GCS, GCS without a belt, GCS with a belt", () => {
    assert.deepEqual(fe({ promotionTier: "Regional" }).promotion, { drinks: 3, kind: "promotion" });
    assert.deepEqual(fe({ promotionTier: TOP_TIER, gcsTitleWins: 0 }).promotion, { drinks: 3, kind: "gcs_belt" });
    assert.deepEqual(fe({ promotionTier: TOP_TIER, gcsTitleWins: undefined }).promotion, { drinks: 3, kind: "gcs_belt" });
    assert.equal(fe({ promotionTier: TOP_TIER, gcsTitleWins: 1 }).promotion, null);
    assert.equal(fe({ promotionTier: TOP_TIER, gcsTitleWins: 4 }).promotion, null);
});

test("sponsor: active deals sum their drinks; none shows the catalog range", () => {
    assert.deepEqual(fe({ activeRewardDrinks: [2, 3] }).sponsor, { active: true, drinks: 5 });
    assert.deepEqual(fe({ activeRewardDrinks: [] }).sponsor, { active: false, min: 2, max: 4 });
    // Active deals that pay no drinks do not count as "active" for the line.
    assert.deepEqual(fe({ activeRewardDrinks: [0, null, undefined] }).sponsor, { active: false, min: 2, max: 4 });
    assert.deepEqual(fe({ activeRewardDrinks: undefined }).sponsor, { active: false, min: 2, max: 4 });
});

test("overCap at the soft cap only", () => {
    assert.equal(SOFT_CAP, 99);
    assert.equal(fe({ energyDrinks: 98 }).overCap, false);
    assert.equal(fe({ energyDrinks: 99 }).overCap, true);
    assert.equal(fe({ energyDrinks: 150 }).overCap, true);
    assert.equal(fe({ energyDrinks: undefined }).overCap, false);
});

test("the shape always carries all four keys", () => {
    assert.deepEqual(Object.keys(fe({})).sort(), ["overCap", "promotion", "sponsor", "streak"]);
});

test("panel precedence: first visit beats the reshow, then collapsed", () => {
    assert.deepEqual(premiumPanelState({ premiumPanelSeen: false, premiumPanelReshowPending: false }), { mode: "full", reason: "first_visit" });
    assert.deepEqual(premiumPanelState({ premiumPanelSeen: false, premiumPanelReshowPending: true }), { mode: "full", reason: "first_visit" });
    assert.deepEqual(premiumPanelState({ premiumPanelSeen: true, premiumPanelReshowPending: true }), { mode: "full", reason: "account_secured" });
    assert.deepEqual(premiumPanelState({ premiumPanelSeen: true, premiumPanelReshowPending: false }), { mode: "collapsed", reason: null });
    // Legacy doc without the fields: first visit (no backfill by design).
    assert.deepEqual(premiumPanelState({}), { mode: "full", reason: "first_visit" });
});
