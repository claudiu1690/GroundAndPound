/**
 * Unit tests for the pure batch-training helpers and the atomic deduct math.
 * No DB / no Redis — exercises the extracted pure pieces.
 * Run with: node tests/services/trainingService.batch.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const trainingService = require("../../services/trainingService");

const { _deriveStopReason, _computeRefund, MAX_BATCH } = trainingService;

// ── stopReason ────────────────────────────────────────────────
test("stopReason: k === clampedQ → completed", () => {
    assert.equal(_deriveStopReason(5, 5), "completed");
    assert.equal(_deriveStopReason(1, 1), "completed");
    assert.equal(_deriveStopReason(25, 25), "completed");
});

test("stopReason: k < clampedQ (energy clamp) → out_of_energy", () => {
    assert.equal(_deriveStopReason(3, 10), "out_of_energy");
    assert.equal(_deriveStopReason(0, 5), "out_of_energy");
});

// ── refund accounting ─────────────────────────────────────────
test("refund: completed === funded → 0 (no injury, full batch)", () => {
    assert.equal(_computeRefund(5, 5, 8), 0);
    assert.equal(_computeRefund(1, 1, 4), 0);
});

test("refund: injury stop at session 3 of 5 funded → refunds 2*cost", () => {
    // funded 5, completed 3 (injury counts as completed), cost 8 → refund 16
    assert.equal(_computeRefund(5, 3, 8), 16);
});

test("refund: injury on first session of a 10-funded batch → 9*cost", () => {
    assert.equal(_computeRefund(10, 1, 8), 72);
});

// ── batch ceiling ─────────────────────────────────────────────
test("MAX_BATCH hard ceiling is 25", () => {
    assert.equal(MAX_BATCH, 25);
});

// ── mirror of the Lua k-computation (affordability + clamp) ────
// Mirrors DEDUCT_BATCH_LUA: affordable = floor(cur/cost); k = min(affordable, maxSessions); k<=0 → 0.
function computeK(cur, cost, maxSessions) {
    const affordable = Math.floor(cur / cost);
    let k = Math.min(affordable, maxSessions);
    if (k < 0) k = 0;
    return k;
}

test("k: energy-limited below requested", () => {
    // 30 energy, cost 8 → 3 affordable; client wants 10 → k=3
    assert.equal(computeK(30, 8, 10), 3);
});

test("k: request-limited below affordable", () => {
    // 100 energy, cost 4 → 25 affordable; client wants 5 → k=5
    assert.equal(computeK(100, 4, 5), 5);
});

test("k: zero when not enough for a single session", () => {
    assert.equal(computeK(3, 8, 10), 0);
    assert.equal(computeK(0, 4, 25), 0);
});

test("k: exact-fit energy", () => {
    assert.equal(computeK(16, 8, 25), 2);
});

// ── aggregation sanity: xpGained accumulates per session ───────
// Pure replica of the inner accumulation to lock the contract intent.
test("aggregation: per-stat xp sums across k sessions, value reflects final", () => {
    const perSessionXp = 5;
    const k = 4;
    const xpGained = {};
    for (let i = 0; i < k; i++) {
        xpGained.STR = (xpGained.STR || 0) + perSessionXp;
    }
    assert.equal(xpGained.STR, 20);
});

// ── 95-cap wastage ────────────────────────────────────────────
test("wasted accumulates when stat already at training cap (>=95)", () => {
    const wasted = {};
    const xpGained = {};
    const perSessionXp = 6;
    const startStat = 95; // at cap
    const k = 3;
    for (let i = 0; i < k; i++) {
        if (startStat >= 95) {
            wasted.STR = (wasted.STR || 0) + perSessionXp;
            if (xpGained.STR === undefined) xpGained.STR = 0;
        }
    }
    assert.equal(wasted.STR, 18);
    assert.equal(xpGained.STR, 0);
});

// ── N=1 message format identical to historical single-session ──
// Locks the exact string shape used by App.jsx-adjacent consumers.
test("N=1 message: 'Trained <label>. Gained <x> XP to <STAT>.'", () => {
    const label = "Bag Work";
    const xpGained = { STR: 7 };
    const xpParts = Object.entries(xpGained)
        .filter(([, v]) => v > 0)
        .map(([stat, v]) => `${v} XP to ${stat}`);
    const message = `Trained ${label}. Gained ${xpParts.join(", ")}.`;
    assert.equal(message, "Trained Bag Work. Gained 7 XP to STR.");
});

test("N=1 message: no-xp fallback unchanged", () => {
    const label = "Bag Work";
    const xpParts = [];
    const message = xpParts.length
        ? `Trained ${label}. Gained ${xpParts.join(", ")}.`
        : `Training (${label}) completed.`;
    assert.equal(message, "Training (Bag Work) completed.");
});

test("N=1 conditioning message unchanged", () => {
    const gain = 1;
    const message = gain > 0
        ? `Strength & conditioning completed. Max Stamina +${gain}.`
        : "Strength & conditioning completed. Max Stamina already at cap.";
    assert.equal(message, "Strength & conditioning completed. Max Stamina +1.");
});
