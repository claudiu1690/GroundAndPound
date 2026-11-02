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
  "focus-amino": { name: "Focus Amino", pct: 0.2, stats: "ALL" },
  "strength-formula": { name: "Strength Formula", pct: 0.25, stats: ["str", "wre"] },
  "ground-protocol": { name: "Ground Protocol", pct: 0.25, stats: ["gnd", "sub"] },
  "strike-blend": { name: "Strike Blend", pct: 0.25, stats: ["str", "spd", "chn"] },
  "leg-press-formula": { name: "Leg Press Formula", pct: 0.25, stats: ["leg"] },
  "iq-boost": { name: "IQ Boost", pct: 0.25, stats: ["fiq", "chn"] },
  "full-camp-stack": { name: "Full Camp Stack", pct: 0.2, stats: "ALL" },
};

/** Merge a raw activeBooster ({id,sessionsLeft,...}) with static display info. */
export function resolveBoosterDisplay(booster) {
  if (!booster) return null;
  const info = BOOSTER_DISPLAY[booster.id] || {};
  return {
    ...booster,
    name: booster.name || info.name || "XP Booster",
    pct: booster.pct != null ? booster.pct : info.pct,
    stats: booster.stats != null ? booster.stats : info.stats,
  };
}

/**
 * True if a booster boosts a given stat. `booster.stats` is "ALL" (or null) for
 * all-stat boosters, otherwise a lowercase key array. `stat` may be any case.
 */
export function boosterAffectsStat(booster, stat) {
  if (!booster) return false;
  if (booster.stats === "ALL" || booster.stats == null) return true;
  const list = Array.isArray(booster.stats) ? booster.stats : [];
  return list.includes(String(stat).toLowerCase());
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

// ── Real-money checkout (pure helpers; copy lives in locales/en.json under shop.*) ──

/** Which state the premium store buy buttons are in: "buy" | "guest" | "disabled". */
export function premiumBuyMode({ isGuest, paymentsEnabled }) {
  if (paymentsEnabled === false) return "disabled";
  if (isGuest) return "guest";
  return "buy";
}

/**
 * True when every bundle would take the player past the free-drink soft cap, i.e. the cap
 * warning is relevant whichever bundle they pick. Bought drinks are never clamped.
 */
export function bundlesCrossSoftCap({ owned, bundles, cap }) {
  if (!cap || !bundles?.length) return false;
  const smallest = Math.min(...bundles.map((b) => b.drinks || 0));
  return owned + smallest > cap;
}

/** Locale key for a checkout error code; null falls back to the server message. */
export function checkoutErrorKey(code) {
  switch (code) {
    case "account_required": return "shop.premium.guestNotice";
    case "account_blocked": return "shop.messages.premiumBlocked";
    case "payments_disabled": return "shop.premium.disabled";
    case "rate_limited": return "shop.messages.premiumRateLimited";
    default: return null;
  }
}

/**
 * Banner shown after Stripe sends the player back. `purchaseReturn` is { outcome, sessionId }
 * from the URL; `status` is the usePurchaseStatus result. Returns { key, vars, tone, busy }
 * or null when there is nothing to show.
 */
export function purchaseReturnBanner(purchaseReturn, status) {
  if (!purchaseReturn) return null;
  if (purchaseReturn.outcome === "cancelled") {
    return { key: "shop.return.cancelled", tone: "info" };
  }
  switch (status.phase) {
    case "pending": return { key: "shop.return.pending", tone: "pending", busy: true };
    case "fulfilled": return { key: "shop.return.delivered", vars: { drinks: status.drinks }, tone: "ok" };
    case "failed": return { key: "shop.return.failed", tone: "bad" };
    case "timeout": return { key: "shop.return.stillConfirming", tone: "info" };
    default: return null;
  }
}

// ── Shop redesign: product art, bundle maths, free-earn lines (pure; copy lives in en.json) ──

/** Product ids that have shipped art in public/assets/shop. DOC_TECHNICIAN deliberately has none. */
export const SHOP_ART_IDS = [
  "energy-drink",
  "energy-shot",
  "focus-amino",
  "strength-formula",
  "ground-protocol",
  "strike-blend",
  "leg-press-formula",
  "iq-boost",
  "full-camp-stack",
  "whey-protein-shake",
  "creatine-stack",
  "focus-stack",
  "pre-workout",
  "leg-day-formula",
  "grappling-rub",
  "collagen-recovery",
];

/** Public URL of a product's painted art, or null when the id has none. */
export function shopArtSrc(id) {
  return SHOP_ART_IDS.includes(id) ? `/assets/shop/${id}.webp` : null;
}

/** How many cans to stand in a bundle card: 6 -> 1, 15 -> 2, 40 -> 3, 100 -> 4. */
export function canCount(drinks) {
  const n = Number(drinks) || 0;
  if (n <= 6) return 1;
  if (n <= 15) return 2;
  if (n <= 40) return 3;
  return 4;
}

/**
 * Per-drink price and savings for each bundle, from the server's `amountCents` (display maths
 * only, never sent anywhere). Savings are measured against the smallest bundle, so the smallest
 * itself gets null. Returns [{ id, perDrink (dollars, number) | null, savingsPct | null }] in
 * the same order as `bundles`.
 */
export function bundlePricing(bundles) {
  const list = Array.isArray(bundles) ? bundles : [];
  const per = (b) => (b && b.amountCents > 0 && b.drinks > 0 ? b.amountCents / b.drinks : null);
  let smallest = null;
  for (const b of list) {
    if (b && b.drinks > 0 && (!smallest || b.drinks < smallest.drinks)) smallest = b;
  }
  const basePer = per(smallest);
  return list.map((b) => {
    const p = per(b);
    const savingsPct = p != null && basePer != null && b.id !== smallest.id
      ? Math.round((1 - p / basePer) * 100)
      : null;
    return {
      id: b?.id,
      perDrink: p != null ? Math.round(p) / 100 : null,
      savingsPct: savingsPct != null && savingsPct > 0 ? savingsPct : null,
    };
  });
}

/**
 * Free-earn chips for the full panel, as unresolved { key, vars } descriptors (the component
 * runs them through t()). Max three. Sources with nothing to show are omitted. At the soft cap
 * the whole list collapses to the single cap line. `owned` only matters for that line; when it
 * is not passed the cap itself is used (overCap implies owned >= cap).
 */
export function freeEarnChips(freeEarn, cap, owned) {
  if (!freeEarn) return [];
  if (freeEarn.overCap) {
    return [{ key: "shop.freeEarn.capLine", vars: { owned: owned ?? cap, cap } }];
  }
  const chips = [];
  const { streak, promotion, sponsor } = freeEarn;
  if (streak) {
    chips.push({
      key: "shop.freeEarn.streak",
      vars: { current: streak.current, next: streak.next, drinks: streak.drinks },
    });
  }
  if (promotion) {
    chips.push({
      key: promotion.kind === "gcs_belt" ? "shop.freeEarn.gcsBelt" : "shop.freeEarn.promotion",
    });
  }
  if (sponsor) {
    chips.push(
      sponsor.active
        ? { key: "shop.freeEarn.sponsorActive", vars: { drinks: sponsor.drinks } }
        : { key: "shop.freeEarn.sponsorNone", vars: { min: sponsor.min, max: sponsor.max } }
    );
  }
  return chips.slice(0, 3);
}

/**
 * The single highest-priority free-earn hint (streak, then promotion, then sponsor), as a
 * { key, vars } descriptor, or null. The cap line wins when the player is over the soft cap.
 */
export function freeEarnHint(freeEarn, cap, owned) {
  const chips = freeEarnChips(freeEarn, cap, owned);
  return chips.length ? chips[0] : null;
}

/**
 * Display parts of an XP booster card: { pct, allStats, tags, sessions }. The component joins
 * them with the shop.product.* strings.
 */
export function boosterEffect(booster) {
  if (!booster) return { pct: "", allStats: true, tags: [], sessions: 0 };
  const allStats = booster.stats === "ALL" || booster.stats == null;
  return {
    pct: pctLabel(booster.pct),
    allStats,
    tags: allStats ? [] : boosterStatTags(booster),
    sessions: booster.sessions || 0,
  };
}
