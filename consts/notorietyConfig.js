/**
 * Notoriety tiers — fame score, purse modifiers, floors (GDD / design spec).
 * Promotion tier (Amateur, …) maps to columns in BASE_FIGHT_NOTORIETY.
 */

const TIER_KEYS = [
    "UNKNOWN",
    "PROSPECT",
    "RISING_STAR",
    "CONTENDER",
    "STAR",
    "LEGEND",
];

/** @type {Record<string, { min: number, max: number | null, purseModifier: number, label: string }>} */
const NOTORIETY_TIERS = {
    UNKNOWN: { min: 0, max: 999, purseModifier: 0.0, label: "Unknown" },
    PROSPECT: { min: 1000, max: 4999, purseModifier: 0.05, label: "Prospect" },
    RISING_STAR: { min: 5000, max: 14999, purseModifier: 0.12, label: "Rising Star" },
    CONTENDER: { min: 15000, max: 39999, purseModifier: 0.22, label: "Contender" },
    STAR: { min: 40000, max: 79999, purseModifier: 0.35, label: "Star" },
    LEGEND: { min: 80000, max: null, purseModifier: 0.5, label: "Legend" },
};

const TIER_RANK = {
    UNKNOWN: 0,
    PROSPECT: 1,
    RISING_STAR: 2,
    CONTENDER: 3,
    STAR: 4,
    LEGEND: 5,
};

/** Maps fighter.promotionTier → column in BASE_FIGHT_NOTORIETY */
const PROMOTION_TO_NOTORIETY_COLUMN = {
    Amateur: "AMATEUR",
    "Regional Pro": "REGIONAL_PRO",
    National: "NATIONAL",
    "GCS Contender": "GCS",
    GCS: "GCS",
};

/**
 * Base notoriety from fight outcome × promotion column.
 * Keys: WIN_KO, WIN_SUB, WIN_DEC_UNAN, WIN_DEC_SPLIT, DRAW, LOSS_DEC, LOSS_FINISH
 */
const BASE_FIGHT_NOTORIETY = {
    WIN_KO: { AMATEUR: 80, REGIONAL_PRO: 200, NATIONAL: 500, GCS: 1200 },
    WIN_SUB: { AMATEUR: 70, REGIONAL_PRO: 175, NATIONAL: 450, GCS: 1000 },
    WIN_DEC_UNAN: { AMATEUR: 40, REGIONAL_PRO: 120, NATIONAL: 300, GCS: 700 },
    WIN_DEC_SPLIT: { AMATEUR: 25, REGIONAL_PRO: 80, NATIONAL: 200, GCS: 500 },
    DRAW: { AMATEUR: 10, REGIONAL_PRO: 30, NATIONAL: 80, GCS: 200 },
    LOSS_DEC: { AMATEUR: -10, REGIONAL_PRO: -30, NATIONAL: -80, GCS: -150 },
    LOSS_FINISH: { AMATEUR: -20, REGIONAL_PRO: -60, NATIONAL: -150, GCS: -300 },
};

const WEIGHT_MISS_NOTORIETY = -200;

const INACTIVITY_DECAY_START_DAYS = 20;
/** Spec: -1% of current notoriety per day from day 21 onward (applied once per daily job tick). */

function tierRank(tierKey) {
    return TIER_RANK[tierKey] ?? 0;
}

/**
 * Tier implied by score alone (for progress bars / next threshold).
 * @param {number} score
 * @returns {keyof NOTORIETY_TIERS}
 */
function calculateTierFromScore(score) {
    const s = Math.max(0, score);
    if (s >= 80000) return "LEGEND";
    if (s >= 40000) return "STAR";
    if (s >= 15000) return "CONTENDER";
    if (s >= 5000) return "RISING_STAR";
    if (s >= 1000) return "PROSPECT";
    return "UNKNOWN";
}

function purseModifierForTier(tierKey) {
    return NOTORIETY_TIERS[tierKey]?.purseModifier ?? 0;
}

function tierFloor(tierKey) {
    return NOTORIETY_TIERS[tierKey]?.min ?? 0;
}

/**
 * Next tier threshold above current score (null if already Legend cap band).
 * @param {number} score
 * @returns {number | null}
 */
function nextTierThreshold(score) {
    const s = Math.max(0, score);
    if (s < 1000) return 1000;
    if (s < 5000) return 5000;
    if (s < 15000) return 15000;
    if (s < 40000) return 40000;
    if (s < 80000) return 80000;
    return null;
}

/**
 * Progress 0–100 within current tier band toward next tier.
 * @param {number} score
 */
function tierProgressPercent(score) {
    const s = Math.max(0, score);
    const tier = calculateTierFromScore(s);
    const def = NOTORIETY_TIERS[tier];
    if (!def || def.max == null) return 100;
    const span = def.max - def.min + 1;
    const p = ((s - def.min) / span) * 100;
    return Math.min(100, Math.max(0, Math.round(p * 100) / 100));
}

function promotionColumn(promotionTier) {
    return PROMOTION_TO_NOTORIETY_COLUMN[promotionTier] || "AMATEUR";
}

function outcomeToNotorietyKey(resultOutcome) {
    if (resultOutcome === "KO/TKO") return "WIN_KO";
    if (resultOutcome === "Submission") return "WIN_SUB";
    if (resultOutcome === "Decision (unanimous)") return "WIN_DEC_UNAN";
    if (resultOutcome === "Decision (split)") return "WIN_DEC_SPLIT";
    if (resultOutcome === "Draw") return "DRAW";
    if (resultOutcome === "Loss (decision)") return "LOSS_DEC";
    if (resultOutcome === "Loss (KO/TKO)" || resultOutcome === "Loss (submission)") return "LOSS_FINISH";
    return null;
}

module.exports = {
    TIER_KEYS,
    NOTORIETY_TIERS,
    TIER_RANK,
    tierRank,
    BASE_FIGHT_NOTORIETY,
    PROMOTION_TO_NOTORIETY_COLUMN,
    WEIGHT_MISS_NOTORIETY,
    INACTIVITY_DECAY_START_DAYS,
    calculateTierFromScore,
    purseModifierForTier,
    tierFloor,
    nextTierThreshold,
    tierProgressPercent,
    promotionColumn,
    outcomeToNotorietyKey,
};
