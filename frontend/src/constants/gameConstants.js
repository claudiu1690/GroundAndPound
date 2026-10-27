/** Mirror of backend game constants for forms (create fighter, etc.) */
export const WEIGHT_CLASSES = [
  "Featherweight",
  "Lightweight",
  "Middleweight",
  "Heavyweight",
];

export const STYLES = {
  Boxer: "Boxer",
  Kickboxer: "Kickboxer",
  Wrestler: "Wrestler",
  "Brazilian Jiu-Jitsu": "Brazilian Jiu-Jitsu",
  "Muay Thai": "Muay Thai",
  Judo: "Judo",
  Sambo: "Sambo",
  Capoeira: "Capoeira",
};

export const STYLE_OPTIONS = Object.keys(STYLES);

export const BACKSTORIES = {
  None: null,
  "Street Fighter": "Street Fighter",
  "College Wrestler": "College Wrestler",
  "Kickboxing Champion": "Kickboxing Champion",
  "Army Veteran": "Army Veteran",
  "MMA Prodigy": "MMA Prodigy",
  "Late Bloomer": "Late Bloomer",
};

export const BACKSTORY_OPTIONS = Object.entries(BACKSTORIES).map(([label, value]) => ({
  label: label === "None" ? "None" : label,
  value,
}));

export const PROMOTION_TIERS = [
  "Amateur",
  "Regional Pro",
  "National",
  "GCS Contender",
  "GCS",
];

export const FIGHT_ENERGY_COST = {
  Amateur:          10,
  "Regional Pro":   15,
  National:         18,
  "GCS Contender":  20,
  GCS:              20,
};

/**
 * Wins required at the current tier to unlock a title shot, keyed by the
 * fighter's current promotionTier. The Amateur belt (the "turn pro" fight)
 * has a lighter gate; every pro tier from Regional Pro up needs 3.
 */
export const TITLE_WINS = {
  Amateur:          2,
  "Regional Pro":   3,
  National:         3,
  "GCS Contender":  3,
  GCS:              3,
};

/** The top promotion tier. A fighter here defends the belt forever (no next tier). */
export const TOP_TIER = PROMOTION_TIERS[PROMOTION_TIERS.length - 1];

/**
 * Highest DISPLAY rank that counts as "top 5". The champion holds one of the five
 * slots, so only display #1 to #4 are contenders and display #5 is NOT top 5.
 * Mirrors dashboardService topFiveCutoff(); the dashboard payload's
 * titleShot.topFiveCutoff carries the same value.
 */
export const TOP_FIVE_DISPLAY_CUTOFF = 4;

/** Fights played in a tier before a fighter gets a rank. Mirrors rankingService RANKED_AFTER_FIGHTS. */
export const RANKED_AFTER_FIGHTS = 3;

/**
 * Fame paid for winning the belt fight, by the tier of the belt being fought for
 * (the fighter's current tier; the Amateur belt is the "turn pro" fight).
 * Mirrors backend TITLE_SHOT_BY_TIER beltFame.
 */
export const BELT_FAME = {
  Amateur:        75,
  "Regional Pro": 200,
  National:       200,
  GCS:            200,
};

/** Fame for a successful GCS title defense. Mirrors backend TITLE_SHOT_BY_TIER GCS defense value. */
export const GCS_DEFENSE_FAME = 100;

/** True when a DISPLAY rank (fighter.ranking.rank as the API ships it) is inside the title-shot zone. */
export function isTopFiveDisplayRank(displayRank) {
  return displayRank != null && displayRank <= TOP_FIVE_DISPLAY_CUTOFF;
}

/**
 * Contender = waiting on a belt fight in the current tier. Uses the server flag
 * (`titleContender`, also true for every GCS fighter); a payload from before the
 * flag existed falls back to the old pendingPromotion check.
 */
export function isTitleContender(fighter) {
  if (!fighter) return false;
  if (typeof fighter.titleContender === "boolean") return fighter.titleContender;
  return !!fighter.pendingPromotion;
}
