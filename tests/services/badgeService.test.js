const assert = require("node:assert/strict");
const { test } = require("node:test");

const badgeService = require("../../services/badgeService");
const { BADGES, getBadge, GYM_BADGE_SLUGS, STAR_THRESHOLD } = require("../../consts/badgeCatalog");
const { PVP_BADGE_DEFS } = require("../../consts/pvpBadges");

function baseFighter(overrides = {}) {
    return {
        _id: null, // null id → activityLog.log no-ops (no ObjectId cast), keeps tests quiet
        record: { wins: 0, losses: 0, draws: 0, koWins: 0, subWins: 0, decisionWins: 0 },
        winStreak: 0,
        overallRating: 14,
        ranking: { rank: null },
        notoriety: { score: 0, peakTier: "UNKNOWN" },
        beefFlags: [],
        media: { episodeCount: 0, beefsStarted: 0, documentaryStatus: "locked" },
        gymRanks: {},
        badgesEarned: [],
        ...overrides,
    };
}

test("B1: STAR_THRESHOLD sourced from notorietyConfig = 40000", () => {
    assert.equal(STAR_THRESHOLD, 40000);
});

test("B2: catalog has 48 badges and unique ids", () => {
    assert.equal(BADGES.length, 48);
    const ids = new Set(BADGES.map((b) => b.id));
    assert.equal(ids.size, 48);
});

test("B3: gym slug map matches catalog defs", () => {
    assert.equal(GYM_BADGE_SLUGS.boxer_rank4, "iron-fist-boxing");
    assert.equal(GYM_BADGE_SLUGS.elite_rank4, "elite-fight-academy");
    assert.equal(Object.keys(GYM_BADGE_SLUGS).length, 10);
});

test("B4: first_blood awarded at 1 win, not at 0", () => {
    const f0 = baseFighter();
    assert.equal(badgeService.evaluateBadges(f0, {}).newlyEarned.length, 0);
    const f1 = baseFighter({ record: { wins: 1 } });
    const got = badgeService.evaluateBadges(f1, {}).newlyEarned.map((x) => x.badgeId);
    assert.ok(got.includes("first_blood"));
});

test("B5: ctx-only badges require ctx (iron_chin, callout_win, giant_killer)", () => {
    const f = baseFighter({ record: { wins: 1 } });
    badgeService.evaluateBadges(f, {}); // state only — should NOT award ctx badges
    const ids = new Set(f.badgesEarned.map((b) => b.badgeId));
    assert.ok(!ids.has("iron_chin"));
    assert.ok(!ids.has("callout_win"));
    assert.ok(!ids.has("giant_killer"));

    const f2 = baseFighter({ record: { wins: 1 }, overallRating: 40 });
    badgeService.evaluateBadges(f2, {
        isWin: true, wasKnockedDown: true, isCalloutWin: true, oppOvr: 55,
    });
    const ids2 = new Set(f2.badgesEarned.map((b) => b.badgeId));
    assert.ok(ids2.has("iron_chin"));
    assert.ok(ids2.has("callout_win"));
    assert.ok(ids2.has("giant_killer"));
});

test("B6: champ badges keyed by ctx.beltWonForTier", () => {
    const f = baseFighter();
    badgeService.evaluateBadges(f, { beltWonForTier: "National" });
    const ids = new Set(f.badgesEarned.map((b) => b.badgeId));
    assert.ok(ids.has("champ_national"));
    assert.ok(!ids.has("champ_amateur"));
    assert.ok(!ids.has("champ_gcs"));
});

test("B7: champ_gcs_contender is never awardable", () => {
    const f = baseFighter();
    // try every plausible ctx
    badgeService.evaluateBadges(f, { beltWonForTier: "GCS Contender", isWin: true });
    const ids = new Set(f.badgesEarned.map((b) => b.badgeId));
    assert.ok(!ids.has("champ_gcs_contender"));
    assert.equal(getBadge("champ_gcs_contender").condition(f, {}), false);
});

test("B8: serial_beefcake = 3 active flags; controversy = beefsStarted >= 10", () => {
    const fA = baseFighter({ beefFlags: [{}, {}, {}], media: { beefsStarted: 3, episodeCount: 0, documentaryStatus: "locked" } });
    badgeService.evaluateBadges(fA, {});
    const idsA = new Set(fA.badgesEarned.map((b) => b.badgeId));
    assert.ok(idsA.has("serial_beefcake"));
    assert.ok(!idsA.has("controversy"));

    const fB = baseFighter({ beefFlags: [], media: { beefsStarted: 10, episodeCount: 0, documentaryStatus: "locked" } });
    badgeService.evaluateBadges(fB, {});
    const idsB = new Set(fB.badgesEarned.map((b) => b.badgeId));
    assert.ok(idsB.has("controversy"));
    assert.ok(!idsB.has("serial_beefcake"));
});

test("B9: idempotent — re-eval awards nothing new", () => {
    const f = baseFighter({ record: { wins: 10, koWins: 10 }, winStreak: 5 });
    const r1 = badgeService.evaluateBadges(f, {});
    assert.ok(r1.newlyEarned.length > 0);
    const r2 = badgeService.evaluateBadges(f, {});
    assert.equal(r2.newlyEarned.length, 0);
});

test("B10: progress clamped to [0,target] and only present when locked", () => {
    const f = baseFighter({ record: { wins: 7 } });
    const prof = badgeService.buildBadgeProfile(f);
    const career = prof.categories.find((c) => c.key === "career");
    const w10 = career.badges.find((b) => b.id === "wins_10");
    assert.equal(w10.earned, false);
    assert.deepEqual(w10.progress, { current: 7, target: 10, unit: "wins" });

    // Earned badge → progress null even if a progress fn exists.
    const f2 = baseFighter({ record: { wins: 12 } });
    badgeService.evaluateBadges(f2, {}); // award before reading the profile
    const prof2 = badgeService.buildBadgeProfile(f2);
    const w10b = prof2.categories.find((c) => c.key === "career").badges.find((b) => b.id === "wins_10");
    assert.equal(w10b.earned, true);
    assert.equal(w10b.progress, null);
});

test("B11: progress current never exceeds target", () => {
    const f = baseFighter({ record: { wins: 999 }, notoriety: { score: 999999, peakTier: "PROSPECT" } });
    const docDef = getBadge("documentary");
    const p = docDef.progress(f);
    assert.equal(p.current, p.target);
    assert.equal(p.target, STAR_THRESHOLD);
});

test("B12: buildBadgeProfile earnedCount + lockedCount = catalog size (PvE catalog + fixed PVP catalog)", () => {
    const f = baseFighter({ record: { wins: 10, koWins: 10 } });
    badgeService.evaluateBadges(f, {});
    const prof = badgeService.buildBadgeProfile(f);
    // The Proving Ground fixed catalog is always rendered (earned + locked), like the
    // PvE categories — so the total is the PvE catalog plus the fixed PVP badge count
    // (this fighter has no earned seasonal/unbounded pvp ids).
    assert.equal(prof.earnedCount + prof.lockedCount, BADGES.length + Object.keys(PVP_BADGE_DEFS).length);
});

test("B13: null-guard — empty/garbage fighter does not throw", () => {
    assert.doesNotThrow(() => badgeService.evaluateBadges({}, {}));
    assert.doesNotThrow(() => badgeService.evaluateBadges(null, {}));
    assert.doesNotThrow(() => badgeService.buildBadgeProfile({}));
    const r = badgeService.evaluateBadges(null, {});
    assert.deepEqual(r, { newlyEarned: [] });
});

test("B14: division_dominator on ranking.rank === 1", () => {
    const f = baseFighter({ ranking: { rank: 1 } });
    badgeService.evaluateBadges(f, {});
    assert.ok(new Set(f.badgesEarned.map((b) => b.badgeId)).has("division_dominator"));
});

test("B15: gym badge awarded at rank 4 only", () => {
    const f3 = baseFighter({ gymRanks: { "gracie-ground-game": { rank: 3 } } });
    badgeService.evaluateBadges(f3, {});
    assert.ok(!new Set(f3.badgesEarned.map((b) => b.badgeId)).has("bjj_rank4"));

    const f4 = baseFighter({ gymRanks: { "gracie-ground-game": { rank: 4 } } });
    badgeService.evaluateBadges(f4, {});
    assert.ok(new Set(f4.badgesEarned.map((b) => b.badgeId)).has("bjj_rank4"));
});
