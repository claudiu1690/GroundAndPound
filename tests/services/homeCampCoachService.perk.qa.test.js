/**
 * QA coverage for the rank-4 coach PERK state (Coach.perk) and the truthfulness of the
 * Development Track's rank-4 caption.
 *
 * WHY THIS EXISTS: a player whose gym history converted their coach in at rank 4
 * (homeCampService.deriveInitialCampState) never went through attemptPromotion, and the
 * conversion writes NOTHING to the fighter document by design (contract §6.3). Without
 * Coach.perk the camp screen shows a maxed coach with nextRank:null, no perk and nothing to
 * do. These tests lock in that the payload always answers one of exactly three truths for a
 * maxed coach: the perk is held, the perk is claimable, or the archetype has no perk.
 *
 * Pure-function tests — buildPerkView / buildRankLabels / grantsForRank / buildCoachView take
 * plain objects, so no DB harness is required (same style as the other homeCamp test files).
 * The claim ENDPOINT's write path (idempotency, concurrency, additive grant) is DB-bound and
 * is verified live against local Mongo.
 *
 * Run with: node --test tests/services/homeCampCoachService.perk.qa.test.js
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const coachService = require("../../services/homeCampCoachService");
const { COACH_MAX_RANK, perkForArchetype } = require("../../consts/homeCampConfig");

const WRESTLING_PERK = perkForArchetype("WRESTLING");
const STRIKING_PERK = perkForArchetype("STRIKING");

function coach(overrides = {}) {
    return {
        _id: "coach1",
        archetype: "WRESTLING",
        name: "Viktor Petrov",
        initials: "VP",
        rarity: "COMMON",
        isStarter: true,
        wage: 0,
        rank: 4,
        sessionsCompleted: 60,
        relevantWins: 10,
        morale: 100,
        teachPoolMoveIds: ["SPRAWL_INSTINCT"],
        taughtMoveIds: [],
        ...overrides,
    };
}

function fighter(overrides = {}) {
    return {
        _id: "fighter1",
        iron: 10000,
        gymPerks: [],
        promotionTier: "Regional Pro",
        injuries: [],
        ...overrides,
    };
}

const NO_BLOCKS = { spar: null, bag: null, none: null };

// ── buildPerkView ────────────────────────────────────────────────────────────

test("buildPerkView: rank-4 coach whose perk is NOT in gymPerks is claimable (the migration case)", () => {
    const view = coachService.buildPerkView(coach({ rank: 4 }), fighter({ gymPerks: [] }));
    assert.equal(view.key, WRESTLING_PERK.key);
    assert.equal(view.name, WRESTLING_PERK.name, "name must come from the gym perk catalog, never re-declared");
    assert.equal(view.effect, WRESTLING_PERK.effect);
    assert.equal(view.held, false);
    assert.equal(view.claimable, true);
});

test("buildPerkView: rank-4 coach whose perk IS already held is held, not claimable", () => {
    const view = coachService.buildPerkView(coach({ rank: 4 }), fighter({ gymPerks: [WRESTLING_PERK.key] }));
    assert.equal(view.held, true);
    assert.equal(view.claimable, false, "never offer a claim for something already owned");
});

test("buildPerkView: below rank 4 is never claimable, even with an empty gymPerks", () => {
    for (const rank of [1, 2, 3]) {
        const view = coachService.buildPerkView(coach({ rank }), fighter({ gymPerks: [] }));
        assert.equal(view.claimable, false, `rank ${rank} must not be claimable`);
        assert.equal(view.held, false);
    }
});

test("buildPerkView: an unrelated gym perk does not count as this archetype's perk", () => {
    const view = coachService.buildPerkView(coach({ rank: 4 }), fighter({ gymPerks: ["strength_reserve"] }));
    assert.equal(view.held, false);
    assert.equal(view.claimable, true);
});

test("buildPerkView: missing/garbage gymPerks is tolerated (hostile/legacy documents)", () => {
    for (const gymPerks of [undefined, null, "corner_confidence", 42, {}]) {
        const view = coachService.buildPerkView(coach({ rank: 4 }), fighter({ gymPerks }));
        assert.equal(view.held, false);
        assert.equal(view.claimable, true);
    }
});

test("buildPerkView: unknown archetype yields null rather than throwing", () => {
    assert.equal(coachService.buildPerkView(coach({ archetype: "NOPE" }), fighter()), null);
    assert.equal(coachService.buildPerkView(null, fighter()), null);
});

// ── rankLabels[3] honesty ────────────────────────────────────────────────────

test("rankLabels[3]: names the perk and does NOT assert possession when it is unclaimed", () => {
    const c = coach({ rank: 4 });
    const perk = coachService.buildPerkView(c, fighter({ gymPerks: [] }));
    const labels = coachService.buildRankLabels(c, perk);
    assert.equal(labels.length, COACH_MAX_RANK);
    assert.ok(labels[3].includes(WRESTLING_PERK.name), "the rank-4 caption must still NAME the perk");
    assert.ok(/unclaimed/i.test(labels[3]), "an unclaimed perk must not read as already earned");
});

test("rankLabels[3]: reads as a plain grant once the perk is actually held", () => {
    const c = coach({ rank: 4 });
    const perk = coachService.buildPerkView(c, fighter({ gymPerks: [WRESTLING_PERK.key] }));
    const labels = coachService.buildRankLabels(c, perk);
    assert.equal(labels[3], `${WRESTLING_PERK.name} perk`);
    assert.ok(!/unclaimed/i.test(labels[3]));
});

test("rankLabels[3]: a future rank-4 node (coach below rank 4) still advertises the perk plainly", () => {
    const c = coach({ rank: 2 });
    const perk = coachService.buildPerkView(c, fighter({ gymPerks: [] }));
    assert.equal(coachService.buildRankLabels(c, perk)[3], `${WRESTLING_PERK.name} perk`);
});

test("rankLabels: still returns 4 captions with no perk view passed (back-compatible)", () => {
    const labels = coachService.buildRankLabels(coach({ rank: 4 }));
    assert.equal(labels.length, 4);
    assert.equal(labels[0], "Joined your camp");
    assert.equal(labels[3], `${WRESTLING_PERK.name} perk`);
});

// ── nextRank.grants must not sell an owned perk ──────────────────────────────

test("grantsForRank: promoting to rank 4 does not promise to 'unlock' a perk the player holds", () => {
    const c = coach({ rank: 3 });
    const held = coachService.buildPerkView(c, fighter({ gymPerks: [WRESTLING_PERK.key] }));
    const notHeld = coachService.buildPerkView(c, fighter({ gymPerks: [] }));
    assert.ok(/already hold/i.test(coachService.grantsForRank(c, 4, held)));
    assert.ok(/Unlocks perk/i.test(coachService.grantsForRank(c, 4, notHeld)));
});

// ── buildCoachView wiring ────────────────────────────────────────────────────

test("buildCoachView: a maxed coach exposes nextRank:null AND a truthful perk block", () => {
    const view = coachService.buildCoachView(coach({ rank: 4 }), fighter({ gymPerks: [] }), NO_BLOCKS);
    assert.equal(view.nextRank, null, "nothing left to promote toward");
    assert.ok(view.perk, "…so the perk block is the only thing left that can be true");
    assert.equal(view.perk.claimable, true);
    assert.equal(view.perk.held, false);
});

test("buildCoachView: perk block is present at every rank, and agrees with rankLabels[3]", () => {
    for (const rank of [1, 2, 3, 4]) {
        const view = coachService.buildCoachView(coach({ rank }), fighter({ gymPerks: [] }), NO_BLOCKS);
        assert.ok(view.perk, `rank ${rank} must still describe the archetype perk`);
        assert.equal(view.perk.key, WRESTLING_PERK.key);
        assert.equal(/unclaimed/i.test(view.rankLabels[3]), view.perk.claimable);
    }
});

test("buildCoachView: the perk block is per-archetype (a striking coach never shows the wrestling perk)", () => {
    const view = coachService.buildCoachView(
        coach({ archetype: "STRIKING", rank: 4, teachPoolMoveIds: ["HEAVY_HANDS"] }),
        fighter({ gymPerks: [] }),
        NO_BLOCKS
    );
    assert.equal(view.perk.key, STRIKING_PERK.key);
    assert.notEqual(STRIKING_PERK.key, WRESTLING_PERK.key);
});

test("buildCoachView: returns a FRESH perk object per call — no shared config leaking between requests", () => {
    const c = coach({ rank: 4 });
    const a = coachService.buildCoachView(c, fighter({ gymPerks: [] }), NO_BLOCKS);
    a.perk.name = "MUTATED";
    a.perk.held = true;
    const b = coachService.buildCoachView(c, fighter({ gymPerks: [] }), NO_BLOCKS);
    assert.equal(b.perk.name, WRESTLING_PERK.name);
    assert.equal(b.perk.held, false);
});
