/**
 * Shop / Supplements — shared view-model helpers.
 *
 * The backend is the source of truth for catalog data (prices, effects,
 * ownership). These helpers only translate raw stat keys into the colour
 * slugs + display labels used by the App.css `.shop-bt-*` tag classes.
 * No business logic lives here — purely presentational mapping.
 */

// Stat key → colour slug. Mirrors the mock's bt.* classes, implemented in
// App.css against project tokens (str=red, spd=blue, gnd=purple, sub=teal,
// leg=green, wre=gold, chn=light blue, fiq=violet).
export const STAT_TAG_SLUG = {
  str: "str",
  spd: "spd",
  gnd: "gnd",
  sub: "sub",
  leg: "leg",
  wre: "wre",
  chn: "chn",
  fiq: "fiq",
};

/** Human label for a stat key (uppercased 3-letter code). */
export function statLabel(key) {
  return String(key || "").toUpperCase();
}

/**
 * Display a booster percentage as a whole number string ("20").
 * Tolerates either a fraction (0.20, the backend form) or an already-whole
 * number (20), so display never shows "0.2%".
 */
export function pctLabel(pct) {
  if (pct == null) return "";
  const n = pct <= 1 ? pct * 100 : pct;
  return String(Math.round(n));
}

/**
 * Static booster display info, keyed by catalog id (name + pct fraction).
 * The persisted `fighter.activeBooster` only stores id/sessionsLeft/totalSessions,
 * so components without catalog access (the sidebar) resolve name/pct from here.
 */
export const BOOSTER_DISPLAY = {
  "focus-amino": { name: "Focus Amino", pct: 0.2 },
  "strength-formula": { name: "Strength Formula", pct: 0.25 },
  "ground-protocol": { name: "Ground Protocol", pct: 0.25 },
  "strike-blend": { name: "Strike Blend", pct: 0.25 },
  "leg-press-formula": { name: "Leg Press Formula", pct: 0.25 },
  "iq-boost": { name: "IQ Boost", pct: 0.25 },
  "full-camp-stack": { name: "Full Camp Stack", pct: 0.2 },
};

/** Merge a raw activeBooster ({id,sessionsLeft,...}) with static display info. */
export function resolveBoosterDisplay(booster) {
  if (!booster) return null;
  const info = BOOSTER_DISPLAY[booster.id] || {};
  return {
    ...booster,
    name: booster.name || info.name || "XP Booster",
    pct: booster.pct != null ? booster.pct : info.pct,
  };
}

/**
 * Static pre-fight buff display info, keyed by catalog id (name + effect).
 * Mirrors BOOSTER_DISPLAY so components without catalog access (e.g. the camp
 * summary, which only knows the selected buff id) can resolve stat tags.
 */
export const BUFF_DISPLAY = {
  "whey-protein-shake": { name: "Whey Protein Shake", stats: { str: 3 } },
  "creatine-stack": { name: "Creatine Stack", stats: { str: 3, wre: 2 } },
  "focus-stack": { name: "Focus Stack", stats: { fiq: 3, chn: 2 } },
  "pre-workout": { name: "Pre-Workout", stats: { spd: 3, str: 2 } },
  "leg-day-formula": { name: "Leg Day Formula", stats: { leg: 3 } },
  "grappling-rub": { name: "Grappling Rub", stats: { gnd: 3, sub: 2 } },
  "collagen-recovery": { name: "Collagen Recovery", injuryMult: 0.8 },
};

/**
 * Build stat-tag descriptors for a pre-fight buff card.
 * buff.stats is an object { str: 3, wre: 2 }; collagen-style buffs carry
 * injuryMult instead (e.g. 0.8 = injury −20%).
 * Returns [{ slug, text }].
 */
export function buffStatTags(buff) {
  if (!buff) return [];
  if (buff.injuryMult != null) {
    const pct = Math.round((1 - buff.injuryMult) * 100);
    return [{ slug: "def", text: `Injury −${pct}%` }];
  }
  const stats = buff.stats || {};
  return Object.entries(stats).map(([k, v]) => ({
    slug: STAT_TAG_SLUG[k] ?? "xp",
    text: `${statLabel(k)} +${v}`,
  }));
}

/**
 * Build stat-tag descriptors for an XP booster card.
 * booster.stats is "ALL" or an array of stat keys.
 * Returns [{ slug, text }].
 */
export function boosterStatTags(booster) {
  if (!booster) return [];
  if (booster.stats === "ALL" || booster.stats == null) {
    return [{ slug: "xp", text: "All Stats" }];
  }
  const list = Array.isArray(booster.stats) ? booster.stats : [];
  return list.map((k) => ({
    slug: STAT_TAG_SLUG[k] ?? "xp",
    text: statLabel(k),
  }));
}

/** Effect summary line for a booster (e.g. "XP on STR · WRE"). */
export function boosterEffectLine(booster) {
  if (!booster) return "";
  if (booster.stats === "ALL" || booster.stats == null) return "XP on all stats";
  const list = Array.isArray(booster.stats) ? booster.stats : [];
  return `XP on ${list.map(statLabel).join(" · ")}`;
}

/** Total item count across an inventory object (for the tab badge). */
export function inventoryCount(inv) {
  if (!inv) return 0;
  let n = (inv.energyShots || 0) + (inv.energyDrinks || 0);
  const buffs = inv.prefightBuffs || {};
  for (const k of Object.keys(buffs)) n += buffs[k] || 0;
  return n;
}

/** True if the fighter owns at least one of anything (sidebar gate). */
export function ownsAnything(fighter) {
  if (!fighter) return false;
  const inv = fighter.inventory || {};
  if ((inv.energyShots || 0) > 0) return true;
  if ((inv.energyDrinks || 0) > 0) return true;
  if (fighter.activeBooster) return true;
  const buffs = inv.prefightBuffs || {};
  return Object.keys(buffs).some((k) => (buffs[k] || 0) > 0);
}

/** Count of unused pre-fight buffs the fighter owns. */
export function unusedBuffCount(fighter) {
  const buffs = fighter?.inventory?.prefightBuffs || {};
  return Object.keys(buffs).reduce((n, k) => n + (buffs[k] || 0), 0);
}
