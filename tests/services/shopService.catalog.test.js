/**
 * Shop redesign: GET /fighters/:id/shop/catalog additions.
 *
 * getCatalog stays READ-ONLY (premiumPanel and freeEarn are derived, never written), drops
 * granted-only boosters (DOC_TECHNICIAN), and ships amountCents for display math. No DB:
 * Fighter, Sponsorship and energyService are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const Sponsorship = require("../../models/sponsorshipModel");
const energyService = require("../../services/energyService");
const shopService = require("../../services/shopService");
const { PREMIUM_BUNDLES, SOFT_CAP } = require("../../consts/shopConfig");
const { TOP_TIER } = require("../../services/fightService");

async function withStubs(stubs, body) {
    const saved = stubs.map(([obj, key]) => [obj, key, Object.prototype.hasOwnProperty.call(obj, key), obj[key]]);
    for (const [obj, key, impl] of stubs) obj[key] = impl;
    try {
        return await body();
    } finally {
        for (const [obj, key, had, orig] of saved) {
            if (had) obj[key] = orig;
            else delete obj[key];
        }
    }
}

const FID = "507f1f77bcf86cd799439011";

function fakeFighter(over = {}) {
    const f = {
        _id: FID,
        iron: 1000,
        winStreak: 7,
        promotionTier: "Regional",
        gcsTitleWins: 0,
        activeBooster: null,
        inventory: { energyShots: 1, energyDrinks: 3, prefightBuffs: {}, usedBuffs: {} },
        premiumPanelSeen: false,
        premiumPanelReshowPending: false,
        writes: 0,
        ...over,
    };
    f.save = async () => { f.writes += 1; };
    f.markModified = () => {};
    return f;
}

async function catalogFor(fighter, sponsorRows = []) {
    const seen = { sponsorFilter: null, sponsorSelect: null, writes: [] };
    const stubs = [
        [Fighter, "findById", async () => fighter],
        [Fighter, "updateOne", async () => { seen.writes.push("updateOne"); }],
        [Fighter, "findOneAndUpdate", async () => { seen.writes.push("findOneAndUpdate"); }],
        [Fighter, "findByIdAndUpdate", async () => { seen.writes.push("findByIdAndUpdate"); }],
        [Sponsorship, "find", (filter) => {
            seen.sponsorFilter = filter;
            return {
                select(sel) { seen.sponsorSelect = sel; return this; },
                lean: async () => sponsorRows,
            };
        }],
        [energyService, "getEnergy", async () => ({ current: 40, max: 100 })],
    ];
    const catalog = await withStubs(stubs, () => shopService.getCatalog(FID));
    return { catalog, seen };
}

test("existing fields are unchanged and the two new blocks are present", async () => {
    const { catalog } = await catalogFor(fakeFighter());
    for (const key of ["iron", "activeBooster", "energyFull", "energyItems", "boosters", "buffs",
        "premiumBundles", "paymentsEnabled", "drinkSoftCap", "premiumPanel", "freeEarn"]) {
        assert.ok(Object.prototype.hasOwnProperty.call(catalog, key), key);
    }
    assert.equal(catalog.iron, 1000);
    assert.equal(catalog.energyFull, false);
    assert.equal(catalog.drinkSoftCap, SOFT_CAP);
});

test("GET never writes the fighter", async () => {
    const fighter = fakeFighter();
    const { seen } = await catalogFor(fighter);
    assert.equal(fighter.writes, 0, "no fighter.save()");
    assert.deepEqual(seen.writes, [], "no atomic fighter write either");
});

test("DOC_TECHNICIAN (price null) never reaches the shop; the 7 cash boosters do", async () => {
    const { catalog } = await catalogFor(fakeFighter());
    const ids = catalog.boosters.map((b) => b.id);
    assert.equal(ids.includes("DOC_TECHNICIAN"), false);
    assert.equal(ids.length, 7);
    for (const b of catalog.boosters) assert.ok(Number.isInteger(b.price) && b.price > 0, b.id);
});

test("premiumBundles carry amountCents from config; popular only on the 15 pack", async () => {
    const { catalog } = await catalogFor(fakeFighter());
    assert.equal(catalog.premiumBundles.length, Object.keys(PREMIUM_BUNDLES).length);
    for (const row of catalog.premiumBundles) {
        assert.equal(row.amountCents, PREMIUM_BUNDLES[row.id].amountCents, row.id);
        assert.equal(row.priceLabel, PREMIUM_BUNDLES[row.id].priceLabel, row.id);
        assert.equal(row.drinks, PREMIUM_BUNDLES[row.id].drinks, row.id);
    }
    assert.deepEqual(catalog.premiumBundles.filter((r) => r.popular).map((r) => r.id), ["drinks-15"]);
    assert.deepEqual(catalog.premiumBundles.map((r) => r.amountCents), [499, 999, 1999, 3999]);
});

test("premiumPanel follows the flags", async () => {
    let { catalog } = await catalogFor(fakeFighter());
    assert.deepEqual(catalog.premiumPanel, { mode: "full", reason: "first_visit" });
    ({ catalog } = await catalogFor(fakeFighter({ premiumPanelSeen: true, premiumPanelReshowPending: true })));
    assert.deepEqual(catalog.premiumPanel, { mode: "full", reason: "account_secured" });
    ({ catalog } = await catalogFor(fakeFighter({ premiumPanelSeen: true })));
    assert.deepEqual(catalog.premiumPanel, { mode: "collapsed", reason: null });
});

test("freeEarn is built from the fighter and its ACTIVE sponsorships", async () => {
    const { catalog, seen } = await catalogFor(fakeFighter(), [{ rewardDrinks: 2 }, { rewardDrinks: 3 }]);
    assert.deepEqual(seen.sponsorFilter, { fighterId: FID, status: "active" });
    assert.equal(seen.sponsorSelect, "rewardDrinks");
    assert.deepEqual(catalog.freeEarn, {
        streak: { current: 7, next: 10, drinks: 2 },
        promotion: { drinks: 3, kind: "promotion" },
        sponsor: { active: true, drinks: 5 },
        overCap: false,
    });
});

test("freeEarn: GCS belt holder at 20+ streak over the cap with no deals", async () => {
    const fighter = fakeFighter({
        winStreak: 22, promotionTier: TOP_TIER, gcsTitleWins: 2,
        inventory: { energyShots: 0, energyDrinks: 99, prefightBuffs: {}, usedBuffs: {} },
    });
    const { catalog } = await catalogFor(fighter, []);
    assert.deepEqual(catalog.freeEarn, {
        streak: null,
        promotion: null,
        sponsor: { active: false, min: 2, max: 4 },
        overCap: true,
    });
});

test("Fighter not found is unchanged", async () => {
    await withStubs([[Fighter, "findById", async () => null]], () =>
        assert.rejects(() => shopService.getCatalog(FID), /Fighter not found/));
});
