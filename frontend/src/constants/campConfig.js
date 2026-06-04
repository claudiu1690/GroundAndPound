/**
 * Fight Camp v2 — frontend constants.
 * Mirrors backend consts/campConfig.js for UI rendering.
 * No business logic — display metadata only.
 */

export const MATCH_STATUSES = {
    MATCHED:   "MATCHED",
    PARTIAL:   "PARTIAL",
    UNMATCHED: "UNMATCHED",
    WRONG:     "WRONG",
};

export const MATCH_STATUS_LABELS = {
    MATCHED:   "Matched",
    PARTIAL:   "Partial",
    UNMATCHED: "Unmatched",
    WRONG:     "Wrong fit",
};

export const MATCH_STATUS_COLORS = {
    MATCHED:   "#4ade80",
    PARTIAL:   "#facc15",
    UNMATCHED: "#94a3b8",
    WRONG:     "#f87171",
};

export const RELIABILITY_TIERS = {
    CONFIRMED:  "CONFIRMED",
    SUSPECTED:  "SUSPECTED",
    UNVERIFIED: "UNVERIFIED",
    UNKNOWN:    "UNKNOWN",
};

export const RELIABILITY_LABELS = {
    CONFIRMED:  "Confirmed",
    SUSPECTED:  "Suspected",
    UNVERIFIED: "Unverified",
    UNKNOWN:    "Unknown",
};

export const RELIABILITY_COLORS = {
    CONFIRMED:  "#4ade80",
    SUSPECTED:  "#facc15",
    UNVERIFIED: "#94a3b8",
    UNKNOWN:    "#64748b",
};

export const CAMP_SESSIONS = {
    TAKEDOWN_DEFENCE: {
        label: "Takedown Defence Drilling",
        energy: 6,
        effectLabel: "Sprawl success +25% when opponent shoots",
        modifierContribution: 3,
        recommendedAgainst: "Wrestlers, Judoka, Sambo",
    },
    SUBMISSION_ESCAPES: {
        label: "Submission Escapes",
        energy: 6,
        effectLabel: "Escape probability +20% when caught",
        modifierContribution: 3,
        recommendedAgainst: "BJJ, Sambo, Submission Hunters",
    },
    STRIKING_ACCURACY: {
        label: "Striking Accuracy",
        energy: 5,
        effectLabel: "Strike damage +15% in exchanges",
        modifierContribution: 2,
        recommendedAgainst: "Defensive fighters, Counter Strikers",
    },
    CARDIO_PUSH: {
        label: "Cardio Push",
        energy: 5,
        effectLabel: "Stamina drain \u221220% when below 70%",
        modifierContribution: 2,
        recommendedAgainst: "Pressure Fighters, high-volume opponents",
    },
    GAME_PLAN_STUDY: {
        label: "Game Plan Study",
        energy: 4,
        effectLabel: "Opponent damage \u22126% (partial \u2014 always active)",
        modifierContribution: 2,
        partialContributor: true,
        recommendedAgainst: "Any opponent \u2014 safe general purpose",
    },
    BODY_SHOT_FOCUS: {
        label: "Body Shot Focus",
        energy: 5,
        effectLabel: "Body damage +30%; opp Stamina drain +15%",
        modifierContribution: 2,
        recommendedAgainst: "High-CHN fighters, weak-conditioning opponents",
    },
    CLINCH_CONTROL: {
        label: "Clinch Control",
        energy: 5,
        effectLabel: "Clinch damage +25% when clinch occurs",
        modifierContribution: 2,
        recommendedAgainst: "Kickboxers, Muay Thai, Clinch Bullies",
    },
    GROUND_AND_POUND_POSTURE: {
        label: "Ground & Pound Posture",
        energy: 6,
        effectLabel: "GnP damage +20% from top position",
        modifierContribution: 2,
        recommendedAgainst: "Guard players, submission-light opponents",
    },
    SPARRING_GENERAL: {
        label: "Sparring (general)",
        energy: 8,
        effectLabel: "+3% all stats (always active); 3% injury risk",
        modifierContribution: 1,
        alwaysMatched: true,
        injuryRisk: true,
        recommendedAgainst: "Generic fallback \u2014 expensive and risky",
    },
};

export const CAMP_SESSION_KEYS = Object.keys(CAMP_SESSIONS);

export const CAMP_SLOT_CONFIG = {
    Amateur:          { normalSlots: 2,  shortNoticeSlots: 1 },
    "Regional Pro":   { normalSlots: 3,  shortNoticeSlots: 1 },
    National:         { normalSlots: 5,  shortNoticeSlots: 2 },
    "GCS Contender":  { normalSlots: 8,  shortNoticeSlots: 3 },
    GCS:              { normalSlots: 10, shortNoticeSlots: 4 },
};

/**
 * Fight energy cost per promotion tier (mirror of backend PROMOTION_TIERS
 * fightEnergyCost). Used for the PvP camp "−{N} Energy" stake chip.
 */
export const TIER_FIGHT_ENERGY_COST = {
    Amateur:          10,
    "Regional Pro":   15,
    National:         18,
    "GCS Contender":  20,
    GCS:              20,
};

/** Fight energy cost for an attacker's promotion tier (default 10 = Amateur). */
export function getFightEnergyCost(promotionTier) {
    return TIER_FIGHT_ENERGY_COST[promotionTier] ?? 10;
}

export const CAMP_RATING_CONFIG = [
    { grade: "S", min: 90, label: "Elite preparation",    color: "#f59e0b" },
    { grade: "A", min: 75, label: "Strong preparation",   color: "#22c55e" },
    { grade: "B", min: 55, label: "Good preparation",     color: "#3b82f6" },
    { grade: "C", min: 35, label: "Adequate preparation", color: "#a78bfa" },
    { grade: "D", min: 15, label: "Weak preparation",     color: "#94a3b8" },
    { grade: "F", min: 0,  label: "Poor preparation",     color: "#e31837" },
];

export const CAMP_INJURY_LABELS = {
    BRUISED_KNUCKLE:  "Bruised Knuckle",
    TWISTED_KNEE:     "Twisted Knee",
    RIB_STRAIN:       "Rib Strain",
    MINOR_CONCUSSION: "Minor Concussion",
    EYE_CUT:          "Eye Cut (sparring)",
};

/** Returns the rating config entry for a given grade letter. */
export function getRatingConfig(grade) {
    return CAMP_RATING_CONFIG.find((r) => r.grade === grade) ?? CAMP_RATING_CONFIG[CAMP_RATING_CONFIG.length - 1];
}

// ── Client style-match cue + projected camp grade ───────────────────────────
// Mirror of backend consts/campConfig.js + campService.getMatchStatus /
// computeCampRating. Used ONLY for the PvP camp screen's CLIENT-SIDE
// "projected" grade and per-session MATCHED/PARTIAL/UNMATCHED cue against the
// defender's style — the authoritative grade comes from the server's
// campBreakdown.rating on the fight summary. Keep in sync with the backend.

/** Effective bonus multiplier per match status (mirror backend). */
export const MATCH_STATUS_MULTIPLIERS = {
    MATCHED:   1.0,
    PARTIAL:   0.5,
    UNMATCHED: 0,
    WRONG:     0,
};

/**
 * Style → recommended sessions mapping (mirror backend STYLE_SESSION_MAP).
 * A session that appears in the defender style's list is MATCHED.
 */
export const STYLE_SESSION_MAP = {
    Wrestler:              ["TAKEDOWN_DEFENCE", "SUBMISSION_ESCAPES", "CARDIO_PUSH"],
    "Brazilian Jiu-Jitsu": ["SUBMISSION_ESCAPES", "TAKEDOWN_DEFENCE", "GROUND_AND_POUND_POSTURE"],
    Boxer:                 ["STRIKING_ACCURACY", "BODY_SHOT_FOCUS", "CLINCH_CONTROL"],
    Kickboxer:             ["CLINCH_CONTROL", "TAKEDOWN_DEFENCE", "STRIKING_ACCURACY"],
    "Muay Thai":           ["CLINCH_CONTROL", "CARDIO_PUSH", "TAKEDOWN_DEFENCE"],
    Judo:                  ["TAKEDOWN_DEFENCE", "SUBMISSION_ESCAPES", "GROUND_AND_POUND_POSTURE"],
    Sambo:                 ["TAKEDOWN_DEFENCE", "SUBMISSION_ESCAPES", "STRIKING_ACCURACY"],
    Capoeira:              ["STRIKING_ACCURACY", "CLINCH_CONTROL", "CARDIO_PUSH"],
};

/** Diminishing returns for repeated sessions (mirror backend). */
const DIMINISHING_RETURNS = [1.0, 0.6, 0.3];

/**
 * Port of backend campService.getMatchStatus.
 * - partialContributor (GAME_PLAN_STUDY) → always PARTIAL
 * - alwaysMatched (SPARRING_GENERAL) → always MATCHED
 * - in STYLE_SESSION_MAP[defenderStyle] → MATCHED, else UNMATCHED
 *
 * NOTE: the frontend CAMP_SESSIONS uses `alwaysMatched` where the backend uses
 * `alwaysContributes`; both flags are honored here for safety.
 */
export function getMatchStatus(sessionType, defenderStyle) {
    const cfg = CAMP_SESSIONS[sessionType];
    if (!cfg) return MATCH_STATUSES.UNMATCHED;
    if (cfg.partialContributor) return MATCH_STATUSES.PARTIAL;
    if (cfg.alwaysMatched || cfg.alwaysContributes) return MATCH_STATUSES.MATCHED;
    const recommended = STYLE_SESSION_MAP[defenderStyle] || [];
    return recommended.includes(sessionType) ? MATCH_STATUSES.MATCHED : MATCH_STATUSES.UNMATCHED;
}

/**
 * Client-side PROJECTED camp grade (port of campService.computeCampRating).
 * Mirrors addCampSession's pointsEarned math:
 *   pointsEarned = round(modifierContribution * diminishingFactor * multiplier)
 * with diminishing applied in submission order per repeated session type.
 * Returns the grade letter ("S".."F"). The server's campBreakdown.rating is
 * authoritative on the summary — this is labelled "projected" in the UI.
 */
export function projectCampGrade(sessionIds, defenderStyle, maxSlots) {
    const ids = Array.isArray(sessionIds) ? sessionIds : [];
    const slots = maxSlots && maxSlots > 0 ? maxSlots : 0;
    const maxPossiblePoints = slots * 3;

    const seen = {};
    let totalPoints = 0;
    for (const sessionType of ids) {
        const cfg = CAMP_SESSIONS[sessionType];
        if (!cfg) continue;
        const priorCount = seen[sessionType] || 0;
        seen[sessionType] = priorCount + 1;
        const diminishingFactor = DIMINISHING_RETURNS[Math.min(priorCount, DIMINISHING_RETURNS.length - 1)];
        const multiplier = MATCH_STATUS_MULTIPLIERS[getMatchStatus(sessionType, defenderStyle)] ?? 0;
        totalPoints += Math.round((cfg.modifierContribution ?? 0) * diminishingFactor * multiplier);
    }

    const scorePercent = maxPossiblePoints > 0
        ? Math.min(100, Math.round((totalPoints / maxPossiblePoints) * 100))
        : 0;
    const entry = CAMP_RATING_CONFIG.find((r) => scorePercent >= r.min)
        || CAMP_RATING_CONFIG[CAMP_RATING_CONFIG.length - 1];
    return entry.grade;
}
