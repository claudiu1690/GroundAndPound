/**
 * Ground & Pound — Fight Camp v2 configuration (Section 2B).
 * Single source of truth for all camp-related constants.
 * Mirrored in frontend/src/constants/campConfig.js for UI use.
 *
 * v2 changes:
 * - Removed flat campModifier on all stats (was too powerful)
 * - Session bonuses are now conditional — fire only when trigger occurs
 * - Match status expanded: MATCHED / PARTIAL / UNMATCHED / WRONG
 * - Fighter Report now has reliability tiers
 * - One hidden wildcard per opponent
 */

// ── Match status classifications ────────────────────────────────────────────
const MATCH_STATUSES = {
    MATCHED:   'MATCHED',    // Directly targets opponent's known strength/weakness → 100% bonus
    PARTIAL:   'PARTIAL',    // Generally useful but not specifically targeted → 50% bonus
    UNMATCHED: 'UNMATCHED',  // Nothing in opponent profile justifies this → 0% bonus
    WRONG:     'WRONG',      // Session contradicts opponent profile → 0% bonus + penalty (future: stance)
};

// Effective bonus multiplier per match status
const MATCH_STATUS_MULTIPLIERS = {
    [MATCH_STATUSES.MATCHED]:   1.0,
    [MATCH_STATUSES.PARTIAL]:   0.5,
    [MATCH_STATUSES.UNMATCHED]: 0,
    [MATCH_STATUSES.WRONG]:     0,
};

// ── Reliability tiers for Fighter Report ────────────────────────────────────
const RELIABILITY_TIERS = {
    CONFIRMED:  'CONFIRMED',   // Seen in 3+ of last 5 fights — reliable
    SUSPECTED:  'SUSPECTED',   // Seen in 1-2 fights — might apply
    UNVERIFIED: 'UNVERIFIED',  // Inferred from limited data
    UNKNOWN:    'UNKNOWN',     // No data at all
};

// ── Camp session definitions ────────────────────────────────────────────────
// modifierContribution: points earned for rating calculation (visual only).
// alwaysContributes: SPARRING earns full points, GAME_PLAN earns partial.
// partialContributor: special flag for GAME_PLAN_STUDY (always PARTIAL match).
const CAMP_SESSIONS = {
    TAKEDOWN_DEFENCE: {
        label: 'Takedown Defence Drilling',
        energy: 6,
        effectLabel: 'Sprawl success +25% when opponent shoots',
        modifierContribution: 3,
        recommendedAgainst: 'Wrestlers, Judoka, Sambo',
    },
    SUBMISSION_ESCAPES: {
        label: 'Submission Escapes',
        energy: 6,
        effectLabel: 'Escape probability +20% when caught',
        modifierContribution: 3,
        recommendedAgainst: 'BJJ, Sambo, Submission Hunters',
    },
    STRIKING_ACCURACY: {
        label: 'Striking Accuracy',
        energy: 5,
        effectLabel: 'Strike damage +15% in exchanges',
        modifierContribution: 2,
        recommendedAgainst: 'Defensive fighters, Counter Strikers',
    },
    CARDIO_PUSH: {
        label: 'Cardio Push',
        energy: 5,
        effectLabel: 'Stamina drain −20% when below 70%',
        modifierContribution: 2,
        recommendedAgainst: 'Pressure Fighters, high-volume opponents',
    },
    GAME_PLAN_STUDY: {
        label: 'Game Plan Study',
        energy: 4,
        effectLabel: 'Opponent damage −6% (partial — always active)',
        modifierContribution: 2,
        partialContributor: true, // always PARTIAL match — never MATCHED, never wasted
        recommendedAgainst: 'Any opponent — safe general purpose',
    },
    BODY_SHOT_FOCUS: {
        label: 'Body Shot Focus',
        energy: 5,
        effectLabel: 'Body damage +30%; opp Stamina drain +15%',
        modifierContribution: 2,
        recommendedAgainst: 'High-CHN fighters, weak-conditioning opponents',
    },
    CLINCH_CONTROL: {
        label: 'Clinch Control',
        energy: 5,
        effectLabel: 'Clinch damage +25% when clinch occurs',
        modifierContribution: 2,
        recommendedAgainst: 'Kickboxers, Muay Thai, Clinch Bullies',
    },
    GROUND_AND_POUND_POSTURE: {
        label: 'Ground & Pound Posture',
        energy: 6,
        effectLabel: 'GnP damage +20% from top position',
        modifierContribution: 2,
        recommendedAgainst: 'Guard players, submission-light opponents',
    },
    SPARRING_GENERAL: {
        label: 'Sparring (general)',
        energy: 8,
        effectLabel: '+3% all stats (always active); 3% injury risk',
        modifierContribution: 1,
        alwaysContributes: true, // unconditional bonus — always MATCHED
        injuryRisk: 0.03,
        recommendedAgainst: 'Generic fallback — expensive and risky',
    },
};

// ── Session bonus definitions (v2 conditional triggers) ─────────────────────
// Each session maps to a trigger condition and bonus that fires during fight
// resolution ONLY when that condition occurs.
const SESSION_BONUSES = {
    TAKEDOWN_DEFENCE: {
        triggerCondition: 'OPPONENT_SHOOTS_TAKEDOWN',
        bonusType:        'SPRAWL_SUCCESS',
        bonusValue:       0.25,
        description:      'Sprawl success +25%',
    },
    SUBMISSION_ESCAPES: {
        triggerCondition: 'OPPONENT_ATTEMPTS_SUBMISSION',
        bonusType:        'ESCAPE_PROBABILITY',
        bonusValue:       0.20,
        description:      'Submission escape +20%',
    },
    STRIKING_ACCURACY: {
        triggerCondition: 'STRIKING_EXCHANGE',
        bonusType:        'STRIKE_DAMAGE',
        bonusValue:       0.15,
        description:      'Strike damage +15%',
    },
    CARDIO_PUSH: {
        triggerCondition: 'PLAYER_STAMINA_BELOW_70',
        bonusType:        'STAMINA_DRAIN',
        bonusValue:       0.20,
        description:      'Stamina drain −20%',
    },
    GAME_PLAN_STUDY: {
        triggerCondition: 'ALWAYS',
        bonusType:        'OPPONENT_DAMAGE_REDUCTION',
        bonusValue:       0.06,
        description:      'Opponent damage −6%',
    },
    BODY_SHOT_FOCUS: {
        triggerCondition: 'STRIKING_EXCHANGE',
        bonusType:        'BODY_DAMAGE',
        bonusValue:       0.30,
        bodyStaminaDrain: 0.15,
        description:      'Body damage +30%, opp stamina drain +15%',
    },
    CLINCH_CONTROL: {
        triggerCondition: 'STRIKING_EXCHANGE',
        bonusType:        'CLINCH_DAMAGE',
        bonusValue:       0.25,
        clinchChance:     0.30, // 30% chance a striking round includes a clinch
        description:      'Clinch damage +25%',
    },
    GROUND_AND_POUND_POSTURE: {
        triggerCondition: 'PLAYER_TOP_POSITION',
        bonusType:        'GNP_DAMAGE',
        bonusValue:       0.20,
        description:      'GnP damage +20%',
    },
    SPARRING_GENERAL: {
        triggerCondition: 'ALWAYS',
        bonusType:        'ALL_STATS',
        bonusValue:       0.03,
        description:      '+3% all stats',
    },
};

// ── Stat → session counter mapping (for wildcard system) ────────────────────
// Maps a stat key to which camp session would counter an opponent strong in it.
const STAT_COUNTER_SESSION = {
    str: 'STRIKING_ACCURACY',
    spd: 'STRIKING_ACCURACY',
    leg: 'CLINCH_CONTROL',
    wre: 'TAKEDOWN_DEFENCE',
    gnd: 'GROUND_AND_POUND_POSTURE',
    sub: 'SUBMISSION_ESCAPES',
    chn: 'BODY_SHOT_FOCUS',
    fiq: 'GAME_PLAN_STUDY',
};

// ── Stat → fight domain mapping (for Fighter Report) ────────────────────────
// Maps stat keys to fight situations for determining UNKNOWN areas.
const STAT_FIGHT_DOMAIN = {
    str: { domain: 'striking',   methods: ['KO/TKO'] },
    spd: { domain: 'striking',   methods: ['KO/TKO'] },
    leg: { domain: 'striking',   methods: ['KO/TKO'] },
    wre: { domain: 'grappling',  methods: ['KO/TKO', 'Submission'] }, // takedowns appear in both
    gnd: { domain: 'grappling',  methods: ['KO/TKO'] },              // GnP finishes as KO/TKO
    sub: { domain: 'submission', methods: ['Submission'] },
    chn: { domain: 'durability', methods: [] },                       // inferred from losses
    fiq: { domain: 'tactical',   methods: ['Decision'] },
};

// ── Wildcard descriptions ───────────────────────────────────────────────────
const WILDCARD_DESCRIPTIONS = {
    str: 'has been developing knockout power in training',
    spd: 'has been drilling speed combinations with a new coach',
    leg: 'has added a dangerous kicking game recently',
    wre: 'has been working takedowns with a new wrestling coach',
    gnd: 'has been drilling ground and pound from new positions',
    sub: 'has been studying submission chains with a BJJ specialist',
    chn: 'has improved durability through strength and conditioning',
    fiq: 'has been studying film and improving fight IQ',
};

// ── Style → recommended sessions mapping ─────────────────────────────────────
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

// ── Camp slots per promotion tier ───────────────────────────────────────────
const CAMP_SLOT_CONFIG = {
    Amateur:         { normalSlots: 2,  shortNoticeSlots: 1 },
    'Regional Pro':  { normalSlots: 3,  shortNoticeSlots: 1 },
    National:        { normalSlots: 5,  shortNoticeSlots: 2 },
    'GCS Contender': { normalSlots: 8,  shortNoticeSlots: 3 },
    GCS:             { normalSlots: 10, shortNoticeSlots: 4 },
};

// ── Camp rating thresholds ──────────────────────────────────────────────────
// Grade is visual reference only — no flat fight modifier applied.
const CAMP_RATING_CONFIG = [
    { grade: 'S', min: 90, label: 'Elite preparation' },
    { grade: 'A', min: 75, label: 'Strong preparation' },
    { grade: 'B', min: 55, label: 'Good preparation' },
    { grade: 'C', min: 35, label: 'Adequate preparation' },
    { grade: 'D', min: 15, label: 'Weak preparation' },
    { grade: 'F', min: 0,  label: 'Poor preparation' },
];

// ── Diminishing returns for repeated sessions ───────────────────────────────
const DIMINISHING_RETURNS = [1.0, 0.6, 0.3];

// ── Skip-camp penalty ───────────────────────────────────────────────────────
const SKIP_CAMP_MODIFIER = -0.05;

// ── Camp injury types ───────────────────────────────────────────────────────
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

// ── Fighter Report — style-based tendencies ─────────────────────────────────
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

// ── Stat → readable labels ──────────────────────────────────────────────────
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
    SESSION_BONUSES,
    MATCH_STATUSES,
    MATCH_STATUS_MULTIPLIERS,
    RELIABILITY_TIERS,
    STAT_COUNTER_SESSION,
    STAT_FIGHT_DOMAIN,
    WILDCARD_DESCRIPTIONS,
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
