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
