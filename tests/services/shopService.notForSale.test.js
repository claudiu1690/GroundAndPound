/**
 * Granted-only items (price null) must not be buyable. The Documentary's DOC_TECHNICIAN
 * booster had price null, and buyItem's cash check `iron < null` is false while
 * `iron -= null` subtracts 0, so it was free to anyone who sent its id (2026-10-28).
 * No database: Fighter.findById is stubbed and must never be reached for these ids.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const shopService = require("../../services/shopService");
const { BOOSTERS, BUFFS, ENERGY_ITEMS } = require("../../consts/shopConfig");

function withNoFighterLookup(fn) {
    const real = Fighter.findById;
    let called = false;
    Fighter.findById = () => { called = true; throw new Error("fighter lookup must not happen"); };
    return Promise.resolve(fn()).finally(() => { Fighter.findById = real; }).then(() => called);
}

test("buying DOC_TECHNICIAN is refused as not for sale, before touching the fighter", async () => {
    const called = await withNoFighterLookup(async () => {
        await assert.rejects(() => shopService.buyItem("f1", "DOC_TECHNICIAN"), /not for sale/);
    });
    assert.equal(called, false);
});

test("every item without a positive integer price is refused", async () => {
    const all = [
        ...Object.values(BOOSTERS),
        ...Object.values(BUFFS),
        ...Object.values(ENERGY_ITEMS).filter((i) => !i.premium),
    ];
    const unpriced = all.filter((i) => !(Number.isInteger(i.price) && i.price > 0));
    assert.ok(unpriced.some((i) => i.id === "DOC_TECHNICIAN"));
    for (const item of unpriced) {
        await withNoFighterLookup(async () => {
            await assert.rejects(() => shopService.buyItem("f1", item.id), /not for sale/, item.id);
        });
    }
});

test("the premium Energy Drink keeps its own message", async () => {
    await withNoFighterLookup(async () => {
        await assert.rejects(() => shopService.buyItem("f1", "energy-drink"), /must be bought with premium/);
    });
});
