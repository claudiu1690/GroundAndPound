import { STAT_TOOLTIPS } from "../../constants/statTooltips";
import { STAT_ORDER } from "./constants";

/**
 * Badges displayed on the fighter profile. Legacy `activePerks` (old quest perks) are
 * no longer granted but kept for backwards display of legacy accounts.
 */
export function badgesForDisplay(badges, activePerks) {
  const list = [...(badges || [])];
  if (!activePerks?.ironWill || list.includes("Iron Will")) return list;
  const resIdx = list.indexOf("Resilience");
  if (resIdx >= 0) list.splice(resIdx + 1, 0, "Iron Will");
  else list.push("Iron Will");
  return list;
}

/** One row per resource bar in the profile header. */
export function resourceRowsFromFighter(fighter) {
  return [
    {
      key: "energy",
      label: "Energy",
      value: fighter.energy?.current ?? fighter.energy ?? 0,
      max: fighter.energy?.max ?? 100,
      barClass: "resource-bar-energy",
    },
    {
      key: "health",
      label: "Health",
      value: fighter.health ?? 100,
      max: 100,
      barClass: "resource-bar-health",
    },
  ];
}

/**
 * Precomputed rows for the stat / XP grid (only stats present in `statProgress`).
 */
export function statMeterRows(statProgress) {
  const rows = [];
  for (const name of STAT_ORDER) {
    const p = statProgress[name];
    if (!p) continue;
    const { value, xp, xpToNext } = p;
    const isMax = xpToNext == null;
    const xpShown =
      typeof xp === "number" && Number.isFinite(xp) ? Math.round(xp * 100) / 100 : xp;
    const pct =
      isMax ? 100 : xpToNext > 0 ? Math.min(100, (xpShown / xpToNext) * 100) : 0;
    rows.push({
      name,
      value,
      pct,
      xpLine: isMax ? "Fight XP only" : `${xpShown} / ${xpToNext} XP`,
      tooltip: STAT_TOOLTIPS[name] ?? "",
    });
  }
  return rows;
}
