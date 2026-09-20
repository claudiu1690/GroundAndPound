/**
 * The CONDITIONING coach's camp-wide injury passive.
 *
 * WHY IT EXISTS: he is the only archetype with statless drills (2 of 4), and both pay out in
 * CAPPED resources — Max Stamina stops at 120, Facility Condition at 100. Once a player
 * topped both out, half his kit was dead and he had no reason to hold a slot. The passive is
 * the reason that can't expire, so these tests guard the properties that make it fair.
 */
const test = require("node:test");
const assert = require("node:assert");

const { effectiveInjuryRate } = require("../../services/homeCampTrainingService");
const {
    conditioningInjuryReduction,
    CONDITIONING_INJURY_REDUCTION_BY_RANK,
} = require("../../consts/homeCampConfig");

const coach = (archetype, rank) => ({ archetype, rank });

// ── Who provides it ─────────────────────────────────────────────────────────

test("only a CONDITIONING coach provides the passive", () => {
    assert.equal(conditioningInjuryReduction([]), 0, "empty roster");
    assert.equal(conditioningInjuryReduction([coach("STRIKING", 4), coach("BJJ", 4)]), 0);
    assert.ok(conditioningInjuryReduction([coach("CONDITIONING", 1)]) > 0);
});

test("the reduction scales with HIS rank, so promoting him is a real decision", () => {
    const seen = [1, 2, 3, 4].map((r) => conditioningInjuryReduction([coach("CONDITIONING", r)]));
    assert.deepEqual(seen, [1, 2, 3, 4].map((r) => CONDITIONING_INJURY_REDUCTION_BY_RANK[r]));
    for (let i = 1; i < seen.length; i++) {
        assert.ok(seen[i] > seen[i - 1], "each rank must be strictly better than the last");
    }
});

test("it does not stack across coaches", () => {
    // The roster can only hold one per archetype, but a future rule change must not silently
    // start summing them into near-immunity.
    const one = conditioningInjuryReduction([coach("CONDITIONING", 4)]);
    const two = conditioningInjuryReduction([coach("CONDITIONING", 4), coach("CONDITIONING", 4)]);
    assert.equal(two, one);
});

test("garbage roster input is 0, never NaN", () => {
    assert.equal(conditioningInjuryReduction(null), 0);
    assert.equal(conditioningInjuryReduction([null, undefined]), 0);
    assert.equal(conditioningInjuryReduction([{ archetype: "CONDITIONING" }]), CONDITIONING_INJURY_REDUCTION_BY_RANK[1]);
});

// ── What it does to the roll ────────────────────────────────────────────────

test("it lowers a risky drill's real chance", () => {
    const without = effectiveInjuryRate(6, 10, 0);
    const withR4 = effectiveInjuryRate(6, 10, CONDITIONING_INJURY_REDUCTION_BY_RANK[4]);
    assert.ok(withR4 < without, "the passive must actually reduce risk");
    assert.ok(Math.abs(withR4 - 0.06 * 0.7) < 1e-9, "multiplicative on the post-FIQ rate");
});

test("it can never manufacture risk on a 0% drill", () => {
    for (const rank of [1, 2, 3, 4]) {
        assert.equal(effectiveInjuryRate(0, 10, CONDITIONING_INJURY_REDUCTION_BY_RANK[rank]), 0);
    }
});

test("the 30%-of-nominal floor still binds — no stacking to immunity", () => {
    // A high-FIQ fighter is already at the floor; the passive must not push through it.
    const nominal = 6;
    const floor = (nominal / 100) * 0.3;
    const stacked = effectiveInjuryRate(nominal, 99, CONDITIONING_INJURY_REDUCTION_BY_RANK[4]);
    assert.ok(Math.abs(stacked - floor) < 1e-9, `expected the floor ${floor}, got ${stacked}`);
    assert.ok(stacked > 0, "safer, never immune");
});

test("no coach means byte-identical behaviour to before the passive existed", () => {
    for (const pct of [0, 1, 2, 4, 6, 7, 8]) {
        for (const fiq of [10, 25, 60, 99]) {
            const base = Math.max(0, pct) / 100;
            const legacy = base <= 0 ? 0 : Math.max(base * 0.3, base - Math.max(0, (fiq - 10) * 0.001));
            assert.equal(effectiveInjuryRate(pct, fiq, 0), legacy, `pct ${pct} fiq ${fiq}`);
        }
    }
});

test("a malformed cut is clamped, never inverted into extra risk", () => {
    assert.equal(effectiveInjuryRate(6, 10, -5), effectiveInjuryRate(6, 10, 0), "negative clamps to 0");
    assert.ok(effectiveInjuryRate(6, 10, 99) > 0, "an absurd cut still can't reach zero risk");
    assert.equal(effectiveInjuryRate(6, 10, NaN), effectiveInjuryRate(6, 10, 0));
});
