const assert = require("node:assert/strict");
const { test } = require("node:test");

const { resolvePvpBadge } = require("../../consts/pvpBadges");
const badgeService = require("../../services/badgeService");

// ── H-2: resolver must never drop a recognized pvp division id ───────────────

test("resolvePvpBadge handles all five divisions (incl. prospect/contender)", () => {
    for (const div of ["prospect", "contender", "challenger", "elite", "champion"]) {
        const r = resolvePvpBadge(`pvp_${div}_s4`);
        assert.ok(r, `expected a resolved badge for ${div}`);
        assert.equal(r.season, 4);
        assert.equal(r.category, "proving_ground");
        assert.ok(r.name.includes("Season 4"));
    }
});

test("resolvePvpBadge resolves a belt id with weight class", () => {
    const r = resolvePvpBadge("pvp_belt_s3_featherweight");
    assert.ok(r);
    assert.equal(r.weightClass, "Featherweight");
    assert.equal(r.icon, "Crown");
    assert.ok(r.name.includes("Belt"));
});

test("resolvePvpBadge falls back (never null) for an unmapped pvp division id", () => {
    const r = resolvePvpBadge("pvp_legend_s9");
    assert.ok(r, "unmapped division should still resolve via fallback");
    assert.equal(r.season, 9);
    assert.equal(r.name, "Legend — Season 9");
});

test("resolvePvpBadge returns null for non-pvp ids", () => {
    assert.equal(resolvePvpBadge("some_other_badge"), null);
    assert.equal(resolvePvpBadge(null), null);
});

// ── buildBadgeProfile must surface prospect/contender PVP badges (not drop) ───

test("buildBadgeProfile injects prospect + contender PVP badges into a Proving Ground category", () => {
    const fighter = {
        _id: null,
        record: { wins: 0, losses: 0, draws: 0, koWins: 0, subWins: 0, decisionWins: 0 },
        winStreak: 0,
        overallRating: 14,
        ranking: { rank: null },
        notoriety: { score: 0, peakTier: "UNKNOWN" },
        beefFlags: [],
        media: { episodeCount: 0, beefsStarted: 0, documentaryStatus: "locked" },
        gymRanks: {},
        badgesEarned: [
            { badgeId: "pvp_prospect_s1", earnedAt: new Date(), context: "Season 1", seen: false },
            { badgeId: "pvp_contender_s2", earnedAt: new Date(), context: "Season 2", seen: true },
        ],
    };

    const profile = badgeService.buildBadgeProfile(fighter);
    const pg = profile.categories.find((c) => c.key === "proving_ground");
    assert.ok(pg, "Proving Ground category should exist");
    const ids = pg.badges.map((b) => b.id);
    assert.ok(ids.includes("pvp_prospect_s1"), "prospect badge must not be dropped");
    assert.ok(ids.includes("pvp_contender_s2"), "contender badge must not be dropped");
    // earnedCount should include both pvp badges.
    assert.ok(profile.earnedCount >= 2);
    // The unseen one is flagged "new".
    const prospect = pg.badges.find((b) => b.id === "pvp_prospect_s1");
    assert.equal(prospect.new, true);
});
