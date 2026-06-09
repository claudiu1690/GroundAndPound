const Fighter = require("../models/fighterModel");
const fighterService = require("./fighterService");
const energyService = require("./energyService");
const {
    SOFT_CAP,
    ENERGY_ITEMS,
    BOOSTERS,
    BUFFS,
    PREMIUM_BUNDLES,
    findItem,
} = require("../consts/shopConfig");

/**
 * Ensure the inventory subdocument exists in memory (defensive — backfill covers
 * the DB, but a freshly minted in-memory object or a partial legacy doc may not
 * have the nested maps).
 */
function ensureInventoryShape(fighter) {
    if (!fighter.inventory) fighter.inventory = {};
    const inv = fighter.inventory;
    if (typeof inv.energyShots !== "number") inv.energyShots = 0;
    if (typeof inv.energyDrinks !== "number") inv.energyDrinks = 0;
    if (!inv.prefightBuffs || typeof inv.prefightBuffs !== "object") inv.prefightBuffs = {};
    if (!inv.usedBuffs || typeof inv.usedBuffs !== "object") inv.usedBuffs = {};
}

/**
 * Grant energy drinks to a fighter's inventory, clamped to SOFT_CAP.
 * MUTATES ONLY — never saves. Callers are mid-fight-resolve and persist later.
 * @param {object} fighter   Mongoose fighter doc
 * @param {number} amount    requested number of drinks to grant
 * @returns {number}         the actually-granted count (0 if at/over cap or amount <= 0)
 */
function grantEnergyDrinks(fighter, amount) {
    ensureInventoryShape(fighter);
    const current = fighter.inventory.energyDrinks;
    const granted = Math.max(0, Math.min(Number(amount) || 0, SOFT_CAP - current));
    if (granted > 0) {
        fighter.inventory.energyDrinks = current + granted;
        fighter.markModified("inventory");
    }
    return granted;
}

/**
 * Build the shop catalog for a fighter.
 * @param {string} fighterId
 */
async function getCatalog(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    ensureInventoryShape(fighter);

    const iron = fighter.iron || 0;
    const inv = fighter.inventory;

    // Live energy from Redis (authoritative) for the energyFull flag.
    const { current, max } = await energyService.getEnergy(String(fighterId));
    const energyFull = current >= max;

    const activeBoosterCfg = fighter.activeBooster ? BOOSTERS[fighter.activeBooster.id] : null;
    const activeBooster = fighter.activeBooster
        ? {
              id: fighter.activeBooster.id,
              name: activeBoosterCfg ? activeBoosterCfg.name : "XP Booster",
              pct: activeBoosterCfg ? activeBoosterCfg.pct : null,
              sessionsLeft: fighter.activeBooster.sessionsLeft,
              totalSessions: fighter.activeBooster.totalSessions,
          }
        : null;
    const boosterLocked = activeBooster != null;

    const energyItems = Object.values(ENERGY_ITEMS).map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        energy: it.energy,
        premium: it.premium,
        owned: inv[it.inventoryKey] || 0,
        canAfford: !it.premium && it.price != null && iron >= it.price,
    }));

    const boosters = Object.values(BOOSTERS).map((b) => ({
        id: b.id,
        name: b.name,
        price: b.price,
        pct: b.pct,
        stats: b.stats,
        sessions: b.sessions,
        canAfford: iron >= b.price,
        locked: boosterLocked,
    }));

    const buffs = Object.values(BUFFS).map((b) => {
        const row = {
            id: b.id,
            name: b.name,
            price: b.price,
            owned: (inv.prefightBuffs && inv.prefightBuffs[b.id]) || 0,
            used: (inv.usedBuffs && inv.usedBuffs[b.id]) || 0,
            canAfford: iron >= b.price,
        };
        if (b.stats) row.stats = b.stats;
        if (b.injuryMult != null) row.injuryMult = b.injuryMult;
        return row;
    });

    const premiumBundles = Object.values(PREMIUM_BUNDLES).map((pb) => {
        const row = {
            id: pb.id,
            name: pb.name,
            priceLabel: pb.priceLabel,
            drinks: pb.drinks,
            stub: true,
        };
        if (pb.popular) row.popular = true;
        return row;
    });

    return {
        iron,
        activeBooster,
        energyFull,
        energyItems,
        boosters,
        buffs,
        premiumBundles,
    };
}

/**
 * Purchase a cash item (energy shot, booster, or buff).
 * Premium items are rejected — they only come from the buy-premium stub.
 * @param {string} fighterId
 * @param {string} itemId
 * @param {number} [quantity=1]
 */
async function buyItem(fighterId, itemId, quantity = 1) {
    const item = findItem(itemId);
    if (!item) throw new Error("Unknown item");
    if (item.premium) throw new Error("That item must be bought with premium");

    // Boosters always buy exactly one charge-pack; everything else accepts 1-99.
    let qty;
    if (item.type === "booster") {
        qty = 1;
    } else {
        qty = quantity === undefined || quantity === null ? 1 : quantity;
        if (!Number.isInteger(qty) || qty < 1 || qty > SOFT_CAP) {
            throw new Error("Invalid quantity");
        }
    }

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    ensureInventoryShape(fighter);

    const price = item.price;

    if (item.type === "energy") {
        const owned = fighter.inventory[item.inventoryKey] || 0;
        if (owned + qty > SOFT_CAP) throw new Error("You already own the maximum of this item");
        // Locked cash-deduct pattern.
        if ((fighter.iron || 0) < price * qty) throw new Error("Not enough cash");
        fighter.iron -= price * qty;
        fighter.inventory[item.inventoryKey] = owned + qty;
        fighter.markModified("inventory");
    } else if (item.type === "booster") {
        if (fighter.activeBooster != null) throw new Error("Booster already active");
        if ((fighter.iron || 0) < price) throw new Error("Not enough cash");
        fighter.iron -= price;
        fighter.activeBooster = {
            id: item.id,
            sessionsLeft: item.sessions,
            totalSessions: item.sessions,
        };
    } else {
        // buff
        const owned = (fighter.inventory.prefightBuffs && fighter.inventory.prefightBuffs[item.id]) || 0;
        if (owned + qty > SOFT_CAP) throw new Error("You already own the maximum of this item");
        if ((fighter.iron || 0) < price * qty) throw new Error("Not enough cash");
        fighter.iron -= price * qty;
        fighter.inventory.prefightBuffs[item.id] = owned + qty;
        fighter.markModified("inventory");
    }

    await fighter.save();

    return {
        fighter: fighterService.toPublicFighter(fighter),
        message: `Purchased ${item.name}${qty > 1 ? ` ×${qty}` : ""}.`,
        item: { id: item.id, category: item.category, quantityBought: qty },
    };
}

/**
 * Premium purchase stub — grants nothing, performs ZERO writes.
 * @param {string} bundleId
 */
async function buyPremium(bundleId) {
    if (!bundleId || !PREMIUM_BUNDLES[bundleId]) throw new Error("Unknown bundle");
    return {
        stub: true,
        message: "Premium purchases are coming soon. Nothing was charged or granted.",
    };
}

/**
 * Consume an owned energy item to restore energy.
 * Reads LIVE energy first and rejects "Energy already full" BEFORE any inventory
 * decrement, so a full-energy attempt never wastes an item.
 * @param {string} fighterId
 * @param {string} itemId  one of "energy-shot" | "energy-drink"
 */
async function useEnergyItem(fighterId, itemId) {
    const cfg = ENERGY_ITEMS[itemId];
    if (!cfg) throw new Error("Unknown item");

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    ensureInventoryShape(fighter);

    // Live energy gate FIRST — never decrement inventory on a full bar.
    const before = await energyService.getEnergy(String(fighterId));
    if (before.current >= before.max) throw new Error("Energy already full");

    const owned = fighter.inventory[cfg.inventoryKey] || 0;
    if (owned <= 0) throw new Error("You don't own any of that item");

    fighter.inventory[cfg.inventoryKey] = owned - 1;
    fighter.markModified("inventory");
    await fighter.save();

    // addEnergy already caps at max.
    const after = await energyService.addEnergy(String(fighterId), cfg.energy);
    const restored = Math.max(0, after.current - before.current);

    // Keep the in-memory snapshot consistent for the serialized fighter payload.
    fighter.energy = {
        ...(fighter.energy && typeof fighter.energy === "object" ? fighter.energy : {}),
        current: after.current,
        max: after.max,
        lastSyncedAt: new Date(),
    };

    return {
        fighter: fighterService.toPublicFighter(fighter),
        energy: { current: after.current, max: after.max },
        restored,
        message: `Used ${cfg.name}. Energy +${restored}.`,
    };
}

module.exports = {
    getCatalog,
    buyItem,
    buyPremium,
    useEnergyItem,
    grantEnergyDrinks,
    ensureInventoryShape,
};
