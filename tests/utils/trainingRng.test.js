/**
 * Unit tests for the per-session XP roll helpers.
 * Pure module — no DB / no Redis. Uses injectable rng for determinism.
 * Run with: node tests/utils/trainingRng.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const { rollSessionXp, tierForRoll } = require("../../utils/trainingRng");

// ── determinism seam / expected value ─────────────────────────
test("rollSessionXp(() => 0.5) === 1.0 (EV / mode)", () => {
    assert.equal(rollSessionXp(() => 0.5), 1.0);
});

// ── range bounds ──────────────────────────────────────────────
test("rollSessionXp lower bound: 0 → 0.8", () => {
    assert.equal(rollSessionXp(() => 0), 0.8);
});

test("rollSessionXp upper bound: ~1 → ~1.2 (strictly below 1.2)", () => {
    const r = rollSessionXp(() => 0.9999999);
    assert.ok(r < 1.2, `expected < 1.2, got ${r}`);
    assert.ok(Math.abs(r - 1.2) < 1e-6, `expected ≈ 1.2, got ${r}`);
});

// ── forced tiers via constant rng ─────────────────────────────
test("forced great: ()=>0.9 → 1.16 → 'great'", () => {
    const r = rollSessionXp(() => 0.9);
    assert.ok(Math.abs(r - 1.16) < 1e-9, `expected 1.16, got ${r}`);
    assert.equal(tierForRoll(r), "great");
});

test("forced sluggish: ()=>0.2 → 0.88 → 'sluggish'", () => {
    const r = rollSessionXp(() => 0.2);
    assert.ok(Math.abs(r - 0.88) < 1e-9, `expected 0.88, got ${r}`);
    assert.equal(tierForRoll(r), "sluggish");
});

// ── sequenced rng (closure over an array) ─────────────────────
test("sequenced rng draws successive values per call", () => {
    const seq = [0.9, 0.9, 0.2, 0.2];
    let idx = 0;
    const rng = () => seq[idx++];
    const r1 = rollSessionXp(rng); // 0.8 + 0.2*(0.9+0.9) = 1.16
    const r2 = rollSessionXp(rng); // 0.8 + 0.2*(0.2+0.2) = 0.88
    assert.ok(Math.abs(r1 - 1.16) < 1e-9, `expected 1.16, got ${r1}`);
    assert.equal(tierForRoll(r1), "great");
    assert.ok(Math.abs(r2 - 0.88) < 1e-9, `expected 0.88, got ${r2}`);
    assert.equal(tierForRoll(r2), "sluggish");
});

// ── tierForRoll boundaries ────────────────────────────────────
test("tierForRoll boundaries", () => {
    assert.equal(tierForRoll(0.89), "sluggish");
    assert.equal(tierForRoll(0.90), "normal");
    assert.equal(tierForRoll(1.0), "normal");
    assert.equal(tierForRoll(1.10), "normal");
    assert.equal(tierForRoll(1.11), "great");
});
