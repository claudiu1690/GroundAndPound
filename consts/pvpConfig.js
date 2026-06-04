/**
 * PvP System v1 (Beta) — tuning constants.
 *
 * Behaviour reference: docs/PvP_System_Spec_v1_revised.md. Binding contract:
 * docs/PvP_v1_implementation_contract.md (§1, §6.x). All numbers here are the
 * beta starting values and are expected to be tuned by the beta cohort.
 */

// ── Daily attack cap ──────────────────────────────────────────────────────────
// isPremium() returns false in v1, so the uniform cap is 5. PREMIUM is wired for later.
const PVP_DAILY_CAP_FREE = 5;
const PVP_DAILY_CAP_PREMIUM = 7;

// ── Matchmaking ───────────────────────────────────────────────────────────────
const PVP_OVR_BRACKET = 8;            // |attackerOVR − defenderOVR| must be ≤ 8
const PVP_ONBOARDING_FIGHTS = 3;      // < 3 PvP fights → unranked + onboarding shield

// ── Reward gap-scaling ────────────────────────────────────────────────────────
// gapFactor = clamp01(1 − max(0, attackerOVR − defenderOVR) / GAP_DIVISOR)
const PVP_GAP_DIVISOR = 15;

// ── Post-loss attack cooldown (hours), keyed on the loss method ───────────────
const PVP_COOLDOWN_HOURS = {
    KO: 12,          // matches concussion recoveryHoursNeeded for thematic consistency
    Submission: 6,
    Decision: 3,
};

// ── Defender HP loss bands (percent of current HP), [min, max] inclusive ──────
// Keyed by method then by win/loss perspective. Attacker HP comes from the engine.
const PVP_HP_BANDS = {
    Decision:   { winner: [5, 10],  loser: [15, 25] },
    Submission: { winner: [5, 10],  loser: [20, 30] },
    KO:         { winner: [0, 5],   loser: [30, 50] },
};

// ── Reward fractions (of PvE equivalents) ─────────────────────────────────────
const PVP_IRON_WIN_FRAC   = 0.45;   // win iron = signingFee * 0.45 * gapFactor
const PVP_IRON_DRAW_FRAC  = 0.25;   // draw iron (both) = signingFee * 0.25 (no gap-scale)
const PVP_IRON_LOSS_FRAC  = 0.15;   // loss participation iron = signingFee * 0.15
const PVP_FAME_WIN_FRAC   = 0.40;   // win fame = baseFightNotoriety * 0.40 * gapFactor
const PVP_BELT_DEFENSE_FRAC = 0.50; // belt-defense bonus = 50% of standard PvP win reward

// ── Belt anti-stagnation (nightly decay job) ──────────────────────────────────
const PVP_BELT_FLOOR_DEFAULT = 10;  // top-10 challenge gate
const PVP_BELT_FLOOR_WIDENED = 20;  // widened gate after inactivity
const PVP_BELT_DECAY_WIDEN_DAYS = 14;
const PVP_BELT_DECAY_INTERIM_DAYS = 21;

// ── Pagination defaults ───────────────────────────────────────────────────────
const PVP_LADDER_LIMIT_DEFAULT = 25;
const PVP_LADDER_LIMIT_MAX = 100;
const PVP_HISTORY_LIMIT_DEFAULT = 20;
const PVP_HISTORY_LIMIT_MAX = 50;

// ── The Circuit v1.1 — Rivalries / Revenge ────────────────────────────────────
// Revenge bonus: win vs an opponent who beat you in this pair within 72h pays +15%
// fame (folded into PVP_WIN applyNotorietyDelta, stays under PvE's +30% grudge).
const PVP_REVENGE_FAME_MULT = 1.15;
const PVP_REVENGE_WINDOW_HOURS = 72;     // revenge window after a loss in the pair
const PVP_GRUDGE_HEAT = 4;               // heat ≥ this = Grudge (read-time, Gazette-eligible)
const PVP_NEMESIS_DEFICIT = 2;           // head-to-head deficit ≥ this → other is your nemesis
const PVP_RIVALRY_HEAT_DECAY_DAYS = 7;   // heat -1 per full week of no fights

// ── Streaks / Titles ──────────────────────────────────────────────────────────
// Milestone fame at a positive current_streak hitting one of these thresholds.
// Down-weighted vs PvE win-streak bonuses (PvE: 100/250/500 at 5/10/20).
const PVP_STREAK_MILESTONES = [3, 5, 10, 15];
const PVP_STREAK_FAME = { 3: 20, 5: 40, 10: 80, 15: 120 };

// One-time fame for unlocking a cosmetic title. Capped ≤ 0.5× Amateur signingFee-fame
// scale; flat + small so it never shortcuts PvE. Paid once per title on the unlock transition.
const PVP_TITLE_FAME = 50;

// Cosmetic title catalog. key → { label, unlock } where unlock(pvp) → boolean.
// iron_collector (bounties_collected ≥ 5) is v1.2 — its rule is wired to read a field that
// stays 0 in v1.1, so it simply never unlocks until v1.2 introduces bounties_collected.
const PVP_TITLES = {
    the_hunter:    { label: "The Hunter",   unlock: (pvp) => (pvp.attack_wins || 0) >= 10 },
    giant_slayer:  { label: "Giant Slayer", unlock: (pvp) => (pvp.giant_slayer_wins || 0) >= 5 },
    untouchable:   { label: "Untouchable",  unlock: (pvp) => (pvp.best_streak || 0) >= 10 },
    gatekeeper:    { label: "Gatekeeper",   unlock: (pvp) => (pvp.top10_defenses || 0) >= 5 },
    old_money:     { label: "Old Money",    unlock: (pvp) => !!pvp.former_champion },
    iron_collector:{ label: "Iron Collector", unlock: (pvp) => (pvp.bounties_collected || 0) >= 5 },
};

// ── Contracts ─────────────────────────────────────────────────────────────────
// Per-fighter rotating objectives. daily: pick 2; weekly: pick 1. Progress is hooked in
// processPvpResult for the ATTACKER only. Claim pays fame (counts the shared daily cap).
// fame values are down-weighted so all dailies ≈ one extra win's fame.
const PVP_CONTRACT_POOL = {
    daily: [
        { id: "win_1",              label: "Win a PvP fight",                  goal: 1 },
        { id: "finish_someone",     label: "Win by KO or Submission",         goal: 1 },
        { id: "beat_higher_ranked", label: "Beat a higher-ranked opponent",   goal: 1 },
    ],
    weekly: [
        { id: "weekly_win_4",         label: "Win 4 PvP fights this week",      goal: 4 },
        // The Circuit v1.2 — bounty objective now rotates into the weekly pool.
        { id: "weekly_collect_bounty", label: "Collect a bounty this week",      goal: 1 },
    ],
};
const PVP_CONTRACT_FAME = {
    win_1: 25,
    finish_someone: 30,
    beat_higher_ranked: 35,
    weekly_win_4: 80,
    weekly_collect_bounty: 60,
};

// ── Shared daily fame cap (Risk 8) ────────────────────────────────────────────
// ONE cap across revenge bonus + streak milestone + contract claims, reset like attacks_today.
// A single win can't farm: every source checks/decrements this same budget.
const PVP_DAILY_FAME_CAP = 200;

// ── Head-to-head diminishing (Risk 8 / anti-farm) ─────────────────────────────
// Multiplier applied to revenge/streak fame by how many times this exact pair has fought
// today (or in the rivalry window). Index = prior same-pair fights; clamps to the last entry.
const PVP_HEADTOHEAD_DIMINISH = [1.0, 0.6, 0.3, 0.0];

// ── The Circuit v1.2 — Seasons & Divisions ────────────────────────────────────
// Divisions are a VIEW-LAYER (band-based on rank_points, contract Risk 4 — NOT percentile/quota)
// so divisionFor(pvp) is O(1) and rollover is a single bulkWrite. Order matters: Champion's Circle
// is also granted to anyone in the top-10 ladder_rank regardless of points. Cutoffs are the LOWER
// bound of each band; the function checks high→low.
const PVP_DIVISION_BANDS = [
    { key: "champions_circle", label: "Champion's Circle", min: 60 },  // OR ladder_rank ≤ 10
    { key: "diamond",          label: "Diamond",            min: 40 },
    { key: "gold",             label: "Gold",               min: 22 },
    { key: "silver",           label: "Silver",             min: 8 },
    { key: "bronze",           label: "Bronze",             min: 0 },
];
const PVP_DIVISION_CHAMPIONS_RANK = 10;   // ladder_rank ≤ this also lands you in Champion's Circle

// Season length — 4 weeks (the contract's "Decided" value).
const PVP_SEASON_LENGTH_DAYS = 28;

// Season-end soft reset: new rank_points = floor(old × this).
const PVP_SEASON_SOFT_RESET = 0.6;

// Per-division season-end reward grants. fame is via applyNotorietyDelta (down-weighted, capped,
// counts the shared daily cap); iron is ≤ Diamond capped to 1× Amateur signingFee equivalents
// (a flat down-weighted iron drip — bounties are the real iron sink, this is a small ladder
// honorarium). Bronze gets a flair title only. Bots are EXCLUDED from all grants.
const PVP_SEASON_FAME = {
    champions_circle: 80,
    diamond:          50,
    gold:             30,
    silver:           15,
    bronze:           0,
};
const PVP_SEASON_IRON = {
    champions_circle: 400,   // ≤ Amateur signingFee (400) — the cap the contract sets
    diamond:          200,
    gold:             100,
    silver:           0,
    bronze:           0,
};

// ── The Circuit v1.2 — Bounties (net iron sink) ───────────────────────────────
const PVP_BOUNTY_MIN = 250;            // minimum post (bounty_below_min)
const PVP_BOUNTY_POST_BURN = 0.10;     // 10% of the post is burned on posting
const PVP_BOUNTY_ESCROW = 0.90;        // 90% is escrowed (the collectable payout)
const PVP_BOUNTY_EXPIRY_DAYS = 7;      // open bounties expire after this
const PVP_BOUNTY_REFUND_FRAC = 0.80;   // on expiry, refund 80% of escrow (20% burns)
const PVP_BOUNTY_TRIANGLE_DAYS = 7;    // (poster,target,collector) triangle allowed ≤ once / N days
// Diminishing multiplier on repeat head-to-head bounty collection (poster↔collector same target).
// Index = prior collections in window; clamps to the last entry. Remainder is burned.
const PVP_BOUNTY_DIMINISH = [1, 0.6, 0.3, 0];

module.exports = {
    PVP_DAILY_CAP_FREE,
    PVP_DAILY_CAP_PREMIUM,
    PVP_OVR_BRACKET,
    PVP_ONBOARDING_FIGHTS,
    PVP_GAP_DIVISOR,
    PVP_COOLDOWN_HOURS,
    PVP_HP_BANDS,
    PVP_IRON_WIN_FRAC,
    PVP_IRON_DRAW_FRAC,
    PVP_IRON_LOSS_FRAC,
    PVP_FAME_WIN_FRAC,
    PVP_BELT_DEFENSE_FRAC,
    PVP_BELT_FLOOR_DEFAULT,
    PVP_BELT_FLOOR_WIDENED,
    PVP_BELT_DECAY_WIDEN_DAYS,
    PVP_BELT_DECAY_INTERIM_DAYS,
    PVP_LADDER_LIMIT_DEFAULT,
    PVP_LADDER_LIMIT_MAX,
    PVP_HISTORY_LIMIT_DEFAULT,
    PVP_HISTORY_LIMIT_MAX,
    // The Circuit v1.1
    PVP_REVENGE_FAME_MULT,
    PVP_REVENGE_WINDOW_HOURS,
    PVP_GRUDGE_HEAT,
    PVP_NEMESIS_DEFICIT,
    PVP_RIVALRY_HEAT_DECAY_DAYS,
    PVP_STREAK_MILESTONES,
    PVP_STREAK_FAME,
    PVP_TITLE_FAME,
    PVP_TITLES,
    PVP_CONTRACT_POOL,
    PVP_CONTRACT_FAME,
    PVP_DAILY_FAME_CAP,
    PVP_HEADTOHEAD_DIMINISH,
    // The Circuit v1.2 — Seasons & Divisions
    PVP_DIVISION_BANDS,
    PVP_DIVISION_CHAMPIONS_RANK,
    PVP_SEASON_LENGTH_DAYS,
    PVP_SEASON_SOFT_RESET,
    PVP_SEASON_FAME,
    PVP_SEASON_IRON,
    // The Circuit v1.2 — Bounties
    PVP_BOUNTY_MIN,
    PVP_BOUNTY_POST_BURN,
    PVP_BOUNTY_ESCROW,
    PVP_BOUNTY_EXPIRY_DAYS,
    PVP_BOUNTY_REFUND_FRAC,
    PVP_BOUNTY_TRIANGLE_DAYS,
    PVP_BOUNTY_DIMINISH,
};
