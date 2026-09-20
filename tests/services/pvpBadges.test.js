const assert = require("node:assert/strict");
const { test } = require("node:test");

const { resolvePvpBadge, PVP_BADGE_DEFS } = require("../../consts/pvpBadges");
const { badgeIdFor } = require("../../consts/pvpConfig");
const badgeService = require("../../services/badgeService");
const {
    evaluatePvpFightBadges,
    evaluatePvpSeasonBadges,
} = require("../../services/pvpBadgeService");

// ── helpers ──────────────────────────────────────────────────────────────────
// Stand-in for a Mongoose doc: awardBadge calls fighter.markModified, so provide a no-op.
function fighter() {
    return { badgesEarned: [], markModified() {} };
}
function fighterWith(...ids) {
    return {
        badgesEarned: ids.map((badgeId) => ({ badgeId, earnedAt: new Date(), seen: false })),
        markModified() {},
    };
}
function ids(f) {
    return (f.badgesEarned || []).map((e) => e.badgeId);
}
function has(f, id) {
    return ids(f).includes(id);
}
function fightCtx(over = {}) {
    return {
        attackerWon: true,
        isDraw: false,
        method: "decision",
        bracketTier: "none",
        isRivalryResolved: false,
        isBeltHolderFight: false,
        twistApplied: false,
        viewerIsAttacker: true,
        ...over,
    };
}
function rec(over = {}) {
    return { division: "prospect", winStreak: 0, wins: 0, losses: 0, ...over };
}

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

// ── Batch-1 fixed-id descriptors via resolvePvpBadge ─────────────────────────

test("resolvePvpBadge returns the full fixed descriptor for all 22 Batch-1 ids", () => {
    const fixedIds = Object.keys(PVP_BADGE_DEFS);
    assert.equal(fixedIds.length, 22);
    for (const id of fixedIds) {
        const r = resolvePvpBadge(id);
        assert.ok(r, `expected descriptor for ${id}`);
        assert.equal(r.id, id);
        assert.equal(r.category, "proving_ground");
        assert.ok(r.name && r.description && r.icon && r.color, `descriptor fields for ${id}`);
    }
});

test("fixed id pvp_first_blood is NOT parsed by the season regex branches", () => {
    const r = resolvePvpBadge("pvp_first_blood");
    assert.equal(r.name, "First Blood");
    assert.equal(r.season, undefined, "fixed id must not carry a parsed season");
});

// ── evaluatePvpFightBadges ───────────────────────────────────────────────────

test("attacker win → first_blood; defender does NOT get it", () => {
    const att = fighter();
    evaluatePvpFightBadges(att, rec(), fightCtx({ viewerIsAttacker: true }));
    assert.ok(has(att, "pvp_first_blood"));

    const def = fighter();
    evaluatePvpFightBadges(def, rec(), fightCtx({ viewerIsAttacker: false, attackerWon: false }));
    assert.ok(!has(def, "pvp_first_blood"));
});

test("method ko → first_finish (attacker win)", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec(), fightCtx({ method: "ko" }));
    assert.ok(has(f, "pvp_first_finish"));
    const g = fighter();
    evaluatePvpFightBadges(g, rec(), fightCtx({ method: "decision" }));
    assert.ok(!has(g, "pvp_first_finish"));
});

test("defender hold → first_defense", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec(), fightCtx({ viewerIsAttacker: false, attackerWon: false }));
    assert.ok(has(f, "pvp_first_defense"));
});

test("defender win by KO → first_finish", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec(), fightCtx({
        viewerIsAttacker: false, attackerWon: false, method: "ko", isDraw: false,
    }));
    assert.ok(has(f, "pvp_first_finish"));
});

test("bracketTier plus10 → giant_killer only; plus25 → both; none → neither", () => {
    const a = fighter();
    evaluatePvpFightBadges(a, rec(), fightCtx({ bracketTier: "plus10" }));
    assert.ok(has(a, "pvp_giant_killer"));
    assert.ok(!has(a, "pvp_giant_slayer"));

    const b = fighter();
    evaluatePvpFightBadges(b, rec(), fightCtx({ bracketTier: "plus25" }));
    assert.ok(has(b, "pvp_giant_killer"));
    assert.ok(has(b, "pvp_giant_slayer"));

    const c = fighter();
    evaluatePvpFightBadges(c, rec(), fightCtx({ bracketTier: "none" }));
    assert.ok(!has(c, "pvp_giant_killer"));
    assert.ok(!has(c, "pvp_giant_slayer"));
});

test("winStreak thresholds 3/5/10", () => {
    const s3 = fighter();
    evaluatePvpFightBadges(s3, rec({ winStreak: 3 }), fightCtx());
    assert.deepEqual(
        ["pvp_streak_3", "pvp_streak_5", "pvp_streak_10"].filter((x) => has(s3, x)),
        ["pvp_streak_3"]
    );
    const s5 = fighter();
    evaluatePvpFightBadges(s5, rec({ winStreak: 5 }), fightCtx());
    assert.ok(has(s5, "pvp_streak_3") && has(s5, "pvp_streak_5") && !has(s5, "pvp_streak_10"));
    const s10 = fighter();
    evaluatePvpFightBadges(s10, rec({ winStreak: 10 }), fightCtx());
    assert.ok(has(s10, "pvp_streak_3") && has(s10, "pvp_streak_5") && has(s10, "pvp_streak_10"));
});

test("division elite → reach contender/challenger/elite but not champion", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec({ division: "elite" }), fightCtx());
    assert.ok(has(f, "pvp_reach_contender"));
    assert.ok(has(f, "pvp_reach_challenger"));
    assert.ok(has(f, "pvp_reach_elite"));
    assert.ok(!has(f, "pvp_reach_champion"));
});

test("isRivalryResolved → rival_first (attacker only)", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec(), fightCtx({ isRivalryResolved: true }));
    assert.ok(has(f, "pvp_rival_first"));
});

test("belt-holder defender hold → belt_defense", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec(), fightCtx({
        viewerIsAttacker: false, attackerWon: false, isBeltHolderFight: true,
    }));
    assert.ok(has(f, "pvp_belt_defense"));
});

test("twistApplied → twist_master on a win", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec(), fightCtx({ twistApplied: true }));
    assert.ok(has(f, "pvp_twist_master"));
});

test("defender win under a method-bonus twist → twist_master (guards P1 fix)", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec(), fightCtx({
        viewerIsAttacker: false, attackerWon: false, isDraw: false, method: "ko", twistApplied: true,
    }));
    assert.ok(has(f, "pvp_twist_master"));
});

test("DRAW suppresses all win-gated badges", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec({ division: "elite", winStreak: 10 }), fightCtx({
        attackerWon: false, isDraw: true, method: "ko", bracketTier: "plus25", twistApplied: true,
    }));
    assert.ok(!has(f, "pvp_first_blood"));
    assert.ok(!has(f, "pvp_first_finish"));
    assert.ok(!has(f, "pvp_giant_killer"));
    assert.ok(!has(f, "pvp_giant_slayer"));
    assert.ok(!has(f, "pvp_twist_master"));
    // Reach + streak are state-based, not win-gated — still awarded.
    assert.ok(has(f, "pvp_reach_elite"));
    assert.ok(has(f, "pvp_streak_10"));
});

// ── evaluatePvpSeasonBadges ──────────────────────────────────────────────────

test("isBelt → belt_first", () => {
    const f = fighterWith("pvp_belt_s4_lightweight");
    evaluatePvpSeasonBadges(f, rec({ wins: 5, losses: 1 }), {
        isBelt: true, ladderRank: 1, weightClass: "Lightweight", seasonNumber: 4,
    });
    assert.ok(has(f, "pvp_belt_first"));
});

test("belts s1+s3 then mint s4 → belt_2 yes + belt_b2b yes (s3,s4)", () => {
    const f = fighterWith("pvp_belt_s1_lightweight", "pvp_belt_s3_lightweight", "pvp_belt_s4_lightweight");
    evaluatePvpSeasonBadges(f, rec({ wins: 5, losses: 2 }), {
        isBelt: true, ladderRank: 1, weightClass: "Lightweight", seasonNumber: 4,
    });
    assert.ok(has(f, "pvp_belt_2"));
    assert.ok(has(f, "pvp_belt_b2b"));
});

test("belts s1+s5 gap → belt_2 yes, b2b no", () => {
    const f = fighterWith("pvp_belt_s1_lightweight", "pvp_belt_s5_lightweight");
    evaluatePvpSeasonBadges(f, rec({ wins: 5, losses: 2 }), {
        isBelt: true, ladderRank: 1, weightClass: "Lightweight", seasonNumber: 5,
    });
    assert.ok(has(f, "pvp_belt_2"));
    assert.ok(!has(f, "pvp_belt_b2b"));
});

test("pvp_belt_s1_open → open_champion", () => {
    const f = fighterWith("pvp_belt_s1_open");
    evaluatePvpSeasonBadges(f, rec({ wins: 5, losses: 2 }), {
        isBelt: true, ladderRank: 1, weightClass: "Open", seasonNumber: 1,
    });
    assert.ok(has(f, "pvp_open_champion"));
});

// ── Open seasons continue past Season 1 (OPEN_SPLIT_AT_SEASON stays null) ───────
// Every Open season mints its own belt id, so the ids must not collide and the
// Season-1-only "Open Champion" pin must not leak onto later Open belts.

test("badgeIdFor: an Open Season 2 belt is pvp_belt_s2_open (no S1 collision)", () => {
    assert.equal(badgeIdFor("belt", 2, "Open"), "pvp_belt_s2_open");
    assert.notEqual(badgeIdFor("belt", 2, "Open"), badgeIdFor("belt", 1, "Open"));
});

test("resolvePvpBadge: pvp_belt_s2_open resolves with Open copy", () => {
    const r = resolvePvpBadge("pvp_belt_s2_open");
    assert.ok(r, "a second Open belt must not fall through to null");
    assert.equal(r.season, 2);
    assert.equal(r.icon, "Crown");
    assert.equal(r.category, "proving_ground");
    assert.ok(r.name.includes("Open"), `expected Open copy, got: ${r.name}`);
    assert.ok(r.description.includes("all weight classes"));
});

test("pvp_belt_s2_open alone does NOT grant open_champion (Season 1 only)", () => {
    const f = fighterWith("pvp_belt_s2_open");
    evaluatePvpSeasonBadges(f, rec({ wins: 6, losses: 1 }), {
        isBelt: true, ladderRank: 1, weightClass: "Open", seasonNumber: 2,
    });
    assert.ok(!has(f, "pvp_open_champion"), "Open Champion is pinned to the Season 1 belt");
    assert.ok(has(f, "pvp_belt_first"));
    assert.ok(!has(f, "pvp_belt_2"), "one belt season is not two");
});

test("Open belts s1+s2 → belt_2 + belt_b2b (the seasonal regexes work across Open)", () => {
    const f = fighterWith("pvp_belt_s1_open", "pvp_belt_s2_open");
    evaluatePvpSeasonBadges(f, rec({ wins: 7, losses: 1 }), {
        isBelt: true, ladderRank: 1, weightClass: "Open", seasonNumber: 2,
    });
    assert.ok(has(f, "pvp_belt_2"));
    assert.ok(has(f, "pvp_belt_b2b"));
    assert.ok(has(f, "pvp_open_champion"), "the S1 Open belt still grants it");
});

test("isBelt & losses 0 → undefeated_champ; losses 1 → no", () => {
    const win = fighterWith("pvp_belt_s2_lightweight");
    evaluatePvpSeasonBadges(win, rec({ wins: 8, losses: 0 }), {
        isBelt: true, ladderRank: 1, weightClass: "Lightweight", seasonNumber: 2,
    });
    assert.ok(has(win, "pvp_undefeated_champ"));

    const loss = fighterWith("pvp_belt_s2_lightweight");
    evaluatePvpSeasonBadges(loss, rec({ wins: 8, losses: 1 }), {
        isBelt: true, ladderRank: 1, weightClass: "Lightweight", seasonNumber: 2,
    });
    assert.ok(!has(loss, "pvp_undefeated_champ"));
});

test("ladderRank 3 → top3; 4 → no", () => {
    const a = fighter();
    evaluatePvpSeasonBadges(a, rec({ wins: 3, losses: 3 }), {
        isBelt: false, ladderRank: 3, weightClass: "Lightweight", seasonNumber: 2,
    });
    assert.ok(has(a, "pvp_top3"));
    const b = fighter();
    evaluatePvpSeasonBadges(b, rec({ wins: 3, losses: 3 }), {
        isBelt: false, ladderRank: 4, weightClass: "Lightweight", seasonNumber: 2,
    });
    assert.ok(!has(b, "pvp_top3"));
});

test("losses 0 & wins 10 → unbeaten_season; wins 9 → no", () => {
    const a = fighter();
    evaluatePvpSeasonBadges(a, rec({ wins: 10, losses: 0 }), {
        isBelt: false, ladderRank: 5, weightClass: "Lightweight", seasonNumber: 2,
    });
    assert.ok(has(a, "pvp_unbeaten_season"));
    const b = fighter();
    evaluatePvpSeasonBadges(b, rec({ wins: 9, losses: 0 }), {
        isBelt: false, ladderRank: 5, weightClass: "Lightweight", seasonNumber: 2,
    });
    assert.ok(!has(b, "pvp_unbeaten_season"));
});

// ── Idempotency ──────────────────────────────────────────────────────────────

test("evaluatePvpFightBadges twice with same ctx → one entry per id", () => {
    const f = fighter();
    const ctx = fightCtx({ method: "ko", bracketTier: "plus25" });
    const r = rec({ division: "elite", winStreak: 3 });
    evaluatePvpFightBadges(f, r, ctx);
    evaluatePvpFightBadges(f, r, ctx);
    const counts = {};
    for (const id of ids(f)) counts[id] = (counts[id] || 0) + 1;
    for (const [id, n] of Object.entries(counts)) {
        assert.equal(n, 1, `${id} should appear exactly once`);
    }
});

test("streak 3 then 5 → both present once", () => {
    const f = fighter();
    evaluatePvpFightBadges(f, rec({ winStreak: 3 }), fightCtx());
    evaluatePvpFightBadges(f, rec({ winStreak: 5 }), fightCtx());
    assert.equal(ids(f).filter((x) => x === "pvp_streak_3").length, 1);
    assert.equal(ids(f).filter((x) => x === "pvp_streak_5").length, 1);
    assert.ok(has(f, "pvp_streak_3") && has(f, "pvp_streak_5"));
});
