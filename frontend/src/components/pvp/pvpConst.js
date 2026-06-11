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

export const GAMEPLAN_WEIGHTS = {
  aggressive: { str: 1.3, spd: 1.2, chn: 0.9, fiq: 0.9 },
  balanced:   {},
  counter:    { fiq: 1.3, chn: 1.2, str: 0.9, spd: 0.9 },
};

export const GAMEPLAN_META = {
  aggressive: {
    label: "Aggressive",
    desc: "Push the pace. High-risk, high-reward. STR + SPD weighted.",
    tag: "Finisher bonus",
    colorKey: "acc",
  },
  balanced: {
    label: "Balanced",
    desc: "No bias. All stats count equally. Consistent output.",
    tag: "Neutral",
    colorKey: "blue",
  },
  counter: {
    label: "Counter",
    desc: "Let them make mistakes. FIQ + CHN weighted.",
    tag: "Defensive",
    colorKey: "grn",
  },
};

export const SOFT_RESET = {
  prospect: "prospect",
  contender: "prospect",
  challenger: "contender",
  elite: "challenger",
  champion: "contender",
};

export const SEASON_LENGTH_DAYS = 70;
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
