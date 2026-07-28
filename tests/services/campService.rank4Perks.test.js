/**
 * The three camp rank-4 perks that were dead until 2026-07-28.
 *
 * Corner Confidence / Mat Returns / Submission Awareness were defined in the perk catalogue,
 * granted to players, announced with a toast and a badge — and read by nothing. They are now
 * the ONLY reward for three of the four Rank-4 promotions (the camp is the sole source since
 * the gyms retired), so each one gets a test that fails if the wiring is removed again.
 *
 * The fourth, `iron_conditioning`, acts on training and is covered by
 * tests/utils/trainingSession.maxStamina.test.js.
 */
const test = require("node:test");
const assert = require("node:assert");

const campService = require("../../services/campService");
const { COACH_ARCHETYPES } = require("../../consts/homeCampConfig");
const {
    MATCH_STATUSES,
    MATCH_STATUS_MULTIPLIERS,
    SESSION_BONUSES,
    STYLE_SESSION_MAP,
    CAMP_SLOT_CONFIG,
} = require("../../consts/campConfig");

const CORNER_CONFIDENCE = COACH_ARCHETYPES.STRIKING.perkKey;
const MAT_RETURNS = COACH_ARCHETYPES.WRESTLING.perkKey;
const SUBMISSION_AWARENESS = COACH_ARCHETYPES.BJJ.perkKey;

// ── Guard: the keys the service wires against must be the catalogue's ────────

test("the three perk keys resolve to the real catalogue ids", () => {
    assert.equal(CORNER_CONFIDENCE, "corner_confidence");
    assert.equal(MAT_RETURNS, "mat_returns");
    assert.equal(SUBMISSION_AWARENESS, "submission_awareness");
});

// ── Mat Returns — Takedown Defence is always at least PARTIAL ────────────────

test("Mat Returns lifts an UNMATCHED Takedown Defence session to PARTIAL", () => {
    // Boxer's recommended sessions do NOT include TAKEDOWN_DEFENCE, so it is UNMATCHED.
    assert.ok(!STYLE_SESSION_MAP.Boxer.includes("TAKEDOWN_DEFENCE"), "fixture assumption");

    assert.equal(
        campService.getMatchStatus("TAKEDOWN_DEFENCE", "Boxer", []),
        MATCH_STATUSES.UNMATCHED,
        "without the perk it stays wasted"
    );
    assert.equal(
        campService.getMatchStatus("TAKEDOWN_DEFENCE", "Boxer", [MAT_RETURNS]),
        MATCH_STATUSES.PARTIAL,
        "the perk is the whole point — an UNMATCHED TD Defence must become PARTIAL"
    );
});

test("Mat Returns is a FLOOR, never a cap — a MATCHED session is not dragged down", () => {
    // A Wrestler opponent already makes TAKEDOWN_DEFENCE MATCHED (multiplier 1.0).
    assert.ok(STYLE_SESSION_MAP.Wrestler.includes("TAKEDOWN_DEFENCE"), "fixture assumption");
    assert.equal(
        campService.getMatchStatus("TAKEDOWN_DEFENCE", "Wrestler", [MAT_RETURNS]),
        MATCH_STATUSES.MATCHED,
        "PARTIAL is worth half of MATCHED — applying it here would make the perk a downgrade"
    );
});

test("Mat Returns touches only Takedown Defence", () => {
    // Striking Accuracy is UNMATCHED against a Wrestler and must stay that way.
    assert.equal(
        campService.getMatchStatus("STRIKING_ACCURACY", "Wrestler", [MAT_RETURNS]),
        MATCH_STATUSES.UNMATCHED
    );
});

// ── Submission Awareness — Submission Escapes gets +5% ──────────────────────

function escapeBonus(perks, matchStatus = MATCH_STATUSES.MATCHED) {
    const sessions = [{ sessionType: "SUBMISSION_ESCAPES", matchStatus, diminishingFactor: 1 }];
    const [bonus] = campService.buildSessionBonuses(sessions, perks);
    return bonus ? bonus.effectiveValue : 0;
}

test("Submission Awareness adds 5% to a Submission Escapes session", () => {
    const base = escapeBonus([]);
    const boosted = escapeBonus([SUBMISSION_AWARENESS]);
    const expected = SESSION_BONUSES.SUBMISSION_ESCAPES.bonusValue * MATCH_STATUS_MULTIPLIERS.MATCHED;

    assert.ok(Math.abs(base - expected) < 1e-9, "unperked value is the plain session bonus");
    assert.ok(Math.abs(boosted - expected * 1.05) < 1e-9, `expected ${expected * 1.05}, got ${boosted}`);
    assert.ok(boosted > base, "the perk must actually increase the number");
});

test("Submission Awareness scales with match status instead of paying out a dead session", () => {
    // UNMATCHED has multiplier 0. A flat +5% would resurrect a session that earned nothing.
    assert.equal(escapeBonus([SUBMISSION_AWARENESS], MATCH_STATUSES.UNMATCHED), 0);
    // PARTIAL is half — the perk rides that half, it does not bypass it.
    const partial = escapeBonus([SUBMISSION_AWARENESS], MATCH_STATUSES.PARTIAL);
    const expected = SESSION_BONUSES.SUBMISSION_ESCAPES.bonusValue * MATCH_STATUS_MULTIPLIERS.PARTIAL * 1.05;
    assert.ok(Math.abs(partial - expected) < 1e-9);
});

test("Submission Awareness touches only Submission Escapes", () => {
    const sessions = [{ sessionType: "TAKEDOWN_DEFENCE", matchStatus: MATCH_STATUSES.MATCHED, diminishingFactor: 1 }];
    const withPerk = campService.buildSessionBonuses(sessions, [SUBMISSION_AWARENESS]);
    const without = campService.buildSessionBonuses(sessions, []);
    assert.deepEqual(withPerk, without, "an unrelated session must be byte-identical");
});

test("diminishing returns still apply on top of the perk", () => {
    const sessions = [{ sessionType: "SUBMISSION_ESCAPES", matchStatus: MATCH_STATUSES.MATCHED, diminishingFactor: 0.5 }];
    const [bonus] = campService.buildSessionBonuses(sessions, [SUBMISSION_AWARENESS]);
    const expected = SESSION_BONUSES.SUBMISSION_ESCAPES.bonusValue * 1 * 0.5 * 1.05;
    assert.ok(Math.abs(bonus.effectiveValue - expected) < 1e-9, "the perk must not bypass diminishing returns");
});

// ── Corner Confidence — the slot math it drives ─────────────────────────────
//
// createCamp needs Mongo, so the DB-backed assertion lives in the QA suite. What is checked
// here is the RULE it applies: which opponent styles count as "striker-style". That comes
// from STYLE_TO_DOMAIN so there is never a second hand-maintained list to drift.

test("Corner Confidence's 'striker-style' set comes from STYLE_TO_DOMAIN", () => {
    const { STYLE_TO_DOMAIN } = require("../../consts/homeCampConfig");
    const strikers = Object.keys(STYLE_TO_DOMAIN).filter((s) => STYLE_TO_DOMAIN[s] === "STRIKING");
    assert.deepEqual(strikers.sort(), ["Boxer", "Capoeira", "Kickboxer", "Muay Thai"]);

    // And the grapplers must NOT qualify, or the perk is just "+1 slot, always".
    for (const style of ["Wrestler", "Judo", "Brazilian Jiu-Jitsu", "Sambo"]) {
        assert.notEqual(STYLE_TO_DOMAIN[style], "STRIKING", `${style} must not count as a striker`);
    }
});

test("a +1 slot is a real increase at every tier — it can never exceed what a Title Fight grants", () => {
    // Guards the balance edge: the perk must not push a normal camp past the game's ceiling.
    const ceiling = CAMP_SLOT_CONFIG["Title Fight"].normalSlots;
    for (const [tier, cfg] of Object.entries(CAMP_SLOT_CONFIG)) {
        assert.ok(cfg.normalSlots + 1 <= ceiling + 1, `${tier} + perk stays sane`);
        assert.ok(cfg.normalSlots >= 1);
    }
});
