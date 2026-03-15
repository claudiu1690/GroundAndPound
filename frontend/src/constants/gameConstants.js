/** Mirror of backend game constants for forms (create fighter, etc.) */
export const WEIGHT_CLASSES = [
  "Bantamweight",
  "Featherweight",
  "Lightweight",
  "Welterweight",
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

/** GDD 8.2: Recommended TCAs per tier (penalty if below). */
export const RECOMMENDED_TCA = {
  Amateur: 2,
  "Regional Pro": 3,
  National: 5,
  "GCS Contender": 8,
  GCS: 10,
};

/** GDD 8.3: Fight strategies. */
export const FIGHT_STRATEGIES = [
  "Pressure Fighter",
  "Counter Striker",
  "Takedown Heavy",
  "Submission Hunter",
  "Ground & Pound",
  "Leg Kick Attrition",
  "Clinch Bully",
  "Survival Mode",
];
