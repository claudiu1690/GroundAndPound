/**
 * Your Camp PHASE 2 — Q3: THE BADGE REMAP MUST NOT COST A VETERAN ANYTHING. Risk #2.
 *
 * Four of the ten gym badges are re-pointed so a Home Camp Rank-4 coach can earn them too
 * (P2-D2, Option C). The failure mode is silent and permanent: a veteran who earned "Champion
 * Boxer" at Iron Fist Boxing must never see it disappear, be re-awarded, or watch its progress
 * bar reset because the evaluator started reading the camp instead of the gym.
 *
 * The guarantee is ONE WORD — `Math.max(gymRankFor(...), campRank4For(...))`. These tests exist
 * so that if anyone ever "simplifies" that into an if/else, the suite goes red instead of
 * production going quiet.
 *
 * Pure functions throughout (badge conditions take plain objects), so no DB harness.
 *
 * Run with: node --test tests/services/badgeCatalog.campRemap.qa.test.js
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const { BADGES, GYM_BADGE_SLUGS, GYM_BADGE_TO_ARCHETYPE, getBadge } = require("../../consts/badgeCatalog");
const badgeService = require("../../services/badgeService");

const GYM_BADGE_IDS = Object.keys(GYM_BADGE_SLUGS);
const REMAPPED = Object.keys(GYM_BADGE_TO_ARCHETYPE);
const LEGACY = GYM_BADGE_IDS.filter((id) => !REMAPPED.includes(id));

function fighter(over = {}) {
    return {
        _id: "f1",
        record: { wins: 0, losses: 0, draws: 0 },
        gymRanks: {},
        gymPerks: [],
        campRank4Archetypes: [],
        badgesEarned: [],
        ...over,
    };
}

// ── the catalog itself ───────────────────────────────────────────────────────

test("Q3 all 10 gym badge defs are still in the catalog", () => {
    // Deleting a def makes getBadge(id) undefined and buildBadgeProfile silently DROPS an
    // earned badge from a veteran's Career Page. This is the sharpest edge in the change.
    assert.equal(GYM_BADGE_IDS.length, 10);
    for (const id of GYM_BADGE_IDS) {
        assert.ok(getBadge(id), `gym badge def "${id}" was deleted — a veteran's earned badge would vanish`);
    }
});

test("Q3 exactly 4 badges are re-pointed and 6 are flagged legacy", () => {
    assert.equal(REMAPPED.length, 4);
    assert.equal(LEGACY.length, 6);
    for (const id of REMAPPED) assert.equal(getBadge(id).legacy, false, `${id} must not be legacy`);
    for (const id of LEGACY) assert.equal(getBadge(id).legacy, true, `${id} must be legacy`);
});

test("Q3 the re-point follows the PERK mapping and the names never change", () => {
    assert.deepEqual(GYM_BADGE_TO_ARCHETYPE, {
        boxer_rank4: "STRIKING",
        wrestling_rank4: "WRESTLING",
        bjj_rank4: "BJJ",
        muaythai_rank4: "CONDITIONING",
    });
    // Frozen player-facing names — a badge already pinned on a Career Page must not be renamed.
    assert.equal(getBadge("boxer_rank4").name, "Champion Boxer");
    assert.equal(getBadge("wrestling_rank4").name, "Olympic Wrestler");
    assert.equal(getBadge("bjj_rank4").name, "BJJ Black Belt");
    assert.equal(getBadge("muaythai_rank4").name, "Grand Kru");
    // Only the four re-pointed descriptions gain the "or" clause.
    for (const id of REMAPPED) {
        assert.match(getBadge(id).description, /or take a .+ to Rank 4 in your camp\.$/, id);
    }
    for (const id of LEGACY) {
        assert.doesNotMatch(getBadge(id).description, /in your camp/, id);
    }
});

// ── non-regression ───────────────────────────────────────────────────────────

test("Q3 a veteran at gym Rank 4 who has NEVER opened the camp still qualifies and still shows 4/4", () => {
    for (const id of GYM_BADGE_IDS) {
        const slug = GYM_BADGE_SLUGS[id];
        const f = fighter({ gymRanks: { [slug]: { rank: 4, trainingSessions: 80, relevantWins: 12 } } });
        const def = getBadge(id);
        assert.equal(def.condition(f, {}), true, `${id} stopped qualifying from the gym side`);
        assert.deepEqual(def.progress(f), { current: 4, target: 4, unit: "rank" }, `${id} progress regressed`);
    }
});

test("Q3 Math.max — a gym Rank 4 is never lowered by an EMPTY campRank4Archetypes", () => {
    // The if/else refactor would break exactly here: camp says 0, gym says 4, answer must be 4.
    const f = fighter({
        gymRanks: { "iron-fist-boxing": { rank: 4 } },
        campRank4Archetypes: [],
    });
    assert.equal(getBadge("boxer_rank4").condition(f, {}), true);
    assert.equal(getBadge("boxer_rank4").progress(f).current, 4);
});

test("Q3 Math.max — a camp Rank 4 is never lowered by a LOW gym rank", () => {
    const f = fighter({
        gymRanks: { "iron-fist-boxing": { rank: 1 } },
        campRank4Archetypes: ["STRIKING"],
    });
    assert.equal(getBadge("boxer_rank4").condition(f, {}), true);
    assert.equal(getBadge("boxer_rank4").progress(f).current, 4);
});

test("Q3 a camp-only fighter earns exactly ONE badge per archetype — not four for striking", () => {
    // The whole reason Option A was rejected: GYM_SLUG_TO_DOMAIN collapses four striking gyms
    // into STRIKING, so a naive re-point would award boxer + kickboxing + muaythai + precision
    // for one Rank-4 Striking coach.
    const f = fighter({ campRank4Archetypes: ["STRIKING"] });
    const qualifying = GYM_BADGE_IDS.filter((id) => getBadge(id).condition(f, {}));
    assert.deepEqual(qualifying, ["boxer_rank4"]);
});

test("Q3 each archetype maps to its own single badge", () => {
    for (const [id, arche] of Object.entries(GYM_BADGE_TO_ARCHETYPE)) {
        const f = fighter({ campRank4Archetypes: [arche] });
        const qualifying = GYM_BADGE_IDS.filter((b) => getBadge(b).condition(f, {}));
        assert.deepEqual(qualifying, [id], `${arche} should award only ${id}`);
    }
});

test("Q3 the six legacy badges are UNREACHABLE from the camp side", () => {
    const f = fighter({ campRank4Archetypes: ["STRIKING", "WRESTLING", "BJJ", "CONDITIONING"] });
    for (const id of LEGACY) {
        assert.equal(getBadge(id).condition(f, {}), false, `${id} must stay gym-only`);
        assert.equal(getBadge(id).progress(f).current, 0);
    }
});

// ── evaluateBadges: no re-award, no removal ──────────────────────────────────

test("Q3 a veteran who ALREADY holds the badge is not re-awarded and does not lose it", () => {
    const f = fighter({
        gymRanks: { "iron-fist-boxing": { rank: 4 } },
        campRank4Archetypes: ["STRIKING"],
        badgesEarned: [{ badgeId: "boxer_rank4", earnedAt: new Date("2025-01-01"), context: null, seen: true }],
    });
    const before = JSON.parse(JSON.stringify(f.badgesEarned));
    const { newlyEarned } = badgeService.evaluateBadges(f, { campRankUp: true }, { silent: true });

    assert.equal(newlyEarned.some((b) => b.badgeId === "boxer_rank4"), false, "no re-award");
    assert.equal(f.badgesEarned.filter((e) => e.badgeId === "boxer_rank4").length, 1, "still exactly one entry");
    assert.deepEqual(JSON.parse(JSON.stringify(f.badgesEarned[0])), before[0], "the original ledger entry is untouched");
});

test("Q3 a camp-only fighter IS awarded the archetype badge on evaluation", () => {
    const f = fighter({ campRank4Archetypes: ["CONDITIONING"] });
    const { newlyEarned } = badgeService.evaluateBadges(f, { campRankUp: true }, { silent: true });
    assert.ok(newlyEarned.some((b) => b.badgeId === "muaythai_rank4"), "Grand Kru is the CONDITIONING payoff");
    assert.equal(f.badgesEarned.filter((e) => e.badgeId === "muaythai_rank4").length, 1);
});

// ── buildBadgeProfile: rendering + lockedCount ───────────────────────────────

function gymBadgesOf(profile) {
    return (profile.categories.find((c) => c.key === "gym") || { badges: [] }).badges;
}

test("Q3 all 10 gym badges still RENDER, and legacy ones are flagged", () => {
    const profile = badgeService.buildBadgeProfile(fighter());
    const rendered = gymBadgesOf(profile).filter((b) => GYM_BADGE_IDS.includes(b.id));
    assert.equal(rendered.length, 10, "every gym badge must remain visible");
    for (const b of rendered) {
        assert.equal(b.legacy, LEGACY.includes(b.id), `${b.id} legacy flag`);
    }
});

test("Q3 while the gyms are OPEN a legacy badge is shown and counted; earning it moves it to earned", () => {
    // NOTE: this suite runs with GYMS_RETIRED unset, i.e. the gyms are still running — so all
    // six legacy badges are genuinely obtainable and belong in the completion denominator.
    // They only leave the profile at the cutover; see the GYMS_RETIRED=true test below.
    const none = badgeService.buildBadgeProfile(fighter());
    // Same fighter, but now holding all six legacy badges.
    const veteran = badgeService.buildBadgeProfile(fighter({
        badgesEarned: LEGACY.map((id) => ({ badgeId: id, earnedAt: new Date(), context: null, seen: true })),
    }));

    assert.equal(veteran.earnedCount, none.earnedCount + 6, "earned legacy badges still count as earned");
    // Earning them MOVES them from locked to earned — it does not change the total.
    assert.equal(veteran.lockedCount, none.lockedCount - 6, "six moved out of locked into earned");
    assert.equal(
        veteran.earnedCount + veteran.lockedCount,
        none.earnedCount + none.lockedCount,
        "the denominator is stable — earning a badge never changes the total"
    );

    // The header must always equal what is actually rendered, in both fixtures.
    for (const prof of [none, veteran]) {
        const tiles = prof.categories.reduce((n, c) => n + c.badges.length, 0);
        assert.equal(prof.earnedCount + prof.lockedCount, tiles, "header must match rendered tiles");
    }

    // While the gyms are open, all six unearned legacy badges are still on screen to be chased.
    const lockedGymIds = gymBadgesOf(none).filter((b) => !b.earned && b.legacy).map((b) => b.id);
    assert.deepEqual(lockedGymIds.sort(), LEGACY.slice().sort());
});

test("Q3 a locked NON-legacy gym badge still counts toward lockedCount", () => {
    // Guard against over-applying the exclusion — the four re-pointed badges are still chaseable
    // and must keep contributing to the completion denominator.
    const base = badgeService.buildBadgeProfile(fighter());
    const withRemapped = badgeService.buildBadgeProfile(fighter({
        badgesEarned: REMAPPED.map((id) => ({ badgeId: id, earnedAt: new Date(), context: null, seen: true })),
    }));
    assert.equal(withRemapped.lockedCount, base.lockedCount - 4);
    assert.equal(withRemapped.earnedCount, base.earnedCount + 4);
});

// ── Q7 forward/back compat ───────────────────────────────────────────────────

test("Q7 a fighter with NO campRank4Archetypes field at all evaluates without throwing", () => {
    // Phase-1 documents (and any lean() read that omits the field) must not crash the catalog.
    const legacyDoc = { _id: "f2", record: {}, gymRanks: { "apex-wrestling": { rank: 4 } }, badgesEarned: [] };
    for (const def of BADGES) {
        assert.doesNotThrow(() => def.condition(legacyDoc, {}), `${def.id} threw on a Phase-1 document`);
        if (typeof def.progress === "function") {
            assert.doesNotThrow(() => def.progress(legacyDoc), `${def.id}.progress threw on a Phase-1 document`);
        }
    }
    assert.equal(getBadge("wrestling_rank4").condition(legacyDoc, {}), true, "the gym route still works");
});

test("Q7 a hostile campRank4Archetypes value cannot break evaluation", () => {
    for (const junk of [null, "STRIKING", 42, { STRIKING: true }, ["__proto__"], ["constructor"]]) {
        const f = fighter({ campRank4Archetypes: junk });
        for (const id of GYM_BADGE_IDS) {
            assert.doesNotThrow(() => getBadge(id).condition(f, {}), `${id} threw on ${JSON.stringify(junk)}`);
        }
        // A string is not an array — includes() must not be reached, and no badge may be granted.
        if (!Array.isArray(junk)) {
            assert.equal(getBadge("boxer_rank4").condition(f, {}), false);
        }
    }
});
