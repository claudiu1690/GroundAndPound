/**
 * Fight Card / Events config (Phase 5+).
 *
 * Each weekly card is a stack of 5 fights, UFC-style:
 *   - 2 prelim fights (mid-tier GCS roster)
 *   - 2 main card fights (top-tier GCS roster)
 *   - 1 headliner (top of the top)
 *
 * All fighters are non-champion GCS opponents. Cards can MIX weight classes
 * (each fight is intra-class, but different fights can be in different classes —
 * exactly like a real Fight Night).
 *
 * On resolve, every prediction the player made for the card pays out based on the
 * slot's reward tier. NPC records and fightHistory are updated so the roster feels
 * alive over time (Tier 2 of the design).
 */

const EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fixed slot order for every card. Drives both the assembler and the UI.
 * `pool` selects from elite (≥ ELITE_OVR_THRESHOLD) or prelim pool.
 */
const CARD_FIGHT_SLOTS = [
    { slot: "PRELIM",    pool: "prelim", index: 0 },
    { slot: "PRELIM",    pool: "prelim", index: 1 },
    { slot: "MAIN",      pool: "elite",  index: 2 },
    { slot: "MAIN",      pool: "elite",  index: 3 },
    { slot: "HEADLINER", pool: "elite",  index: 4 },
];
const TOTAL_FIGHTS = CARD_FIGHT_SLOTS.length;

/** OVR thresholds for splitting the GCS roster into pools. */
const ELITE_OVR_THRESHOLD = 88;   // ≥ this goes into main card / headliner pool
const PRELIM_MIN_OVR      = 70;   // < ELITE and ≥ this goes into prelim pool

/** Tiered rewards per slot — exact (winner+method), winner only, wrong winner. */
const REWARDS_BY_SLOT = {
    PRELIM:    { exactFame: 100, exactIron: 200, winnerFame:  30, wrongFame: -20 },
    MAIN:      { exactFame: 200, exactIron: 400, winnerFame:  75, wrongFame: -40 },
    HEADLINER: { exactFame: 300, exactIron: 500, winnerFame: 100, wrongFame: -50 },
};

const METHODS = ["KO/TKO", "Submission", "Decision", "Draw"];

/**
 * Style → baseline win-method distribution. Pulled the same way as the v1 simulator.
 */
const STYLE_METHOD_BIAS = {
    Boxer:              { "KO/TKO": 70, Submission: 5,  Decision: 25 },
    Kickboxer:          { "KO/TKO": 65, Submission: 5,  Decision: 30 },
    "Muay Thai":        { "KO/TKO": 60, Submission: 5,  Decision: 35 },
    Capoeira:           { "KO/TKO": 50, Submission: 5,  Decision: 45 },
    Wrestler:           { "KO/TKO": 25, Submission: 30, Decision: 45 },
    Judo:               { "KO/TKO": 20, Submission: 40, Decision: 40 },
    Sambo:              { "KO/TKO": 25, Submission: 40, Decision: 35 },
    "Brazilian Jiu-Jitsu": { "KO/TKO": 10, Submission: 60, Decision: 30 },
};

const DRAW_CHANCE = 0.05;

/** Max OVR gap between the two fighters in any single bout (matchmaking tightness). */
const MAX_OVR_GAP_FIGHT = 5;

/** Cap on opponent.fightHistory length — must match the cap used by player fights. */
const MAX_FIGHT_HISTORY = 20;

module.exports = {
    EVENT_WINDOW_MS,
    CARD_FIGHT_SLOTS,
    TOTAL_FIGHTS,
    ELITE_OVR_THRESHOLD,
    PRELIM_MIN_OVR,
    REWARDS_BY_SLOT,
    METHODS,
    STYLE_METHOD_BIAS,
    DRAW_CHANCE,
    MAX_OVR_GAP_FIGHT,
    MAX_FIGHT_HISTORY,
};
