/**
 * Frontend display mirror of consts/pvpConfig.js
 * DISPLAY-ONLY — never used for game-logic derivation.
 * All authoritative values come from API responses (divisionColor, dpBreakdown,
 * twistName, etc. are embedded in every response DTO).
 */

export const DIVISIONS = [
  { key: "prospect",   label: "Prospect",   color: "#888888",  floor: 0,    promoteAt: 300  },
  { key: "contender",  label: "Contender",  color: "#93C5FD",  floor: 300,  promoteAt: 1200 },
  { key: "challenger", label: "Challenger", color: "#C4B5FD",  floor: 1200, promoteAt: 2500 },
  { key: "elite",      label: "Elite",      color: "#5EEAD4",  floor: 2500, promoteAt: 5000 },
  { key: "champion",   label: "Champion",   color: "#C8102E",  floor: 5000, promoteAt: null },
];

/** Map a division key → its color hex. Falls back to grey. */
export function divisionColor(key) {
  return DIVISIONS.find((d) => d.key === key)?.color ?? "#888888";
}

/** Division label for display */
export function divisionLabel(key) {
  return DIVISIONS.find((d) => d.key === key)?.label ?? key;
}

/** Full division meta — floor, promoteAt, label, color. Returns defaults for unknown keys. */
export function divisionMeta(key) {
  return DIVISIONS.find((d) => d.key === key) ?? { key, label: key, color: "#888888", floor: 0, promoteAt: null };
}

export const REWARDS = {
  prospect:   { iron: 500,   fame: 500,   drinks: 0, badge: null        },
  contender:  { iron: 1200,  fame: 1200,  drinks: 0, badge: null        },
  challenger: { iron: 2500,  fame: 2500,  drinks: 0, badge: "challenger" },
  elite:      { iron: 5000,  fame: 5000,  drinks: 2, badge: "elite"     },
  champion:   { iron: 10000, fame: 10000, drinks: 5, badge: "champion"  },
  beltHolder: { iron: 15000, fame: 15000, drinks: 7, badge: "belt"      },
};

export const TWISTS = {
  iron_circuit:   { name: "Iron Circuit",    effect: "Standard rules. All win methods score equally. A clean baseline season." },
  blood_sport:    { name: "Blood Sport",     effect: "KO and submission wins give +25% bonus DP." },
  the_contenders: { name: "The Contenders",  effect: "Win streak multipliers activate after 3 consecutive wins." },
  ground_war:     { name: "Ground War",      effect: "Submission wins give +30% bonus DP." },
  iron_fist:      { name: "Iron Fist",       effect: "KO wins give +30% bonus DP." },
  the_marathon:   { name: "The Marathon",    effect: "Decision wins give +20% bonus DP." },
};

// DISPLAY-ONLY mirror of consts/pvpConfig.GAMEPLAN_WEIGHTS (balance-tuned). Authoritative
// values live on the backend; this is only for the pre-fight card blurbs.
export const GAMEPLAN_WEIGHTS = {
  striking:   { str: 1.07, spd: 1.05, leg: 1.04, chn: 0.93 },
  wrestling:  { wre: 1.20, gnd: 1.12, chn: 0.96 },
  submission: { sub: 1.24, gnd: 1.13, chn: 0.98 },
  counter:    { wre: 1.05, sub: 1.05, str: 0.92, spd: 0.92 },
  balanced:   {},
};

export const GAMEPLAN_META = {
  striking: {
    label: "Striking",
    desc: "Bang on the feet — STR + SPD + LEG up, chin down.",
    tag: "Pressure",
    colorKey: "acc",
  },
  wrestling: {
    label: "Wrestling",
    desc: "Put it on the mat — WRE + GND up, shoots takedowns often; chin down.",
    tag: "Takedowns",
    colorKey: "blue",
  },
  submission: {
    label: "Submission",
    desc: "Hunt the finish — SUB + GND up, chases subs; slight chin down.",
    tag: "Finisher",
    colorKey: "purp",
  },
  counter: {
    label: "Counter",
    desc: "Make them miss — takes less strike damage + grappling D up; power + speed down.",
    tag: "Defensive",
    colorKey: "grn",
  },
  balanced: {
    label: "Balanced",
    desc: "No bias — every stat counts equally.",
    tag: "Neutral",
    colorKey: "blue",
  },
};

/** Tolerant resolver — handles legacy "aggressive" and unknown keys. */
export function gameplanLabel(key) {
  if (key === "aggressive") return "Striking";
  return GAMEPLAN_META[key]?.label ?? (key ? key[0].toUpperCase() + key.slice(1) : "—");
}

export const SOFT_RESET = {
  prospect: "prospect",
  contender: "prospect",
  challenger: "contender",
  elite: "challenger",
  champion: "contender",
};

export const SEASON_LENGTH_DAYS = 70;

/**
 * Map CAPITALIZED real weight-class names (as returned by the API in
 * `realWeightClass`) to their short display abbreviations.
 * Deliberately NOT reusing the WEIGHT_CLASSES_PVP lowercase array.
 */
export function wcAbbrev(realWeightClass) {
  const map = {
    Featherweight: "FW",
    Lightweight: "LW",
    Middleweight: "MW",
    Heavyweight: "HW",
    // lowercase variants as a fallback in case the API sends them
    featherweight: "FW",
    lightweight: "LW",
    middleweight: "MW",
    heavyweight: "HW",
  };
  return map[realWeightClass] ?? realWeightClass ?? "";
}

/**
 * Returns the CSS color for a given `lastActiveAt` ISO date string.
 * today (UTC same day) → #4ADE80
 * 1–3 days ago         → #AAAAAA
 * 4–7 days ago         → #555
 * 8+ days or null      → #333
 */
export function lastActiveColor(date) {
  if (!date) return "#333";
  const now = new Date();
  const d = new Date(date);
  // UTC-day difference
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((nowDay - dDay) / 86400000);
  if (days === 0) return "#4ADE80";
  if (days <= 3) return "#AAAAAA";
  if (days <= 7) return "#555";
  return "#333";
}

/**
 * Returns a human-readable relative time string for a `lastActiveAt` date.
 * null → "—"
 * today (UTC same day) → "Today"
 * 1d ago → "Yesterday"
 * Nd ago → "Nd ago"
 */
export function relativeTime(date) {
  if (!date) return "—";
  const now = new Date();
  const d = new Date(date);
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((nowDay - dDay) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
export const WEIGHT_CLASSES_PVP = ["featherweight", "lightweight", "middleweight", "heavyweight"];

/** Label used wherever an Open (cross-weight-class) season's identity is shown. */
export const OPEN_LABEL = "Open · All Weight Classes";

/**
 * Returns the display label for a season's weight-class identity.
 * Uses the backend-provided weightClassLabel when present; falls back to
 * OPEN_LABEL when crossWeightClass is true; otherwise returns weightClass.
 */
export function seasonWeightClassLabel(season) {
  return season?.weightClassLabel
    || (season?.crossWeightClass ? OPEN_LABEL : season?.weightClass);
}

/**
 * tierTrackSegments(dp, divisionKey) — DISPLAY ONLY
 *
 * Returns an array of 5 segment descriptors for the multi-tier progress track
 * in PositionCard. Each segment reflects one division in order.
 *
 * Signature:
 *   tierTrackSegments(dp: number, divisionKey: string) =>
 *     Array<{
 *       key:        string,   // division key
 *       label:      string,   // display label
 *       color:      string,   // hex color
 *       weight:     number,   // flex weight (DP range; champion uses nominal 2000)
 *       state:      'done' | 'current' | 'future',
 *       fillFrac:   number,   // 0..1 fill fraction (only meaningful when state==='current')
 *     }>
 *
 * Guards:
 *   - Champion tier: promoteAt is null → uses nominal weight of 2000 DP
 *   - No divide-by-zero: if range is 0, fillFrac stays 0
 *   - fillFrac clamped to 0..1
 */
export function tierTrackSegments(dp, divisionKey) {
  const CHAMPION_NOMINAL = 2000;

  return DIVISIONS.map((div) => {
    const floor = div.floor ?? 0;
    const promoteAt = div.promoteAt;
    const range = promoteAt != null ? promoteAt - floor : CHAMPION_NOMINAL;
    const weight = range > 0 ? range : CHAMPION_NOMINAL;

    let state;
    let fillFrac = 0;

    const divIndex = DIVISIONS.findIndex((d) => d.key === divisionKey);
    const segIndex = DIVISIONS.findIndex((d) => d.key === div.key);

    if (divIndex < 0) {
      // Unknown division — treat everything as future
      state = "future";
    } else if (segIndex < divIndex) {
      state = "done";
      fillFrac = 1;
    } else if (segIndex === divIndex) {
      state = "current";
      if (range > 0) {
        fillFrac = Math.min(1, Math.max(0, (dp - floor) / range));
      }
    } else {
      state = "future";
    }

    return {
      key: div.key,
      label: div.label,
      color: div.color,
      weight,
      state,
      fillFrac,
    };
  });
}
