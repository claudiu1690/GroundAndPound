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

export const FIGHT_ENERGY_COST = {
  Amateur:          10,
  "Regional Pro":   15,
  National:         18,
  "GCS Contender":  20,
  GCS:              20,
};

