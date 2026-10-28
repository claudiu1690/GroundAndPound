/**
 * Out-of-energy offer: pure view-model helpers (no React, no network).
 *
 * The offer opens when an in-scope action fails for lack of energy, either because the client
 * already knows (button pre-check) or because the server refused with one of the codes below.
 * Server `need` / `have` win over the client's guess when both are present.
 */

/** The four server codes that mean "not enough energy" for an in-scope action. */
export const ENERGY_SHORTFALL_CODES = [
  "insufficient_energy",        // POST /pvp/fight (402)
  "FIGHT_NOT_ENOUGH_ENERGY",    // accept a fight offer (400)
  "not_enough_energy",          // My Camp drill batch, zero funded (400)
  "CAMP_NOT_ENOUGH_ENERGY",     // Fight Camp session (400)
];

/** True when an API error is an energy shortfall: a known code, or HTTP 402. */
export function isEnergyShortfall(err) {
  if (!err) return false;
  return ENERGY_SHORTFALL_CODES.includes(err.code) || err.status === 402;
}

/**
 * { need, have } for an error. Prefers the integers the server put on the body; if either is
 * missing or not an integer, the whole fallback is used (the server includes both or neither).
 */
export function shortfallFromError(err, fallback = {}) {
  const body = err?.body;
  if (body && Number.isInteger(body.need) && Number.isInteger(body.have)) {
    return { need: body.need, have: body.have };
  }
  return { need: fallback.need, have: fallback.have };
}

/** Minutes of regen until the action is affordable (1 energy per minute). Never negative. */
export function waitMinutes(need, have) {
  const n = Math.ceil(Number(need) - Number(have));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Energy Shot row: "use" (owned), "buy_use" (affordable), or "no_cash". */
export function shotRow({ owned, cash, price }) {
  if ((owned || 0) >= 1) return "use";
  if (Number.isFinite(price) && (cash || 0) >= price) return "buy_use";
  return "no_cash";
}

/** Energy Drink row: "use" when one is owned, otherwise "none" (free-earn hint + bundles). */
export function drinkRow({ owned }) {
  return (owned || 0) >= 1 ? "use" : "none";
}

/** Locale key for the noun in "This {action} needs N energy". */
export function actionNounKey(source) {
  switch (source) {
    case "pvp": return "shop.offer.action.attack";
    case "camp": return "shop.offer.action.drill";
    case "fightcamp": return "shop.offer.action.session";
    case "fight":
    default: return "shop.offer.action.fight";
  }
}

/** Beacon-safe copy of a shortfall (need 1..100, have 0..100, integers), or null to skip the event. */
export function beaconShortfall(need, have) {
  const n = Math.round(Number(need));
  const h = Math.round(Number(have));
  if (!Number.isFinite(n) || !Number.isFinite(h)) return null;
  return {
    need: Math.min(100, Math.max(1, n)),
    have: Math.min(100, Math.max(0, h)),
  };
}

/** Display-safe whole number >= 0 (title copy never shows NaN). */
export function wholeEnergy(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// The use/buy endpoints refuse with plain messages (no codes), so these two match the text.

/** "Energy already full": the use endpoint refused before touching inventory. */
export function isEnergyFullError(err) {
  return /already full/i.test(err?.message || "");
}

/** "Not enough cash": the server's price check failed (cash dropped since the row rendered). */
export function isNotEnoughCashError(err) {
  return /not enough cash/i.test(err?.message || "");
}
