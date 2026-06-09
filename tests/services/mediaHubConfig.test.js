/**
 * Pure-function coverage for the Media Hub config (no DB).
 * Locks the listener curve, listener formatting, documentary additive math,
 * timing multipliers, and deterministic titling.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const c = require("../../consts/mediaHubConfig");

test("listenersFromScore: 200 + score*1.4", () => {
    assert.equal(c.listenersFromScore(0), 200);
    assert.equal(c.listenersFromScore(1000), Math.round(200 + 1400));
    assert.equal(c.listenersFromScore(40000), 56200);
    assert.equal(c.listenersFromScore(-50), 200); // floors at 0
});

test("formatListeners: <1000 integer", () => {
    assert.equal(c.formatListeners(0), "0");
    assert.equal(c.formatListeners(999), "999");
    assert.equal(c.formatListeners(200), "200");
});

test("formatListeners: 1000-999999 → X.Yk, drop trailing .0", () => {
    assert.equal(c.formatListeners(1000), "1k");
    assert.equal(c.formatListeners(1500), "1.5k");
    assert.equal(c.formatListeners(56200), "56.2k");
    assert.equal(c.formatListeners(56000), "56k");
});

test("formatListeners: >=1M → X.YM, drop trailing .0", () => {
    assert.equal(c.formatListeners(1000000), "1M");
    assert.equal(c.formatListeners(1250000), "1.2M");
});

test("documentary additive fame: base 1500 + tone, cash 2000", () => {
    assert.deepEqual(c.computeDocumentaryReward({ focus: "FIGHTER", tone: "INSPIRATIONAL" }, 1.0), { fame: 3000, cash: 2000, grantsBooster: false });
    assert.deepEqual(c.computeDocumentaryReward({ focus: "FIGHTER", tone: "RAW" }, 1.0), { fame: 3300, cash: 2000, grantsBooster: false });
    assert.deepEqual(c.computeDocumentaryReward({ focus: "FIGHTER", tone: "CONTROVERSIAL" }, 1.0), { fame: 3700, cash: 2000, grantsBooster: false });
});

test("documentary timing multipliers", () => {
    assert.equal(c.DOCUMENTARY_TIMING.NOW.mult, 1.0);
    assert.equal(c.DOCUMENTARY_TIMING.BEFORE_TITLE.mult, 1.5);
    assert.equal(c.DOCUMENTARY_TIMING.AFTER_TITLE.mult, 2.0);
    // CONTROVERSIAL after-title win: (1500+2200)*2 = 7400 fame, 2000*2 = 4000 cash
    assert.deepEqual(c.computeDocumentaryReward({ focus: "FIGHTER", tone: "CONTROVERSIAL" }, 2.0), { fame: 7400, cash: 4000, grantsBooster: false });
});

test("documentary UNDERDOG: cash-lean split (fame*0.5, cash*2.0)", () => {
    const r = c.computeDocumentaryReward({ focus: "UNDERDOG", tone: "INSPIRATIONAL" }, 1.0);
    assert.equal(r.fame, 1500); // 3000 * 0.5
    assert.equal(r.cash, 4000); // 2000 * 2.0
});

test("documentary TECHNICIAN grants booster", () => {
    const r = c.computeDocumentaryReward({ focus: "TECHNICIAN", tone: "RAW" }, 1.0);
    assert.equal(r.grantsBooster, true);
});

test("documentary unlock tier is STAR / 40000", () => {
    assert.equal(c.DOCUMENTARY_UNLOCK_TIER, "STAR");
    assert.equal(c.DOCUMENTARY_UNLOCK_THRESHOLD, 40000);
});

test("titleForEpisode: combo wins, deterministic fallback otherwise", () => {
    assert.equal(c.titleForEpisode(["TRASH", "BREAKDOWN"], "abc", 1), "No Mercy"); // order-independent
    assert.equal(c.titleForEpisode(["BREAKDOWN", "TRASH"], "abc", 1), "No Mercy");
    const a = c.titleForEpisode(["CRYPTIC", "RESPECT"], "fid", 3);
    const b = c.titleForEpisode(["CRYPTIC", "RESPECT"], "fid", 3);
    assert.equal(a, b); // deterministic
});

test("podcast segments: 2 distinct required, GUEST gated at Regional Pro", () => {
    assert.equal(c.PODCAST_SEGMENT_COUNT, 2);
    assert.equal(c.PODCAST_SEGMENTS.GUEST.gating.minPromotionTier, "Regional Pro");
    assert.equal(c.PODCAST_SEGMENTS.TRASH.flag, "beef");
    assert.equal(c.PODCAST_SEGMENTS.RESPECT.flag, "respect");
    assert.equal(c.PODCAST_SEGMENTS.RECAP.cash, 150);
    assert.equal(c.PODCAST_SEGMENTS.CRYPTIC.fame, 40);
});

test("mediaConfig re-exports the two fightService constants", () => {
    const mc = require("../../consts/mediaConfig");
    assert.equal(mc.BEEF_LAPSE_PENALTY_FAME, 150);
    assert.equal(mc.RESPECT_WIN_IRON_MULT, 1.15);
});

test("appearance pool size + magazine cover fame-by-tier", () => {
    assert.equal(c.APPEARANCE_POOL_SIZE, 3);
    const mag = c.APPEARANCE_TYPES.MAGAZINE_COVER.fameByTier;
    assert.deepEqual(mag, { PROSPECT: 150, RISING_STAR: 300, CONTENDER: 500, STAR: 800, LEGEND: 1500 });
});

test("DOC_TECHNICIAN booster registered in shop config (resolvable by trainingService)", () => {
    const { BOOSTERS, boosterStatList } = require("../../consts/shopConfig");
    const b = BOOSTERS.DOC_TECHNICIAN;
    assert.ok(b, "DOC_TECHNICIAN must exist");
    assert.equal(b.pct, 0.05);
    assert.equal(b.sessions, 10);
    assert.deepEqual(boosterStatList(b), ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"]);
});
