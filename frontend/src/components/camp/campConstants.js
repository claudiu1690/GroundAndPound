/**
 * Your Camp — shared view-model helpers (presentation only).
 *
 * Every number a player sees (energy costs, XP multipliers, condition
 * thresholds/cutoffs, rank session/win requirements, costs) comes straight
 * from the `GET /home-camp/:fighterId` response. This file only maps enums
 * the API already sends into hex colors / CSS class slugs so components
 * never hardcode game balance. Precedent: components/shop/shopConstants.js.
 * The frontend does NOT read consts/homeCampConfig.js (backend-only).
 */

// Coach rarity -> frame/tag color. Same ladder + hex values as
// constants/specialMovesCatalog.js RARITY_COLORS (a coach and a move never
// render a different "RARE" blue) — duplicated locally so this file has no
// cross-feature import, matching the shopConstants precedent.
export const RARITY_COLOR = {
  COMMON: "#888888",
  UNCOMMON: "#22c55e",
  RARE: "#3b82f6",
  LEGENDARY: "#D4A820",
};

export function rarityColor(rarity) {
  return RARITY_COLOR[rarity] || RARITY_COLOR.COMMON;
}

// Coach morale tone (API: coach.morale.tone) -> CSS class suffix.
// Unknown/future tones fall back to "good" rather than rendering unstyled.
const MORALE_TONES = new Set(["good", "warn", "bad"]);
export function moraleToneClass(tone) {
  return MORALE_TONES.has(tone) ? tone : "good";
}

// Need tone (API: needs[].tone) -> CSS class suffix.
const NEED_TONES = new Set(["gold", "amber", "warn", "blue"]);
export function needToneClass(tone) {
  return NEED_TONES.has(tone) ? tone : "gold";
}

// Condition band (API: condition.band) -> bar/text colour. Colour only — the
// cutoffs (0-19 / 20-49 / 50-100) and the xpMultiplier live solely in the API
// response (condition.penaltyStartsAt, condition.xpMultiplier).
const CONDITION_BAND_COLOR = {
  CRITICAL: "#C8102E",
  POOR: "#C87A10",
  GOOD: "#22c55e",
};
export function conditionBandColor(band) {
  return CONDITION_BAND_COLOR[band] || CONDITION_BAND_COLOR.GOOD;
}

// Drill metric grading — a pure readability convention (which of the API's
// own numbers gets a red/amber/neutral accent), not a game-balance cutoff.
// Deliberately binary (present vs. zero) so no magic percentage threshold is
// ever duplicated here; the number itself always comes from the drill object.
export function injuryToneClass(pct) {
  return pct > 0 ? "warn" : "neu";
}
// Move drops are the payoff — they render gold, not warning-amber (owner pick 05-V1).
export function dropToneClass(pct) {
  return pct > 0 ? "gold" : "dash";
}

// Drill family (API: drill.family "spar"|"bag"|"none") -> card stripe class.
// Pure presentation: sparring reads red (risk/reward), bag work amber, technical
// drills teal. Unknown/absent families get a neutral stripe, never a crash.
const FAMILY_STRIPE = { spar: "spar", bag: "bag", none: "drill" };
export function familyStripeClass(family) {
  return FAMILY_STRIPE[family] || "plain";
}

// Stat tag -> chip class (presentation-only color coding for the 8 stats).
const STAT_CHIP = {
  STR: "red", SPD: "blue", LEG: "amber", CHN: "gold",
  WRE: "blue", GND: "teal", SUB: "teal", FIQ: "purple",
};
export function statChipClass(stat) {
  return STAT_CHIP[stat] || "grey";
}
export function conditionDeltaToneClass(delta) {
  if (delta > 0) return "pos";
  if (delta < 0) return "bad";
  return "neu";
}

// Blocked-hire reason (API: candidate.blockedReason) -> CSS tone class. Purely
// cosmetic grouping of the advisory reasons the market can send (contract
// §3.2) — the label text itself always comes from `candidate.blockedLabel`.
const BLOCKED_REASON_TONE = {
  insufficient_cash: "bad",
  no_slot: "bad",
  archetype_taken: "warn",
  archetype_locked: "warn",
};
export function blockedReasonTone(reason) {
  return BLOCKED_REASON_TONE[reason] || "warn";
}

// Deep Clean cost/gain — CONTRACT GAP (flagged to the architect): the
// GET /home-camp envelope has no field carrying these anywhere (checked all
// three gate payloads), even though the Deep Clean confirm has to show a
// price before the player commits. Values mirror consts/homeCampConfig.js
// DEEP_CLEAN_COST / DEEP_CLEAN_GAIN verbatim (contract §2.4) — safe under
// P1-J ("displayed price == charged price is law", i.e. these are frozen,
// not per-request numbers) but this is presentation duplicating a backend
// constant, which the file banner above says never to do. The actual
// charged cost/gain (POST response) is what renders in the success message;
// only the PRE-click preview relies on this pair. Follow-up: add
// `camp.deepClean: { cost, gain }` to the GET envelope so this can be
// deleted.
export const DEEP_CLEAN_COST = 300;
export const DEEP_CLEAN_GAIN = 40;

// Exclusive (Legendary masterclass) drill styling — Phase 2, F4. Presentation
// only: the API sends `isExclusive: true|false` on EVERY drill (both the
// hired-coach shape and the locked `{key,name,locked:true,unlockRank}` shape),
// so the frontend never infers it from the drill key string. This is purely
// the gold/red "trophy card" treatment layered on top of whatever the drill
// already renders (unlocked numbers, or the existing "???" locked look) —
// no numbers live here.
export function exclusiveDrillClass(isExclusive) {
  return isExclusive ? "yc-drill-card--exclusive" : "";
}

/** Coach initials fallback if the API ever omits them (defensive only). */
export function coachInitials(name) {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "??";
}
