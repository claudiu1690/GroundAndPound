/**
 * Shop, Inventory & Pre-Fight Supplements — single source of truth.
 *
 * Currency field on the fighter is `iron` (labelled "Cash" in the UI).
 * Premium items are STUBBED — they grant nothing and are only purchasable via
 * the buy-premium stub endpoint, which performs zero writes.
 *
 * Three product families:
 *  - ENERGY_ITEMS : consumable energy restores (Energy Shot = cash, Energy Drink = premium)
 *  - BOOSTERS     : persistent training multipliers, consumed per completed session
 *  - BUFFS        : one-shot pre-fight supplements, consumed once at fight resolve
 */

// Canonical stat list used to resolve a booster whose stats === "ALL".
const ALL_STATS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

// Inventory / buff soft cap — players may not own more than this of a stackable item.
const SOFT_CAP = 99;

const ENERGY_ITEMS = {
    "energy-shot": {
        id: "energy-shot",
        name: "Energy Shot",
        category: "energy",
        price: 600,
        energy: 30,
        premium: false,
        inventoryKey: "energyShots",
    },
    "energy-drink": {
        id: "energy-drink",
        name: "Energy Drink",
        category: "energy",
        price: null,
        energy: 50,
        premium: true,
        inventoryKey: "energyDrinks",
    },
};

const BOOSTERS = {
    "focus-amino":       { id: "focus-amino",       name: "Focus Amino",       category: "booster", price: 850,  pct: 0.20, stats: "ALL",                  sessions: 3 },
    "strength-formula":  { id: "strength-formula",  name: "Strength Formula",  category: "booster", price: 750,  pct: 0.25, stats: ["str", "wre"],         sessions: 3 },
    "ground-protocol":   { id: "ground-protocol",   name: "Ground Protocol",   category: "booster", price: 750,  pct: 0.25, stats: ["gnd", "sub"],         sessions: 3 },
    "strike-blend":      { id: "strike-blend",      name: "Strike Blend",      category: "booster", price: 750,  pct: 0.25, stats: ["str", "spd", "chn"],  sessions: 3 },
    "leg-press-formula": { id: "leg-press-formula", name: "Leg Press Formula", category: "booster", price: 500,  pct: 0.25, stats: ["leg"],               sessions: 3 },
    "iq-boost":          { id: "iq-boost",          name: "IQ Boost",          category: "booster", price: 750,  pct: 0.25, stats: ["fiq", "chn"],         sessions: 3 },
    "full-camp-stack":   { id: "full-camp-stack",   name: "Full Camp Stack",   category: "booster", price: 1900, pct: 0.20, stats: "ALL",                  sessions: 8 },
    // Granted (not purchasable) by the Media Hub Documentary "Technician" focus.
    "DOC_TECHNICIAN":    { id: "DOC_TECHNICIAN",    name: "Documentary Focus",  category: "booster", price: null, pct: 0.05, stats: "ALL",                  sessions: 10 },
};

const BUFFS = {
    "whey-protein-shake": { id: "whey-protein-shake", name: "Whey Protein Shake", category: "buff", price: 650, stats: { str: 3 } },
    "creatine-stack":     { id: "creatine-stack",     name: "Creatine Stack",     category: "buff", price: 1150, stats: { str: 3, wre: 2 } },
    "focus-stack":        { id: "focus-stack",        name: "Focus Stack",        category: "buff", price: 1100, stats: { fiq: 3, chn: 2 } },
    "pre-workout":        { id: "pre-workout",        name: "Pre-Workout",        category: "buff", price: 1050, stats: { spd: 3, str: 2 } },
    "leg-day-formula":    { id: "leg-day-formula",    name: "Leg Day Formula",    category: "buff", price: 600, stats: { leg: 3 } },
    "grappling-rub":      { id: "grappling-rub",      name: "Grappling Rub",      category: "buff", price: 1100, stats: { gnd: 3, sub: 2 } },
    "collagen-recovery":  { id: "collagen-recovery",  name: "Collagen Recovery",  category: "buff", price: 1000, injuryMult: 0.80 },
};

/**
 * Real-money bundles.
 *
 * ⚠️ `amountCents` IS THE ONLY PRICE THE SERVER WILL EVER CHARGE. It is an explicit integer in
 * the smallest currency unit, never parsed from `priceLabel` and never accepted from the client:
 * a request carries a bundle id and nothing else, and the amount is looked up here. A checkout
 * that trusted a client-supplied amount would let anyone buy 100 drinks for one cent.
 *
 * `priceLabel` is display text only. Keep the two in step by hand; the boot validator below
 * asserts they agree so a typo in either cannot ship.
 */
const PREMIUM_CURRENCY = "usd";
const PREMIUM_BUNDLES = {
    "drinks-6":   { id: "drinks-6",   name: "6 Energy Drinks",   priceLabel: "$4.99",  amountCents: 499,  drinks: 6 },
    "drinks-15":  { id: "drinks-15",  name: "15 Energy Drinks",  priceLabel: "$9.99",  amountCents: 999,  drinks: 15, popular: true },
    "drinks-40":  { id: "drinks-40",  name: "40 Energy Drinks",  priceLabel: "$19.99", amountCents: 1999, drinks: 40 },
    "drinks-100": { id: "drinks-100", name: "100 Energy Drinks", priceLabel: "$39.99", amountCents: 3999, drinks: 100 },
};

// Fail at boot, not at checkout: a label/amount mismatch is a mispriced product, and the first
// person to notice would otherwise be a customer who was charged the wrong amount.
for (const b of Object.values(PREMIUM_BUNDLES)) {
    const fromLabel = Math.round(parseFloat(String(b.priceLabel).replace(/[^0-9.]/g, "")) * 100);
    if (!Number.isInteger(b.amountCents) || b.amountCents <= 0) {
        throw new Error(`[shopConfig] ${b.id}: amountCents must be a positive integer`);
    }
    if (fromLabel !== b.amountCents) {
        throw new Error(`[shopConfig] ${b.id}: priceLabel ${b.priceLabel} disagrees with amountCents ${b.amountCents}`);
    }
    if (!Number.isInteger(b.drinks) || b.drinks <= 0) {
        throw new Error(`[shopConfig] ${b.id}: drinks must be a positive integer`);
    }
}

/**
 * Find any shop item across all families by id.
 * @param {string} id
 * @returns {(object & { type: "energy"|"booster"|"buff" })|null}
 */
function findItem(id) {
    if (!id || typeof id !== "string") return null;
    if (ENERGY_ITEMS[id]) return { ...ENERGY_ITEMS[id], type: "energy" };
    if (BOOSTERS[id])     return { ...BOOSTERS[id],     type: "booster" };
    if (BUFFS[id])        return { ...BUFFS[id],        type: "buff" };
    return null;
}

/**
 * Resolve the concrete stat-key list a booster affects.
 * @param {object} boosterCfg
 * @returns {string[]}
 */
function boosterStatList(boosterCfg) {
    if (!boosterCfg) return [];
    return boosterCfg.stats === "ALL" ? [...ALL_STATS] : [...boosterCfg.stats];
}

module.exports = {
    ALL_STATS,
    SOFT_CAP,
    ENERGY_ITEMS,
    BOOSTERS,
    BUFFS,
    PREMIUM_BUNDLES,
    PREMIUM_CURRENCY,
    findItem,
    boosterStatList,
};
