/**
 * Deterministic rotation helpers — shared by sponsorshipService and mediaHubService.
 *
 * Extracted (behavior-preserving) from sponsorshipService so both the sponsor pool
 * and the media-appearance pool stay stable within a rotation window for a given
 * fighter, without duplicating the PRNG.
 */

/**
 * FNV-1a string hash → uint32. Not cryptographic — just enough to seed the PRNG.
 * @param {string} str
 * @returns {number}
 */
function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * mulberry32 PRNG. Returns a function producing floats in [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Seeded Fisher-Yates shuffle — deterministic for a given seed.
 * @template T
 * @param {T[]} arr
 * @param {number} seed
 * @returns {T[]}
 */
function seededShuffle(arr, seed) {
    const out = arr.slice();
    const rng = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * Current rotation index (window number since epoch) for a given window length.
 * @param {number} rotationMs
 * @returns {number}
 */
function currentRotation(rotationMs) {
    return Math.floor(Date.now() / rotationMs);
}

module.exports = {
    hashSeed,
    mulberry32,
    seededShuffle,
    currentRotation,
};
