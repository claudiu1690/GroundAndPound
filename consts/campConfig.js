/**
 * Ground & Pound — Fight Camp v1.1 configuration.
 * Single source of truth for all camp-related constants.
 * Mirrored in frontend/src/constants/campConfig.js for UI use.
 */

// ── Camp session definitions ──────────────────────────────────────────────────
// modifierContribution: raw points added to campModifier×100 when this session
//   is "matched" to the opponent (scaled by diminishing returns).
// campBonuses: extra resolution hooks passed to resolveFight (only CARDIO_PUSH).
// alwaysContributes: earns points regardless of opponent style match.
// injuryRisk: probability of a camp injury (only SPARRING_GENERAL).
// modifierContribution: percentage points (0–100 scale) added directly to
// campModifier when this session is matched. campModifier = sum / 100.
// Scaled so a perfect Amateur camp (2 slots) gives ~+5%, a perfect GCS camp
// (10 slots, with diminishing returns) tops out around +16%.
const CAMP_SESSIONS = {
    TAKEDOWN_DEFENCE: {
        label: 'Takedown Defence Drilling',
        energy: 6,
        effectLabel: 'Sprawl success rate +25%',
        modifierContribution: 3,
        recommendedAgainst: 'Wrestlers, Judoka, Sambo',
    },
    SUBMISSION_ESCAPES: {
        label: 'Submission Escapes',
        energy: 6,
        effectLabel: 'Submission escape probability +20%',
        modifierContribution: 3,
        recommendedAgainst: 'BJJ, Sambo, Submission Hunters',
    },
    STRIKING_ACCURACY: {
        label: 'Striking Accuracy',
        energy: 5,
        effectLabel: 'Hit rate +15%; combo damage +10%',
        modifierContribution: 2,
        recommendedAgainst: 'Defensive fighters, Counter Strikers',
    },
    CARDIO_PUSH: {
        label: 'Cardio Push',
        energy: 5,
        effectLabel: 'Stamina drain -20% per round',
        modifierContribution: 2,
        campBonuses: { playerStaminaDrainMult: 0.80 }, // passed to resolveRound
        recommendedAgainst: 'Pressure Fighters, high-volume opponents',
    },
    GAME_PLAN_STUDY: {
        label: 'Game Plan Study',
        energy: 4,
        effectLabel: 'Opponent strategy modifier -15%',
        modifierContribution: 2,
        alwaysContributes: true, // always matched — general purpose
        recommendedAgainst: 'Any opponent — lowest cost general purpose',
    },
    BODY_SHOT_FOCUS: {
        label: 'Body Shot Focus',
        energy: 5,
        effectLabel: 'Body damage +30%; opponent Stamina drain +15%',
        modifierContribution: 2,
        recommendedAgainst: 'High-CHN fighters, weak-conditioning opponents',
    },
    CLINCH_CONTROL: {
        label: 'Clinch Control',
        energy: 5,
        effectLabel: 'Clinch win rate +25%',
        modifierContribution: 2,
        recommendedAgainst: 'Kickboxers, Muay Thai, Clinch Bullies',
    },
    GROUND_AND_POUND_POSTURE: {
        label: 'Ground & Pound Posture',
        energy: 6,
        effectLabel: 'GnP damage from top position +20%',
        modifierContribution: 2,
        recommendedAgainst: 'Guard players, submission-light opponents',
    },
    SPARRING_GENERAL: {
        label: 'Sparring (general)',
        energy: 8,
        effectLabel: '+5% all stats; 3% camp injury risk',
        modifierContribution: 1,
        alwaysContributes: true, // earns points regardless of match status
        injuryRisk: 0.03,
        recommendedAgainst: 'Generic fallback — expensive and risky',
    },
};

// ── Style → recommended sessions mapping ─────────────────────────────────────
// Used to compute matchStatus for each CampSession and the camp score.
// GAME_PLAN_STUDY and SPARRING_GENERAL are excluded — they're handled by alwaysContributes.
const STYLE_SESSION_MAP = {
    Wrestler:              ['TAKEDOWN_DEFENCE', 'SUBMISSION_ESCAPES', 'CARDIO_PUSH'],
    'Brazilian Jiu-Jitsu': ['SUBMISSION_ESCAPES', 'TAKEDOWN_DEFENCE', 'GROUND_AND_POUND_POSTURE'],
    Boxer:                 ['STRIKING_ACCURACY', 'BODY_SHOT_FOCUS', 'CLINCH_CONTROL'],
    Kickboxer:             ['CLINCH_CONTROL', 'TAKEDOWN_DEFENCE', 'STRIKING_ACCURACY'],
    'Muay Thai':           ['CLINCH_CONTROL', 'CARDIO_PUSH', 'TAKEDOWN_DEFENCE'],
    Judo:                  ['TAKEDOWN_DEFENCE', 'SUBMISSION_ESCAPES', 'GROUND_AND_POUND_POSTURE'],
    Sambo:                 ['TAKEDOWN_DEFENCE', 'SUBMISSION_ESCAPES', 'STRIKING_ACCURACY'],
    Capoeira:              ['STRIKING_ACCURACY', 'CLINCH_CONTROL', 'CARDIO_PUSH'],
};

// ── Camp slots per promotion tier ─────────────────────────────────────────────
// shortNoticeSlots is scaffolded for future short-notice fight feature.
const CAMP_SLOT_CONFIG = {
    Amateur:         { normalSlots: 2,  shortNoticeSlots: 1 },
    'Regional Pro':  { normalSlots: 3,  shortNoticeSlots: 1 },
    National:        { normalSlots: 5,  shortNoticeSlots: 2 },
    'GCS Contender': { normalSlots: 8,  shortNoticeSlots: 3 },
    GCS:             { normalSlots: 10, shortNoticeSlots: 4 },
};

// ── Camp rating thresholds ─────────────────────────────────────────────────────
// Score = (earnedPoints / maxPossiblePoints) × 100.
// campModifier (the float applied to stats) = sum(pointsEarned) / 100.
// The grade is display-only — the actual fight modifier is the raw computed float.
const CAMP_RATING_CONFIG = [
    { grade: 'S', min: 90, label: 'Elite preparation' },
    { grade: 'A', min: 75, label: 'Strong preparation' },
    { grade: 'B', min: 55, label: 'Good preparation' },
    { grade: 'C', min: 35, label: 'Adequate preparation' },
    { grade: 'D', min: 15, label: 'Weak preparation' },
    { grade: 'F', min: 0,  label: 'Poor preparation' },
];

// ── Diminishing returns for repeated sessions ─────────────────────────────────
// Index = 0-based occurrence count (0 = first use, 1 = second, 2+ = third+).
const DIMINISHING_RETURNS = [1.0, 0.6, 0.3];

// ── Skip-camp modifier ────────────────────────────────────────────────────────
// Small penalty for skipping camp entirely ("Fight Now").
// Kept intentionally mild — not doing camp should hurt a little, not be catastrophic.
const SKIP_CAMP_MODIFIER = -0.05;

// ── Camp injury types ─────────────────────────────────────────────────────────
// probability: relative weight among all camp injury outcomes (must sum to 1).
// gradeDrops: how many grade brackets the campRating drops if player chooses STOP.
// fightPenalty: stat multiplier penalties applied to fightPlayer if PUSH_THROUGH.
//   Keys match the fighter stat keys (str, spd, leg, wre, gnd, sub, chn, fiq)
//   plus 'maxStamina'. All values are negative (e.g. -0.10 = -10%).
const CAMP_INJURY_CONFIG = {
    BRUISED_KNUCKLE: {
        label: 'Bruised Knuckle',
        probability: 0.45,
        gradeDrops: 1,
        fightPenalty: { str: -0.10 },
        description: 'STR -10% for fight; combo damage reduced',
        stopDescription: 'Lose remaining slots; Camp Rating drops 1 grade',
    },
    TWISTED_KNEE: {
        label: 'Twisted Knee',
        probability: 0.25,
        gradeDrops: 1,
        fightPenalty: { leg: -0.20, wre: -0.10 },
        description: 'LEG -20%, WRE -10% for fight; takedown defence weakened',
        stopDescription: 'Lose remaining slots; Camp Rating drops 1 grade',
    },
    RIB_STRAIN: {
        label: 'Rib Strain',
        probability: 0.15,
        gradeDrops: 1,
        fightPenalty: { maxStamina: -0.15 },
        description: 'Max Stamina -15%; body damage amplified',
        stopDescription: 'Lose remaining slots; Camp Rating drops 1 grade',
    },
    MINOR_CONCUSSION: {
        label: 'Minor Concussion',
        probability: 0.10,
        gradeDrops: 2,
        fightPenalty: { fiq: -0.15 },
        description: 'FIQ -15%; corner instruction effectiveness reduced',
        stopDescription: 'Lose ALL remaining slots; Camp Rating drops 2 grades; mandatory doctor visit',
    },
    EYE_CUT: {
        label: 'Eye Cut (sparring)',
        probability: 0.05,
        gradeDrops: 1,
        fightPenalty: { spd: -0.10 },
        description: 'SPD -10%; opponent accuracy vs you +5%',
        stopDescription: 'Lose remaining slots; Camp Rating drops 1 grade; doctor visit needed',
    },
};

// ── Fighter Report — style-based tendencies ───────────────────────────────────
// Used when generating the Fighter Report from the opponent's data.
// Each style has a fixed tendency line and a primary-finish warning.
const STYLE_TENDENCY = {
    Wrestler: {
        tendency: 'Shoots for takedown within first 30 seconds of every round.',
        warning: 'GnP from top position is the primary finish method.',
    },
    'Brazilian Jiu-Jitsu': {
        tendency: 'Pulls guard or trips immediately after the clinch.',
        warning: 'Submission attempts spike dramatically on the ground — do not get taken down.',
    },
    Boxer: {
        tendency: 'Circles away from the power hand; resets after every exchange.',
        warning: 'Counter punching is the primary KO tool — avoid telegraphing attacks.',
    },
    Kickboxer: {
        tendency: 'Mixes low kicks into every combination; targets the lead leg.',
        warning: 'Leg damage accumulates fast — one badly-checked kick can shift the fight.',
    },
    'Muay Thai': {
        tendency: 'Forces the clinch along the cage; knees the body repeatedly.',
        warning: 'Dirty boxing in the clinch is the primary finish method.',
    },
    Judo: {
        tendency: 'Grabs and throws on any forward movement; prefers hip throws.',
        warning: 'Explosive takedowns can end rounds — stay out of grip range.',
    },
    Sambo: {
        tendency: 'Shoots low and transitions directly to heel hooks.',
        warning: 'Leg-lock chain sequences are the primary finish — do not grapple carelessly.',
    },
    Capoeira: {
        tendency: 'Creates angles with constant lateral movement; attacks off the back foot.',
        warning: 'Spinning attacks land when opponents overcommit — stay disciplined.',
    },
};

// ── Stat → readable strength label ───────────────────────────────────────────
// Used in Fighter Report to convert top/bottom stats to human-readable intel.
const STAT_STRENGTH_LABELS = {
    STR: 'Striking power — heavy hands, punishing shots',
    SPD: 'Hand speed — fast combinations, hard to time',
    LEG: 'Kicks — active leg attack, targets head and body',
    WRE: 'Takedown offence — shoots early and often, high success rate',
    GND: 'Top control — dominant from guard, heavy GnP',
    SUB: 'Submission game — chains multiple attempts from the bottom',
    CHN: 'Chin — has been rocked but never stopped; absorbs damage well',
    FIQ: 'Fight IQ — reads setups, rarely makes tactical mistakes',
};

const STAT_WEAKNESS_LABELS = {
    STR: 'Striking power — struggles to hurt opponents at range',
    SPD: 'Hand speed — slow hands; gets timed and counter-punched',
    LEG: 'Kicks — rarely uses the legs; kick-check is weak',
    WRE: 'Takedown defence — gets wrestled easily; poor hips',
    GND: 'Ground game — gets outworked from top; limited control',
    SUB: 'Submission defence — taps to basic submissions under pressure',
    CHN: 'Chin — has been rocked; absorbs damage poorly',
    FIQ: 'Fight IQ — makes positional mistakes under pressure',
};

module.exports = {
    CAMP_SESSIONS,
    STYLE_SESSION_MAP,
    CAMP_SLOT_CONFIG,
    CAMP_RATING_CONFIG,
    DIMINISHING_RETURNS,
    SKIP_CAMP_MODIFIER,
    CAMP_INJURY_CONFIG,
    STYLE_TENDENCY,
    STAT_STRENGTH_LABELS,
    STAT_WEAKNESS_LABELS,
};
