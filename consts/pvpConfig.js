/**
 * Ground & Pound — "The Proving Ground" PVP config (single source of truth).
 *
 * IMPORTANT (launch-blocking data match, contract §assumption 5 / risk 11):
 * The stored `fighter.weightClass` values are CAPITALIZED
 * (consts/gameConstants.WEIGHT_CLASSES = ['Featherweight','Lightweight','Middleweight','Heavyweight']).
 * The contract draft listed lowercase keys; we use the STORED casing so the season
 * seed + matchmaking weightClass filter match real fighter documents. Anything else
 * returns empty pools.
 *
 * Division keys, gameplan keys, twist keys, reward keys are all lowercase internal
 * identifiers and are unrelated to the weight-class casing.
 */

const { WEIGHT_CLASSES } = require("./gameConstants");

// The 4 PVP weight classes — exactly the stored fighter casing.
const WEIGHT_CLASSES_PVP = ["Featherweight", "Lightweight", "Middleweight", "Heavyweight"];

// Sanity: every PVP class must exist in the canonical enum or matchmaking breaks.
for (const wc of WEIGHT_CLASSES_PVP) {
    if (!WEIGHT_CLASSES.includes(wc)) {
        throw new Error(`[pvpConfig] WEIGHT_CLASSES_PVP "${wc}" not in gameConstants.WEIGHT_CLASSES — casing mismatch (launch-blocking).`);
    }
}

// Sentinel weight class for an "Open" (cross-weight-class) season. NEVER a real fighter
// class — fighters keep their real class on the Fighter doc; a season's records are
// stamped with this sentinel so all pool/ladder/belt/decay filters merge into one pool.
const OPEN_WEIGHT_CLASS = "Open";
// Every weightClass a SEASON (and therefore a record/fight/HoF) may carry: the 4 real
// classes plus the Open sentinel. Fighter weightClass enums stay WEIGHT_CLASSES_PVP.
const SEASON_WEIGHT_CLASSES = [...WEIGHT_CLASSES_PVP, OPEN_WEIGHT_CLASS];

const DIVISIONS = [
    { key: "prospect", floor: 0, promoteAt: 300, ovrMin: 10, ovrMax: 20, color: "#888" },
    { key: "contender", floor: 300, promoteAt: 1200, ovrMin: 18, ovrMax: 30, color: "#93C5FD" },
    { key: "challenger", floor: 1200, promoteAt: 2500, ovrMin: 25, ovrMax: 40, color: "#C4B5FD" },
    { key: "elite", floor: 2500, promoteAt: 5000, ovrMin: 35, ovrMax: 55, color: "#5EEAD4" },
    { key: "champion", floor: 5000, promoteAt: null, ovrMin: 50, ovrMax: null, color: "#C8102E" },
];

const DIVISION_KEYS = DIVISIONS.map((d) => d.key);

const DP = {
    WIN_BASE: 120,
    LOSS_ATTACKER: -55,
    LOSS_DEFENDER: -28,
    BELT_BONUS: 50,
    RIVALRY_BONUS: 25,
    BRACKET_10_PCT: 0.10,
    BRACKET_25_PCT: 0.25,
    STREAK_MULT: 1.25,
    STREAK_MIN: 3,
    REPEAT_2ND: 0.5,
    REPEAT_3RD: 0.25,
    MIN_WIN_GAIN: 1,
    MAX_LOSS: -100,
};

const TWISTS = {
    iron_circuit: { name: "Iron Circuit", effect: null },
    blood_sport: { name: "Blood Sport", methods: ["ko", "submission"], pct: 0.25 },
    the_contenders: { name: "The Contenders", streakFrom: 3 },
    ground_war: { name: "Ground War", methods: ["submission"], pct: 0.30 },
    iron_fist: { name: "Iron Fist", methods: ["ko"], pct: 0.30 },
    the_marathon: { name: "The Marathon", methods: ["decision"], pct: 0.20 },
};

const TWIST_KEYS = Object.keys(TWISTS);

const GAMEPLAN_WEIGHTS = {
    aggressive: { str: 1.3, spd: 1.2, chn: 0.9, fiq: 0.9 },
    balanced: {}, // identity
    counter: { fiq: 1.3, chn: 1.2, str: 0.9, spd: 0.9 },
};

const GAMEPLAN_KEYS = Object.keys(GAMEPLAN_WEIGHTS);

const REWARDS = {
    prospect: { iron: 500, fame: 500, drinks: 0, badge: null },
    contender: { iron: 1200, fame: 1200, drinks: 0, badge: null },
    challenger: { iron: 2500, fame: 2500, drinks: 0, badge: "challenger" },
    elite: { iron: 5000, fame: 5000, drinks: 2, badge: "elite" },
    champion: { iron: 10000, fame: 10000, drinks: 5, badge: "champion" },
    beltHolder: { iron: 15000, fame: 15000, drinks: 7, badge: "belt" }, // REPLACES champion
};

// Target division on season-end soft reset; dp set to that division's floor.
const SOFT_RESET = {
    prospect: "prospect",
    contender: "prospect",
    challenger: "contender",
    elite: "challenger",
    champion: "contender",
};

// ── PVP New Player Experience (single source of truth) ──────────────────────
// Placement seeds the attacker's starting DP by wins-in-placement (out of 3).
const PLACEMENT_DP = { 3: 400, 2: 200, 1: 100, 0: 0 };
// New Competitor Shield — 7 days OR first attack, whichever first (no fight count).
const NEW_COMPETITOR_SHIELD_DAYS = 7;
// Catch-up window: doubles attacker WIN DP for late joiners (below elite) for this long.
const CATCHUP_DAYS = 7;
// A record only earns a catch-up window if it joins this many days after season start.
const CATCHUP_JOIN_OFFSET_DAYS = 14;
// One-time welcome bonus when a fighter completes their FIRST Proving Ground season.
const FIRST_SEASON_BONUS = { iron: 500, fame: 100 };
// Number of placement fights before division/DP seeding.
const PLACEMENT_FIGHTS = 3;
// Career wins required to unlock the Proving Ground.
const PVP_UNLOCK_WINS = 3;

const SEASON_LENGTH_DAYS = 70;
const DECAY_AFTER_DAYS = 7;
const DECAY_AMOUNT = 10;
const INACTIVITY_DECAY_SKIP = "prospect";
const MIN_FIGHTS_FOR_REWARD = 1;
const MATCHMAKE_COUNT = 5;
const MATCH_OVR_STEPS = [5, 10, 15, 20];

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Authoritative division derivation from a DP value: the highest division whose
 * floor is <= dp. Division is NEVER trusted from storage on writes — recompute on
 * every dp change. The stored `division` field is only a denormalized read cache.
 */
function divisionForDp(dp) {
    const n = Number(dp) || 0;
    let key = DIVISIONS[0].key;
    for (const d of DIVISIONS) {
        if (n >= d.floor) key = d.key;
        else break;
    }
    return key;
}

function divisionMeta(divKey) {
    return DIVISIONS.find((d) => d.key === divKey) || null;
}

function divisionFloor(divKey) {
    const meta = divisionMeta(divKey);
    return meta ? meta.floor : 0;
}

function nextDivision(divKey) {
    const idx = DIVISION_KEYS.indexOf(divKey);
    if (idx === -1 || idx === DIVISION_KEYS.length - 1) return null;
    return DIVISION_KEYS[idx + 1];
}

/**
 * Bracket tier from the OVR gap between attacker and defender.
 *   |gap| 6–10  → plus10
 *   |gap| 11–20 → plus25
 *   else        → none
 * (A bonus only applies when fighting UP, but the bracket tier itself is gap-based;
 * the DP service applies the bonus on a WIN regardless of direction per the contract,
 * which embeds the bracket on the candidate card for display.)
 */
function bracketTier(attackerOvr, defenderOvr) {
    const gap = Math.abs((Number(defenderOvr) || 0) - (Number(attackerOvr) || 0));
    if (gap >= 6 && gap <= 10) return "plus10";
    if (gap >= 11 && gap <= 20) return "plus25";
    return "none";
}

/**
 * Deterministic badge id for a division placement / belt.
 *   division → pvp_challenger_s3
 *   belt     → pvp_belt_s3_featherweight   (weightClass lowercased for the id)
 */
function badgeIdFor(divKey, seasonNumber, weightClass) {
    if (divKey === "belt") {
        const wc = String(weightClass || "").toLowerCase();
        return `pvp_belt_s${seasonNumber}_${wc}`;
    }
    return `pvp_${divKey}_s${seasonNumber}`;
}

module.exports = {
    WEIGHT_CLASSES_PVP,
    OPEN_WEIGHT_CLASS,
    SEASON_WEIGHT_CLASSES,
    DIVISIONS,
    DIVISION_KEYS,
    DP,
    TWISTS,
    TWIST_KEYS,
    GAMEPLAN_WEIGHTS,
    GAMEPLAN_KEYS,
    REWARDS,
    SOFT_RESET,
    SEASON_LENGTH_DAYS,
    DECAY_AFTER_DAYS,
    DECAY_AMOUNT,
    INACTIVITY_DECAY_SKIP,
    MIN_FIGHTS_FOR_REWARD,
    MATCHMAKE_COUNT,
    MATCH_OVR_STEPS,
    // New Player Experience
    PLACEMENT_DP,
    NEW_COMPETITOR_SHIELD_DAYS,
    CATCHUP_DAYS,
    CATCHUP_JOIN_OFFSET_DAYS,
    FIRST_SEASON_BONUS,
    PLACEMENT_FIGHTS,
    PVP_UNLOCK_WINS,
    // helpers
    divisionForDp,
    divisionMeta,
    divisionFloor,
    nextDivision,
    bracketTier,
    badgeIdFor,
};
