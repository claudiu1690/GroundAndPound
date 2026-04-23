/**
 * Main Event of the Week (Phase 5).
 *
 * A weekly NPC-vs-NPC headline match. The whole playerbase predicts winner + method
 * and earns/loses fame when it resolves. Creates a "something happening in the world"
 * heartbeat without needing any live backend job — events self-tick on view.
 *
 * Reward schedule:
 *   - Predict winner + method exactly → EXACT reward (fame + iron).
 *   - Predict winner only (wrong method) → WINNER reward (fame).
 *   - Predict draw correctly → EXACT reward.
 *   - Wrong winner → WRONG penalty (fame loss).
 *
 * Method odds are used both to surface "public odds" on the card and to simulate
 * the actual result at resolution. Simulator weights by:
 *   - style (striker / grappler bias)
 *   - OVR gap (higher OVR wins more often, but never fully dominates)
 */

const EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const REWARDS = {
    EXACT_FAME:    300,
    EXACT_IRON:    500,
    WINNER_FAME:   100,
    WRONG_FAME:   -50,
};

const METHODS = ["KO/TKO", "Submission", "Decision", "Draw"];

/**
 * Style → baseline win-method distribution. Summed with opponent's inverse so the bout
 * reads like a natural matchup (striker vs grappler pulls toward KO and Sub both).
 * Values are unnormalised weights; sampler normalises.
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

const DRAW_CHANCE = 0.05; // 5% of events end in a draw at simulation time

/** Minimum OVR a fighter must have to be eligible for main event booking. */
const MIN_OVR_FOR_MAIN_EVENT = 55;

module.exports = {
    EVENT_WINDOW_MS,
    REWARDS,
    METHODS,
    STYLE_METHOD_BIAS,
    DRAW_CHANCE,
    MIN_OVR_FOR_MAIN_EVENT,
};
