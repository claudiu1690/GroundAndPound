/**
 * shopConstants.js is a plain ESM module under frontend/src (no JSX, no imports), loaded
 * directly with Node's native loader. Covers the shop redesign helpers plus the unchanged
 * premiumBuyMode.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = path.resolve(__dirname, "../../frontend/src/components/shop/shopConstants.js");
let sc;

const BUNDLES = [
    { id: "drinks-6", drinks: 6, amountCents: 499 },
    { id: "drinks-15", drinks: 15, amountCents: 999, popular: true },
    { id: "drinks-40", drinks: 40, amountCents: 1999 },
    { id: "drinks-100", drinks: 100, amountCents: 3999 },
];

test("load shopConstants.js", async () => {
    sc = await import(pathToFileURL(modulePath));
    assert.equal(typeof sc.bundlePricing, "function");
});

test("bundlePricing: savings 20/40/52 against the 6 pack, null for the 6 pack", () => {
    const p = sc.bundlePricing(BUNDLES);
    assert.deepEqual(p.map((x) => x.savingsPct), [null, 20, 40, 52]);
    assert.deepEqual(p.map((x) => x.perDrink), [0.83, 0.67, 0.5, 0.4]);
    assert.deepEqual(p.map((x) => x.id), BUNDLES.map((b) => b.id));
});

test("bundlePricing: order independent and safe without amountCents", () => {
    const p = sc.bundlePricing([...BUNDLES].reverse());
    assert.deepEqual(p.map((x) => x.savingsPct), [52, 40, 20, null]);
    const none = sc.bundlePricing([{ id: "a", drinks: 6 }, { id: "b", drinks: 15 }]);
    assert.deepEqual(none, [
        { id: "a", perDrink: null, savingsPct: null },
        { id: "b", perDrink: null, savingsPct: null },
    ]);
    assert.deepEqual(sc.bundlePricing(undefined), []);
});

test("canCount: 1/2/3/4 cans for 6/15/40/100", () => {
    assert.deepEqual([6, 15, 40, 100].map(sc.canCount), [1, 2, 3, 4]);
});

const FULL = {
    streak: { current: 3, next: 5, drinks: 1 },
    promotion: { drinks: 3, kind: "promotion" },
    sponsor: { active: true, drinks: 5 },
    overCap: false,
};

test("freeEarnChips: every applicable source, max three, in priority order", () => {
    const chips = sc.freeEarnChips(FULL, 99);
    assert.deepEqual(chips.map((c) => c.key), [
        "shop.freeEarn.streak", "shop.freeEarn.promotion", "shop.freeEarn.sponsorActive",
    ]);
    assert.deepEqual(chips[0].vars, { current: 3, next: 5, drinks: 1 });
    assert.deepEqual(chips[2].vars, { drinks: 5 });
    assert.ok(chips.length <= 3);
});

test("freeEarnChips omits null sources and picks the GCS and no-sponsor variants", () => {
    const chips = sc.freeEarnChips({
        streak: null,
        promotion: { drinks: 3, kind: "gcs_belt" },
        sponsor: { active: false, min: 2, max: 4 },
        overCap: false,
    }, 99);
    assert.deepEqual(chips.map((c) => c.key), ["shop.freeEarn.gcsBelt", "shop.freeEarn.sponsorNone"]);
    assert.deepEqual(chips[1].vars, { min: 2, max: 4 });
    assert.deepEqual(sc.freeEarnChips({ streak: null, promotion: null, sponsor: null, overCap: false }, 99), []);
    assert.deepEqual(sc.freeEarnChips(null, 99), []);
});

test("freeEarnChips: over the soft cap it is the single cap line", () => {
    const chips = sc.freeEarnChips({ ...FULL, overCap: true }, 99, 104);
    assert.equal(chips.length, 1);
    assert.equal(chips[0].key, "shop.freeEarn.capLine");
    assert.deepEqual(chips[0].vars, { owned: 104, cap: 99 });
    assert.deepEqual(sc.freeEarnChips({ ...FULL, overCap: true }, 99)[0].vars, { owned: 99, cap: 99 });
});

test("freeEarnHint: priority streak, promotion, sponsor; cap line when over cap", () => {
    assert.equal(sc.freeEarnHint(FULL, 99).key, "shop.freeEarn.streak");
    assert.equal(sc.freeEarnHint({ ...FULL, streak: null }, 99).key, "shop.freeEarn.promotion");
    assert.equal(sc.freeEarnHint({ ...FULL, streak: null, promotion: null }, 99).key, "shop.freeEarn.sponsorActive");
    assert.equal(sc.freeEarnHint({ ...FULL, overCap: true }, 99).key, "shop.freeEarn.capLine");
    assert.equal(sc.freeEarnHint({ streak: null, promotion: null, sponsor: null, overCap: false }, 99), null);
    assert.equal(sc.freeEarnHint(undefined, 99), null);
});

test("shopArtSrc: shipped ids resolve, others are null, and every file exists", () => {
    assert.equal(sc.shopArtSrc("energy-shot"), "/assets/shop/energy-shot.webp");
    assert.equal(sc.shopArtSrc("energy-drink"), "/assets/shop/energy-drink.webp");
    assert.equal(sc.shopArtSrc("DOC_TECHNICIAN"), null);
    assert.equal(sc.shopArtSrc(undefined), null);
    assert.equal(sc.SHOP_ART_IDS.length, 16);
    for (const id of sc.SHOP_ART_IDS) {
        const file = path.resolve(__dirname, "../../frontend/public", sc.shopArtSrc(id).slice(1));
        assert.ok(fs.existsSync(file), `${id}.webp is missing`);
    }
});

test("boosterEffect splits a booster into pct, tags and sessions", () => {
    const all = sc.boosterEffect({ pct: 0.2, stats: "ALL", sessions: 3 });
    assert.deepEqual(all, { pct: "20", allStats: true, tags: [], sessions: 3 });
    const two = sc.boosterEffect({ pct: 0.25, stats: ["str", "wre"], sessions: 3 });
    assert.equal(two.allStats, false);
    assert.deepEqual(two.tags.map((t) => t.text), ["STR", "WRE"]);
});

test("premiumBuyMode is unchanged: disabled beats guest beats buy", () => {
    assert.equal(sc.premiumBuyMode({ isGuest: false, paymentsEnabled: true }), "buy");
    assert.equal(sc.premiumBuyMode({ isGuest: true, paymentsEnabled: true }), "guest");
    assert.equal(sc.premiumBuyMode({ isGuest: true, paymentsEnabled: false }), "disabled");
    assert.equal(sc.premiumBuyMode({ isGuest: false, paymentsEnabled: undefined }), "buy");
});
