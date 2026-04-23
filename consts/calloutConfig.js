/**
 * Callouts (Phase 4) — spend fame to force a specific opponent into your next Hard slot
 * with full intel and stacked win bonuses.
 *
 * Eligible roster:
 *   - Same weight class as fighter.
 *   - Same promotion tier, OR one tier above ("stretch" — costs more).
 *   - Not a champion (champions remain gated behind the 3-wins-in-tier requirement).
 *   - Not the fighter's nemesis (already guaranteed to appear).
 *
 * Cost formula: base (per-tier) + 50/75 × max(0, opponent.OVR − fighter.OVR).
 * Stretch tier uses the bigger base + bigger slope.
 * Capped at COST_CAP so Legends can't torch themselves.
 *
 * Payoff on win:
 *   - Purse iron:  +25%
 *   - Fame (notoriety): reuses the existing grudgeMatchWin flat +30% base bonus in
 *                       computeFightNotorietyAward — no new math in fight logic.
 *   - Badge: "Callout Win" — unlocks BADGE_CALLOUT banner piece.
 */

const SAME_TIER_BASE   = 200;
const SAME_TIER_SLOPE  = 50;
const STRETCH_BASE     = 800;
const STRETCH_SLOPE    = 75;
const MIN_COST         = 100;
const COST_CAP         = 3000;

const PROMOTION_TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];
function stretchTierFor(tier) {
    const i = PROMOTION_TIER_ORDER.indexOf(tier);
    if (i < 0 || i === PROMOTION_TIER_ORDER.length - 1) return null;
    return PROMOTION_TIER_ORDER[i + 1];
}

function computeCalloutCost(fighter, opponent) {
    if (!fighter || !opponent) return MIN_COST;
    const isStretch = opponent.promotionTier !== fighter.promotionTier;
    const base  = isStretch ? STRETCH_BASE  : SAME_TIER_BASE;
    const slope = isStretch ? STRETCH_SLOPE : SAME_TIER_SLOPE;
    const gap   = Math.max(0, (opponent.overallRating || 0) - (fighter.overallRating || 0));
    const raw   = base + slope * gap;
    return Math.max(MIN_COST, Math.min(COST_CAP, Math.round(raw)));
}

/** Win payoff multipliers — applied in fightService on resolve. */
const CALLOUT_PURSE_MULT = 1.25;
const CALLOUT_BADGE      = "Callout Win";

module.exports = {
    SAME_TIER_BASE,
    SAME_TIER_SLOPE,
    STRETCH_BASE,
    STRETCH_SLOPE,
    MIN_COST,
    COST_CAP,
    PROMOTION_TIER_ORDER,
    stretchTierFor,
    computeCalloutCost,
    CALLOUT_PURSE_MULT,
    CALLOUT_BADGE,
};
