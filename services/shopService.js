const Fighter = require("../models/fighterModel");
const Sponsorship = require("../models/sponsorshipModel");
const config = require("../config");
const fighterService = require("./fighterService");
const energyService = require("./energyService");
const analyticsService = require("./analyticsService");
const {
    SOFT_CAP,
    ENERGY_ITEMS,
    BOOSTERS,
    BUFFS,
    PREMIUM_BUNDLES,
    FREE_DRINK_GRANTS,
    findItem,
} = require("../consts/shopConfig");
const { SPONSOR_OFFERS } = require("../consts/sponsorCatalog");

// ── Shop redesign: premium panel state + free-earn progress (GDD §15.4) ─────

/** Streak milestones as ascending numbers (keys of FREE_DRINK_GRANTS.streak). */
const STREAK_MILESTONES = Object.keys(FREE_DRINK_GRANTS.streak)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

/** Catalog range shown when the fighter has no active drink-paying sponsor deal. */
const SPONSOR_DRINK_VALUES = SPONSOR_OFFERS
    .map((o) => Number(o.rewardDrinks) || 0)
    .filter((n) => n > 0);
const SPONSOR_DRINK_RANGE = {
    min: SPONSOR_DRINK_VALUES.length ? Math.min(...SPONSOR_DRINK_VALUES) : 0,
    max: SPONSOR_DRINK_VALUES.length ? Math.max(...SPONSOR_DRINK_VALUES) : 0,
};

/**
 * A1 / A2 decision from the two one-time flags. Pure. Precedence: first visit beats the
 * account-secured reshow (a guest who claims before ever opening the Shop gets first_visit,
 * and the seen call clears both).
 * @param {{ premiumPanelSeen?: boolean, premiumPanelReshowPending?: boolean }|null} fighter
 * @returns {{ mode: "full"|"collapsed", reason: "first_visit"|"account_secured"|null }}
 */
function premiumPanelState(fighter) {
    const f = fighter || {};
    if (!f.premiumPanelSeen) return { mode: "full", reason: "first_visit" };
    if (f.premiumPanelReshowPending) return { mode: "full", reason: "account_secured" };
    return { mode: "collapsed", reason: null };
}

/**
 * The free-earn progress line (spec 2.5). Pure: every input is passed in.
 * @param {object} p
 * @param {number} p.winStreak           career fighter.winStreak
 * @param {string} p.promotionTier
 * @param {number} p.gcsTitleWins
 * @param {number} p.energyDrinks        inventory.energyDrinks
 * @param {number[]} p.activeRewardDrinks rewardDrinks of the fighter's ACTIVE sponsorships
 */
function buildFreeEarn({ winStreak, promotionTier, gcsTitleWins, energyDrinks, activeRewardDrinks } = {}) {
    // Lazy: fightService lazy-requires this module, so a top-level require would be circular.
    const { TOP_TIER } = require("./fightService");

    const current = Math.max(0, Math.floor(Number(winStreak) || 0));
    const next = STREAK_MILESTONES.find((m) => m > current);
    const streak = next === undefined
        ? null
        : { current, next, drinks: FREE_DRINK_GRANTS.streak[next] };

    let promotion = null;
    if (promotionTier !== TOP_TIER) {
        promotion = { drinks: FREE_DRINK_GRANTS.promotion, kind: "promotion" };
    } else if ((Number(gcsTitleWins) || 0) === 0) {
        promotion = { drinks: FREE_DRINK_GRANTS.promotion, kind: "gcs_belt" };
    }

    const sum = (Array.isArray(activeRewardDrinks) ? activeRewardDrinks : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
        .reduce((a, b) => a + b, 0);
    const sponsor = sum > 0
        ? { active: true, drinks: sum }
        : { active: false, min: SPONSOR_DRINK_RANGE.min, max: SPONSOR_DRINK_RANGE.max };

    const overCap = (Number(energyDrinks) || 0) >= SOFT_CAP;

    return { streak, promotion, sponsor, overCap };
}

/**
 * Mark the full premium panel as shown (POST /fighters/:id/shop/premium-seen). Idempotent.
 * ONE atomic write that clears both flags; the pre-image decides whether this call was the
 * one that acknowledged a full panel (and therefore tracks premium_panel_shown).
 * @param {string} fighterId
 * @param {string} userId   req.user.id, for analytics
 * @returns {Promise<{ acknowledged: boolean }>}
 */
async function markPremiumPanelSeen(fighterId, userId) {
    const before = await Fighter.findOneAndUpdate(
        { _id: fighterId },
        { $set: { premiumPanelSeen: true, premiumPanelReshowPending: false } },
        { new: false, projection: "premiumPanelSeen premiumPanelReshowPending" }
    );
    if (!before) throw new Error("Fighter not found");

    const { reason } = premiumPanelState(before);
    const acknowledged = reason !== null;
    if (acknowledged) {
        // Fire-and-forget: track never rejects and never blocks the response.
        analyticsService.track(userId, "premium_panel_shown", { reason }, { fighterId });
    }
    return { acknowledged };
}

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

    // Granted-only boosters (price null, e.g. DOC_TECHNICIAN) never render in the Shop.
    const boosters = Object.values(BOOSTERS).filter((b) => b.price != null).map((b) => ({
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
            // Display math only (per-drink price, savings). Checkout never takes an amount
            // from the client; the server looks the bundle up by id.
            amountCents: pb.amountCents,
        };
        if (pb.popular) row.popular = true;
        return row;
    });

    // Read-only: the panel mode and the free-earn line are derived, never written here.
    // The sponsor chip is cosmetic: a failed lookup falls back to the catalog range rather
    // than failing the whole catalog (Cash purchases and the energy offer read it too).
    let activeSponsorships = [];
    try {
        activeSponsorships = await Sponsorship.find({ fighterId: fighter._id, status: "active" })
            .select("rewardDrinks")
            .lean();
    } catch (err) {
        console.error("[shopService.getCatalog] sponsorship lookup failed:", err.message);
    }
    const freeEarn = buildFreeEarn({
        winStreak: fighter.winStreak,
        promotionTier: fighter.promotionTier,
        gcsTitleWins: fighter.gcsTitleWins,
        energyDrinks: inv.energyDrinks,
        activeRewardDrinks: (activeSponsorships || []).map((s) => s && s.rewardDrinks),
    });

    return {
        iron,
        activeBooster,
        energyFull,
        energyItems,
        boosters,
        buffs,
        premiumBundles,
        // false when STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are unset: the client disables
        // the Buy buttons instead of letting a checkout bounce off a 503.
        paymentsEnabled: config.stripe.enabled,
        // Free drink grants stop at this count; paid drinks always land (see paymentService.fulfil).
        drinkSoftCap: SOFT_CAP,
        premiumPanel: premiumPanelState(fighter),
        freeEarn,
    };
}

/**
 * Purchase a cash item (energy shot, booster, or buff).
 * Premium items are rejected: Energy Drinks are only sold for real money through
 * paymentService (Stripe Checkout), never for in-game cash.
 * @param {string} fighterId
 * @param {string} itemId
 * @param {number} [quantity=1]
 */
async function buyItem(fighterId, itemId, quantity = 1) {
    const item = findItem(itemId);
    if (!item) throw new Error("Unknown item");
    if (item.premium) throw new Error("That item must be bought with premium");
    // Granted-only items (price null, e.g. the Documentary's DOC_TECHNICIAN booster) are not
    // for sale. Without this, `iron < null` is false and `iron -= null` subtracts 0, so the
    // item was free to anyone who sent its id.
    if (!Number.isInteger(item.price) || item.price <= 0) throw new Error("That item is not for sale");

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
    useEnergyItem,
    grantEnergyDrinks,
    ensureInventoryShape,
    premiumPanelState,
    buildFreeEarn,
    markPremiumPanelSeen,
};
