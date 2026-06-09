/**
 * Octagon Gazette — client-side presentational templating.
 *
 * The backend composes the stories (headlines/bodies) and the structured
 * lastResult; this module only adds newspaper flavour the backend doesn't carry:
 * the section label per story, a deterministic pull-quote, and the masthead
 * volume/issue line. Pure functions — deterministic for a given input so the
 * paper never flickers on re-render.
 */

/** Story type → newspaper section label shown above each column. */
export const STORY_LABELS = {
  last_fight: "Fight Report",
  first_loss: "Fight Report",
  first_loss_in_title: "Title Fight",
  title_fight: "Title Fight",
  auto_promotion: "Promotion",
  rank_entry: "Rankings",
  rank_jump: "Rankings",
  win_streak: "Streak Watch",
  notoriety_gained: "Notoriety Report",
  notoriety_lost: "Notoriety Report",
  fame_tier_up: "Fame Watch",
  comeback: "Comeback Trail",
  record_milestone: "Milestone",
  event_result: "Main Event",
  spotlight: "Spotlight",
  mental_reset_required: "Notice",
};

export function storyLabel(type) {
  return STORY_LABELS[type] || "Report";
}

// ── Pull quotes ─────────────────────────────────────────────
// Grouped by theme; one is picked deterministically per story so the same paper
// always reads the same way.
const QUOTE_POOLS = {
  win: [
    "Patient, composed, relentless. The blueprint is working.",
    "Another night, another statement. The division is on notice.",
    "They came with a plan. It did not survive contact.",
  ],
  loss: [
    "A setback, not a sentence. Champions are forged on nights like these.",
    "The margins were thin. The lessons will not be.",
    "Every great run has a chapter like this one.",
  ],
  title: [
    "Gold changes a career. The whole division feels it.",
    "This is the fight they will talk about for years.",
  ],
  notoriety: [
    "At this rate, the champion will have no choice but to answer.",
    "The whole division is saying the name now.",
    "Buzz like this does not fade — it builds.",
  ],
  streak: [
    "Nobody has solved the riddle yet. Few look close.",
    "A run like this writes its own headlines.",
  ],
  ranking: [
    "Every name above is now looking over a shoulder.",
    "The climb is steep. The ascent looks effortless.",
  ],
  fame: [
    "From unknown to unmissable in a single season.",
    "The lights find some fighters. This one walked into them.",
  ],
  comeback: [
    "Down is not out. The story is far from finished.",
    "Write them off at your peril.",
  ],
  generic: [
    "The fight game rewards the relentless.",
    "Some names you remember. This is becoming one of them.",
  ],
};

function themeForStory(story, lastResult) {
  switch (story.type) {
    case "last_fight":
      return lastResult ? (lastResult.playerWon ? "win" : "loss") : "win";
    case "title_fight":
    case "first_loss_in_title":
      return "title";
    case "first_loss":
      return "loss";
    case "notoriety_gained":
    case "notoriety_lost":
      return "notoriety";
    case "win_streak":
      return "streak";
    case "rank_jump":
    case "rank_entry":
    case "auto_promotion":
      return "ranking";
    case "fame_tier_up":
      return "fame";
    case "comeback":
      return "comeback";
    default:
      return "generic";
  }
}

/** Small stable string hash for deterministic picks. */
function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** A deterministic pull-quote for a story, or null. */
export function pullQuoteFor(story, lastResult) {
  if (!story) return null;
  const pool = QUOTE_POOLS[themeForStory(story, lastResult)] || QUOTE_POOLS.generic;
  if (pool.length === 0) return null;
  return pool[hashString(story.headline || story.type) % pool.length];
}

// ── Masthead volume / issue line ────────────────────────────
const ROMAN = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function toRoman(n) {
  let num = Math.max(1, Math.floor(n));
  let out = "";
  for (const [v, sym] of ROMAN) {
    while (num >= v) { out += sym; num -= v; }
  }
  return out;
}

/**
 * Derive a stable "Vol. XII · No. 153" line from the gazette date (YYYY-MM-DD).
 * Volume tracks the year (2026 → Vol. XII), issue is the day of the year.
 */
export function mastheadIssue(dateStr) {
  if (!dateStr) return "Vol. XII · No. 1";
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const year = Number.isFinite(y) ? y : 2026;
  const vol = toRoman(year - 2014); // 2026 → XII, matching the masthead tradition
  // Day of year (UTC, no Date.now dependency).
  const dayOfYear = Math.max(1, Math.round(
    (Date.UTC(year, (m || 1) - 1, d || 1) - Date.UTC(year, 0, 0)) / 86400000
  ));
  return `Vol. ${vol} · No. ${dayOfYear}`;
}
