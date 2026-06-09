/**
 * Media Hub configuration — single source of truth for podcast segments, podcast
 * naming, the listener curve, documentary FOCUS/TONE/TIMING tables, and the
 * appearance pool.
 *
 * This file REPLACES the gameplay numbers that used to live in consts/mediaConfig.js.
 * consts/mediaConfig.js is kept as a thin re-export of BEEF_LAPSE_PENALTY_FAME +
 * RESPECT_WIN_IRON_MULT (consumed by fightService) so that file is not touched.
 */

// ─────────────────────────────────────────────────────────────
// Beef / Respect lifecycle (consumed by fightService via mediaConfig re-export)
// ─────────────────────────────────────────────────────────────

/** Fame penalty when a TRASH/GUEST beef flag lapses (opponent never showed up). */
const BEEF_LAPSE_PENALTY_FAME = 150;

/** Win-vs-respect-flagged opponent: iron purse multiplier bump. */
const RESPECT_WIN_IRON_MULT = 1.15;

// ─────────────────────────────────────────────────────────────
// Podcast
// ─────────────────────────────────────────────────────────────

const PODCAST_ENERGY_COST = 5;

/** Number of distinct segments the player must pick for one episode. */
const PODCAST_SEGMENT_COUNT = 2;

/**
 * Segment catalog. Each segment:
 *   key         — unique segment id (request payload key)
 *   name        — UI label
 *   fame        — flat fame applied (0 = no fame, never logs a fame event)
 *   cash        — flat iron applied
 *   needsTarget — true if the segment requires targets[KEY].opponentId (validated via listCalloutCandidates rules)
 *   flag        — null | "beef" | "respect" | "byTone" (GUEST: beef when tone=TRASH, respect otherwise)
 *   gating      — { requiresLastFight?:bool, minPromotionTier?:string }
 *   deepLink    — optional string the UI uses to route the player to another tab
 *   beefExpiresAfterFights / respectExpiresAfterFights — flag windows
 */
const PODCAST_SEGMENTS = {
    RECAP: {
        key: "RECAP",
        name: "Recap your last fight",
        fame: 100,
        cash: 150,
        needsTarget: false,
        flag: null,
        gating: { requiresLastFight: true },
        deepLink: null,
    },
    BREAKDOWN: {
        key: "BREAKDOWN",
        name: "Break down the tape",
        fame: 200,
        cash: 0,
        needsTarget: false,
        flag: null,
        gating: { requiresLastFight: true },
        deepLink: null,
    },
    TRASH: {
        key: "TRASH",
        name: "Trash talk a rival",
        fame: 300,
        cash: 0,
        needsTarget: true,
        flag: "beef",
        beefExpiresAfterFights: 4,
        gating: {},
        deepLink: null,
    },
    RESPECT: {
        key: "RESPECT",
        name: "Show respect",
        fame: 100,
        cash: 0,
        needsTarget: true,
        flag: "respect",
        respectExpiresAfterFights: 6,
        gating: {},
        deepLink: null,
    },
    CRYPTIC: {
        key: "CRYPTIC",
        name: "Stay cryptic",
        fame: 40,
        cash: 0,
        needsTarget: false,
        flag: null,
        gating: {},
        deepLink: null,
    },
    GUEST: {
        key: "GUEST",
        name: "Bring on a guest",
        fame: 250,
        cash: 0,
        needsTarget: true,
        // GUEST writes a beef flag when tone === "TRASH", otherwise a respect flag.
        flag: "byTone",
        beefExpiresAfterFights: 4,
        respectExpiresAfterFights: 6,
        gating: { minPromotionTier: "Regional Pro" },
        deepLink: null,
    },
};

const PODCAST_SEGMENT_KEYS = Object.keys(PODCAST_SEGMENTS);

/**
 * Title combos — when both keys are present (order-independent), the episode gets
 * a flavour title. Keyed by the sorted pair "A|B".
 */
const TITLE_COMBOS = {
    "BREAKDOWN|TRASH": "No Mercy",
    "BREAKDOWN|RESPECT": "Respect the Grind",
    "CRYPTIC|RECAP": "Reading the Room",
    "GUEST|TRASH": "Shots Fired",
    "GUEST|RESPECT": "Common Ground",
    "BREAKDOWN|RECAP": "Tale of the Tape",
    "RECAP|TRASH": "Unfinished Business",
    "CRYPTIC|GUEST": "Smoke and Mirrors",
};

/** Deterministic fallback titles when no combo matches. */
const FALLBACK_TITLES = [
    "Off the Record",
    "Cage Talk",
    "The Long Game",
    "Inside the Pocket",
    "No Filter",
    "Mat Returns",
    "Closed Guard",
    "Final Round",
];

/**
 * Deterministic title for an episode. Tries the combo table first; otherwise picks
 * a stable fallback keyed by fighterId + episodeNumber (so the same episode always
 * gets the same title).
 * @param {string[]} segmentKeys
 * @param {string} fighterId
 * @param {number} episodeNumber
 */
function titleForEpisode(segmentKeys, fighterId, episodeNumber) {
    const sorted = [...segmentKeys].sort();
    const combo = TITLE_COMBOS[sorted.join("|")];
    if (combo) return combo;
    const seedStr = `${fighterId}:${episodeNumber}`;
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i += 1) {
        h ^= seedStr.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const idx = (h >>> 0) % FALLBACK_TITLES.length;
    return FALLBACK_TITLES[idx];
}

// ─────────────────────────────────────────────────────────────
// Podcast name generation
// ─────────────────────────────────────────────────────────────

const PODCAST_NAME_TEMPLATES = [
    "[Name] Uncensored",
    "No Shortcuts — with [Name]",
    "The [Name] Tapes",
    "Cageside with [Name]",
    "[Name] After Dark",
    "Two Minutes with [Name]",
    "The [Nick] Hour",
    "Straight Talk — [Name]",
];

/**
 * Generate a stable-ish podcast name. Uses nickname when available for "[Nick]"
 * templates, otherwise the full name. Deterministic given the same inputs.
 * @param {string} first
 * @param {string} last
 * @param {string|null} nick
 */
function generatePodcastName(first, last, nick) {
    const fullName = `${first || ""} ${last || ""}`.trim() || "The Fighter";
    const nickName = (nick && String(nick).trim()) || fullName;
    const seedStr = `${fullName}:${nickName}`;
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i += 1) {
        h ^= seedStr.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    // Prefer name-based templates if there's no real nickname.
    let candidates = PODCAST_NAME_TEMPLATES;
    if (!nick || !String(nick).trim()) {
        candidates = PODCAST_NAME_TEMPLATES.filter((t) => !t.includes("[Nick]"));
    }
    const tpl = candidates[(h >>> 0) % candidates.length];
    return tpl.replace("[Name]", fullName).replace("[Nick]", nickName);
}

// ─────────────────────────────────────────────────────────────
// Listener curve
// ─────────────────────────────────────────────────────────────

/**
 * Single smooth curve from fame score → listeners. Never resets because fame score
 * floors at peak tier. listeners(score) = round(200 + score * 1.4).
 * @param {number} score
 * @returns {number}
 */
function listenersFromScore(score) {
    const s = Math.max(0, Number(score) || 0);
    return Math.round(200 + s * 1.4);
}

/**
 * Format a listener count:
 *   <1000             → integer
 *   1000–999,999      → "X.Yk"  (drop trailing ".0")
 *   >=1,000,000       → "X.YM"  (drop trailing ".0")
 * @param {number} n
 * @returns {string}
 */
function formatListeners(n) {
    const v = Math.max(0, Math.round(Number(n) || 0));
    if (v < 1000) return String(v);
    const fmt = (val, suffix) => {
        const oneDp = Math.floor(val * 10) / 10;
        const str = oneDp.toFixed(1).replace(/\.0$/, "");
        return `${str}${suffix}`;
    };
    if (v < 1000000) return fmt(v / 1000, "k");
    return fmt(v / 1000000, "M");
}

// ─────────────────────────────────────────────────────────────
// Documentary
// ─────────────────────────────────────────────────────────────

const DOCUMENTARY_BASE_FAME = 1500;
const DOCUMENTARY_BASE_CASH = 2000;

/** Tone → fame added on top of base (combinedFame = base + toneFame). */
const DOCUMENTARY_TONE_FAME = {
    INSPIRATIONAL: 1500,
    RAW: 1800,
    CONTROVERSIAL: 2200,
};

const DOCUMENTARY_TIMING = {
    NOW: { mult: 1.0 },
    BEFORE_TITLE: { mult: 1.5 },
    AFTER_TITLE: { mult: 2.0 },
};

// Underdog focus shifts weight to cash (~60/40 cash-lean). Tunable.
const UNDERDOG_FAME_MULT = 0.5;
const UNDERDOG_CASH_MULT = 2.0;

const DOCUMENTARY_FOCUS = {
    FIGHTER: { key: "FIGHTER", fameMult: 1, cashMult: 1, grantsBooster: false },
    UNDERDOG: { key: "UNDERDOG", fameMult: UNDERDOG_FAME_MULT, cashMult: UNDERDOG_CASH_MULT, grantsBooster: false },
    TECHNICIAN: { key: "TECHNICIAN", fameMult: 1, cashMult: 1, grantsBooster: true },
};

const DOCUMENTARY_FOCUS_KEYS = Object.keys(DOCUMENTARY_FOCUS);
const DOCUMENTARY_TONE_KEYS = Object.keys(DOCUMENTARY_TONE_FAME);
const DOCUMENTARY_TIMING_KEYS = Object.keys(DOCUMENTARY_TIMING);

/** Tier gate — fame peakTier must be >= this. */
const DOCUMENTARY_UNLOCK_TIER = "STAR";
/** Raw fame score threshold for the STAR floor (used for the UI progress bar). */
const DOCUMENTARY_UNLOCK_THRESHOLD = 40000;

/** Booster granted by the Technician focus at payout time. */
const DOC_TECHNICIAN_BOOSTER_ID = "DOC_TECHNICIAN";
const DOC_TECHNICIAN_SESSIONS = 10;

/** Deferred timing window: a pending documentary that never meets its timing falls back to base after this many fights. */
const DOCUMENTARY_PENDING_MAX_FIGHTS = 10;

/** Badge string (existing) awarded for recording a documentary. */
const DOCUMENTARY_BADGE = "Documentary";

/**
 * Compute the documentary reward (fame + cash) for a given choice + timing multiplier.
 * combinedFame = (DOCUMENTARY_BASE_FAME + toneFame) * focus.fameMult * timingMult
 * combinedCash = DOCUMENTARY_BASE_CASH * focus.cashMult * timingMult
 * @param {{focus:string,tone:string}} choices
 * @param {number} timingMult
 */
function computeDocumentaryReward(choices, timingMult) {
    const focus = DOCUMENTARY_FOCUS[choices.focus];
    const toneFame = DOCUMENTARY_TONE_FAME[choices.tone] || 0;
    const baseFame = DOCUMENTARY_BASE_FAME + toneFame;
    const fame = Math.round(baseFame * focus.fameMult * timingMult);
    const cash = Math.round(DOCUMENTARY_BASE_CASH * focus.cashMult * timingMult);
    return { fame, cash, grantsBooster: !!focus.grantsBooster };
}

// ─────────────────────────────────────────────────────────────
// Appearances
// ─────────────────────────────────────────────────────────────

/**
 * Appearance type catalog.
 *
 * GATING — two distinct gating axes (an appearance uses exactly one):
 *   gatingTier            — required notoriety FAME peakTier (rank-compared via tierRank).
 *                           Used by MAGAZINE_COVER + CHARITY_EXHIBITION.
 *   gatingPromotionTier   — required fighter.promotionTier ("Regional Pro" +, rank-compared
 *                           via the promotion-tier order in mediaHubService).
 *                           Used by UNDERCARD_FEATURE + PODCAST_GUEST.
 *   (BRAND_DEAL_CLIP has no tier gate — it is gated purely by an active sponsor.)
 *
 * The `gatingTier` field is always present (used for the UI lock label / fame display);
 * when `gatingPromotionTier` is set, that promotion check is the authoritative eligibility
 * gate and the fame-tier check is skipped.
 *
 *   energy         — energy cost to take it
 *   fameByTier     — fame keyed by notoriety peakTier (resolved at take time)
 *   flatFame       — flat fame regardless of tier (CHARITY_EXHIBITION); takes precedence
 *                    over fameByTier when present
 *   deadlineDays   — days from offer until the instance auto-expires (requiresFightByDate for armed types)
 *   weight         — selection weight in the rotation pool
 *   needsTarget    — true for PODCAST_GUEST (writes a beef/respect flag)
 *   arms           — true for UNDERCARD_FEATURE (no immediate fame; pays on next qualifying fight)
 *   needsSponsor   — true for BRAND_DEAL_CLIP (only appears with an active sponsor)
 *   actionLabel    — UI button label
 */
const APPEARANCE_TYPES = {
    MAGAZINE_COVER: {
        type: "MAGAZINE_COVER",
        label: "Magazine Cover",
        gatingTier: "PROSPECT",
        energy: 5,
        fameByTier: { PROSPECT: 150, RISING_STAR: 300, CONTENDER: 500, STAR: 800, LEGEND: 1500 },
        deadlineDays: 7,
        weight: 3,
        actionLabel: "Shoot the cover",
    },
    PODCAST_GUEST: {
        type: "PODCAST_GUEST",
        label: "Guest on a Podcast",
        // Gated on PROMOTION tier (Regional Pro+), not fame tier.
        gatingPromotionTier: "Regional Pro",
        gatingTier: "PROSPECT", // display-only fallback; promotion gate is authoritative
        energy: 3,
        // Flat +350 fame on a chosen tone (writes a beef/respect flag).
        flatFame: 350,
        deadlineDays: 7,
        weight: 3,
        needsTarget: true,
        beefExpiresAfterFights: 4,
        respectExpiresAfterFights: 6,
        actionLabel: "Record the appearance",
    },
    UNDERCARD_FEATURE: {
        type: "UNDERCARD_FEATURE",
        label: "Undercard Feature",
        // Gated on PROMOTION tier (Regional Pro+), not fame tier.
        gatingPromotionTier: "Regional Pro",
        gatingTier: "RISING_STAR", // display-only fallback; promotion gate is authoritative
        energy: 0,
        // Fame paid on the qualifying fight, not at take time.
        fameByTier: { RISING_STAR: 250, CONTENDER: 450, STAR: 700, LEGEND: 1200 },
        deadlineDays: 7,
        // Window to land a qualifying fight after arming.
        fightByDays: 10,
        weight: 2,
        arms: true,
        actionLabel: "Sign up",
    },
    BRAND_DEAL_CLIP: {
        type: "BRAND_DEAL_CLIP",
        label: "Brand Deal Clip",
        // No tier gate — gated purely by an active sponsor.
        gatingTier: "UNKNOWN",
        energy: 0,
        // Cash only (50% of sponsor per-fight payout, snapshotted at generation).
        fameByTier: {},
        deadlineDays: 5,
        weight: 2,
        needsSponsor: true,
        actionLabel: "Film the clip",
    },
    CHARITY_EXHIBITION: {
        type: "CHARITY_EXHIBITION",
        label: "Charity Exhibition",
        // Gated on FAME tier (Contender+).
        gatingTier: "CONTENDER",
        energy: 0,
        // Flat +200 fame regardless of tier. No cash, no record/energy effect.
        flatFame: 200,
        cash: 0,
        deadlineDays: 7,
        weight: 2,
        actionLabel: "Sign up",
    },
};

const APPEARANCE_TYPE_KEYS = Object.keys(APPEARANCE_TYPES);

/** How many appearance instances surface per rotation. */
const APPEARANCE_POOL_SIZE = 3;

/** Appearance rotation length in ms (reuse weekly cadence). */
const APPEARANCE_ROTATION_MS = 7 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// Rivalry display constants (read-only, for /rivalry)
// ─────────────────────────────────────────────────────────────

const RIVALRY_DISPLAY = {
    nemesisFame: 150,
    beefFameMultPct: 30,
    beefLapsePenalty: 150,
    respectIronPct: 15,
    calloutPursePct: 25,
};

module.exports = {
    BEEF_LAPSE_PENALTY_FAME,
    RESPECT_WIN_IRON_MULT,

    PODCAST_ENERGY_COST,
    PODCAST_SEGMENT_COUNT,
    PODCAST_SEGMENTS,
    PODCAST_SEGMENT_KEYS,
    TITLE_COMBOS,
    FALLBACK_TITLES,
    titleForEpisode,
    PODCAST_NAME_TEMPLATES,
    generatePodcastName,

    listenersFromScore,
    formatListeners,

    DOCUMENTARY_BASE_FAME,
    DOCUMENTARY_BASE_CASH,
    DOCUMENTARY_TONE_FAME,
    DOCUMENTARY_TIMING,
    DOCUMENTARY_FOCUS,
    DOCUMENTARY_FOCUS_KEYS,
    DOCUMENTARY_TONE_KEYS,
    DOCUMENTARY_TIMING_KEYS,
    DOCUMENTARY_UNLOCK_TIER,
    DOCUMENTARY_UNLOCK_THRESHOLD,
    DOC_TECHNICIAN_BOOSTER_ID,
    DOC_TECHNICIAN_SESSIONS,
    DOCUMENTARY_PENDING_MAX_FIGHTS,
    DOCUMENTARY_BADGE,
    UNDERDOG_FAME_MULT,
    UNDERDOG_CASH_MULT,
    computeDocumentaryReward,

    APPEARANCE_TYPES,
    APPEARANCE_TYPE_KEYS,
    APPEARANCE_POOL_SIZE,
    APPEARANCE_ROTATION_MS,

    RIVALRY_DISPLAY,
};
