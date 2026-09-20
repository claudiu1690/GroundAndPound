/**
 * QA coverage for homeCampService.deriveInitialCampState (contract §6.2, the D2
 * gym→camp migration algorithm). Pure function — no DB needed, since it only
 * reads plain fields off a fighter-shaped object and returns a plain state
 * object ready for HomeCamp.create(). This locks in the head-coach selection,
 * the never-lowers-anything floor, the elite-fight-academy/community-mma
 * null-domain fallback, and the disciplineFamiliarity accumulation.
 *
 * Run with: node --test tests/services/homeCampService.migration.qa.test.js
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const homeCampService = require("../../services/homeCampService");
const { COACH_RANKS } = require("../../consts/homeCampConfig");

function fighter(overrides = {}) {
    return {
        _id: "fighter1",
        lastName: "Reed",
        style: "Wrestler",
        gymRanks: {},
        activeGymId: null,
        ...overrides,
    };
}

test("deriveInitialCampState: brand-new fighter (no gymRanks) is source NEW, style-based domain", () => {
    const f = fighter({ style: "Brazilian Jiu-Jitsu", gymRanks: {} });
    const state = homeCampService.deriveInitialCampState(f);
    assert.equal(state.origin.source, "NEW");
    assert.equal(state.origin.sourceGymSlug, null);
    assert.equal(state.focusDomain, "BJJ");
    assert.equal(state.coaches[0].rank, 1);
    assert.equal(state.coaches[0].sessionsCompleted, 0);
    assert.deepEqual(state.disciplineFamiliarity, {});
});

test("deriveInitialCampState: writes nothing onto the fighter object passed in", () => {
    const f = fighter({
        gymRanks: { "apex-wrestling": { rank: 2, trainingSessions: 20, relevantWins: 3 } },
    });
    const before = JSON.stringify(f);
    homeCampService.deriveInitialCampState(f);
    assert.equal(JSON.stringify(f), before, "deriveInitialCampState must never mutate its fighter input");
});

test("deriveInitialCampState: activeGymId's gym wins the head-coach slot over a higher-ranked gym", () => {
    const f = fighter({
        activeGymId: "gymA",
        gymRanks: {
            // Higher rank, but NOT the active gym.
            "iron-fist-boxing": { rank: 4, trainingSessions: 300, relevantWins: 80 },
            // Lower rank, but IS the active gym.
            "apex-wrestling": { rank: 2, trainingSessions: 20, relevantWins: 3 },
        },
    });
    const state = homeCampService.deriveInitialCampState(f, { gymA: "apex-wrestling" });
    assert.equal(state.origin.sourceGymSlug, "apex-wrestling", "active gym must win the head-coach tie-break");
    assert.equal(state.focusDomain, "WRESTLING");
    assert.equal(state.coaches[0].rank, 2);
    // The non-head gym (iron-fist-boxing, STRIKING) must still bank its familiarity.
    assert.deepEqual(state.disciplineFamiliarity, { STRIKING: { bankedSessions: 300, bankedWins: 80 } });
});

test("deriveInitialCampState: with no active-gym match, highest rank wins (ties -> most sessions)", () => {
    const f = fighter({
        activeGymId: null,
        gymRanks: {
            "gracie-ground-game": { rank: 3, trainingSessions: 50, relevantWins: 9 },
            "renzo-combat": { rank: 3, trainingSessions: 80, relevantWins: 11 }, // same rank, more sessions
            "iron-fist-boxing": { rank: 2, trainingSessions: 999, relevantWins: 999 },
        },
    });
    const state = homeCampService.deriveInitialCampState(f);
    assert.equal(state.origin.sourceGymSlug, "renzo-combat", "tie on rank must break on sessions");
    assert.equal(state.focusDomain, "BJJ");
});

test("deriveInitialCampState: elite-fight-academy and community-mma never become head or bank familiarity, and the active-gym match falls through when it resolves to null", () => {
    const f = fighter({
        style: "Muay Thai",
        activeGymId: "gymElite",
        gymRanks: {
            "elite-fight-academy": { rank: 4, trainingSessions: 500, relevantWins: 100 },
            "community-mma": { rank: 1, trainingSessions: 5, relevantWins: 0 },
        },
    });
    const state = homeCampService.deriveInitialCampState(f, { gymElite: "elite-fight-academy" });
    assert.equal(state.origin.source, "NEW", "no convertible gym exists, so this must be a fresh camp");
    assert.equal(state.origin.sourceGymSlug, null);
    assert.equal(state.focusDomain, "STRIKING", "must fall back to STYLE_TO_DOMAIN[fighter.style]");
    assert.deepEqual(state.disciplineFamiliarity, {}, "null-domain gyms must never bank familiarity");
});

test("deriveInitialCampState: never-below-requirements floor — a migrated rank-4 coach's sessions/wins are floored at rank 4's own requirements even if the source gym recorded less", () => {
    const f = fighter({
        activeGymId: "gymTitan",
        gymRanks: {
            // Rank 4 but with sessions/wins BELOW what COACH_RANKS[4] requires — a
            // plausible legacy data mismatch the floor must correct.
            "titan-performance": { rank: 4, trainingSessions: 1, relevantWins: 0 },
        },
    });
    const state = homeCampService.deriveInitialCampState(f, { gymTitan: "titan-performance" });
    assert.equal(state.coaches[0].rank, 4);
    assert.equal(state.coaches[0].sessionsCompleted, COACH_RANKS[4].sessions, "floored up to rank 4's requirement");
    assert.equal(state.coaches[0].relevantWins, COACH_RANKS[4].wins, "floored up to rank 4's requirement");
});

test("deriveInitialCampState: never-below floor also holds when the source data EXCEEDS the rank requirement", () => {
    const f = fighter({
        activeGymId: "gymApex",
        gymRanks: {
            "apex-wrestling": { rank: 2, trainingSessions: 999, relevantWins: 999 },
        },
    });
    const state = homeCampService.deriveInitialCampState(f, { gymApex: "apex-wrestling" });
    assert.equal(state.coaches[0].sessionsCompleted, 999, "max(source, requirement) must keep the larger value");
    assert.equal(state.coaches[0].relevantWins, 999);
});

test("deriveInitialCampState: __proto__ / constructor keys in gymRanks (hostile Mixed-field input) are never resolved through Object.prototype", () => {
    const f = fighter({
        gymRanks: JSON.parse('{"__proto__": {"rank": 4, "trainingSessions": 999, "relevantWins": 999}, "constructor": {"rank": 4}}'),
    });
    const state = homeCampService.deriveInitialCampState(f);
    // Must fall through to the style-based NEW camp — a poisoned key must never
    // resolve to a fake "gym" via the JS prototype chain.
    assert.equal(state.origin.source, "NEW");
    assert.equal(state.coaches[0].rank, 1);
});

test("deriveInitialCampState: unknown/garbage fighter.style falls back to DEFAULT_DOMAIN, never throws", () => {
    const f = fighter({ style: "Some Made Up Style", gymRanks: {} });
    assert.doesNotThrow(() => homeCampService.deriveInitialCampState(f));
    const state = homeCampService.deriveInitialCampState(f);
    assert.equal(state.focusDomain, "STRIKING"); // DEFAULT_DOMAIN
});

test("deriveInitialCampState: camp name is derived from lastName and truncated to CAMP_NAME_MAX", () => {
    const f = fighter({ lastName: "A".repeat(40) });
    const state = homeCampService.deriveInitialCampState(f);
    assert.ok(state.name.length <= 28, "name must never exceed CAMP_NAME_MAX");
});
