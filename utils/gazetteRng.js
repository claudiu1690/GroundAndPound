/**
 * Deterministic RNG for the Octagon Gazette.
 *
 * Same (issueNumber, fighterId) produces the same template selections every time the
 * gazette is rendered for that issue — so re-serializing the persisted edition on phone
 * and laptop yields identical content, and a given issue never reshuffles its stories.
 * A new issue (incremented issueNumber) reseeds and produces fresh variation.
 */

/**
 * Build a 32-bit unsigned integer hash from a string.
 * FNV-1a — fast, no deps, well-distributed for our needs.
 */
function fnv1a(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash >>> 0;
}

/**
 * Mulberry32 PRNG — small, fast, well-distributed. Returns a 0..1 float per call.
 * https://stackoverflow.com/a/47593316
 */
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Create a deterministic RNG for the gazette of a specific fighter on a specific issue.
 * @param {string} seedKey     String(issueNumber) — determinism is per (issueNumber, fighterId)
 * @param {string} fighterId   Mongo ObjectId stringified
 * @returns {{ next: () => number, pick: (arr) => any }} RNG with two helpers
 */
function makeGazetteRng(seedKey, fighterId) {
    const seed = fnv1a(`${seedKey}|${fighterId}`);
    const next = mulberry32(seed);
    return {
        next,
        pick(arr) {
            if (!Array.isArray(arr) || arr.length === 0) return null;
            return arr[Math.floor(next() * arr.length)];
        },
    };
}

module.exports = { makeGazetteRng, fnv1a };
