/**
 * Per-session XP roll for gym training.
 *
 * Symmetric triangular distribution on [0.80, 1.20), mode 1.0, EV exactly 1.0.
 * Built as 0.8 + 0.2*(u1+u2) from two independent uniform[0,1) draws — the sum
 * of two uniforms is triangular, peaking at the midpoint, so the multiplier
 * clusters around 1.0 and rarely hits the extremes.
 *
 * `rng` is the test seam: pass a deterministic function to make rolls
 * reproducible (defaults to Math.random). The module holds NO mutable state —
 * every call is independent, so rolls cannot leak between requests.
 *
 * Sanity: rollSessionXp(() => 0.5) === 1.0.
 */

// Symmetric triangular distribution on [0.80, 1.20), mode 1.0, EV exactly 1.0.
// Generated as 0.8 + 0.2*(u1+u2) where u1,u2 are two independent uniform[0,1) draws.
// rng is injectable for deterministic tests; defaults to Math.random.
function rollSessionXp(rng = Math.random) {
    const u1 = rng();
    const u2 = rng();
    return 0.8 + 0.2 * (u1 + u2);
}

// Pure tier classifier (labels only, no math).
function tierForRoll(r) {
    if (r < 0.90) return "sluggish";
    if (r > 1.10) return "great";
    return "normal";
}

module.exports = { rollSessionXp, tierForRoll };
