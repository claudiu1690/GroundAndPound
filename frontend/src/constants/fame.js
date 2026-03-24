/** Tier labels — keys match server peak-tier enums. */
export const FAME_TIER_LABELS = {
  UNKNOWN: "Unknown",
  PROSPECT: "Prospect",
  RISING_STAR: "Rising Star",
  CONTENDER: "Contender",
  STAR: "Star",
  LEGEND: "Legend",
};

export function tierLabel(key) {
  return FAME_TIER_LABELS[key] || key || "—";
}
