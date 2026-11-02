/**
 * energyOfferModel.js is a plain ESM module under frontend/src (no JSX, no imports), loaded
 * directly with Node's native loader. Covers the out-of-energy offer rules.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = path.resolve(__dirname, "../../frontend/src/components/shop/energyOfferModel.js");
let m;

test("load energyOfferModel.js", async () => {
    m = await import(pathToFileURL(modulePath));
    assert.equal(typeof m.isEnergyShortfall, "function");
});

test("isEnergyShortfall: the four codes and HTTP 402, nothing else", () => {
    for (const code of ["insufficient_energy", "FIGHT_NOT_ENOUGH_ENERGY", "not_enough_energy", "CAMP_NOT_ENOUGH_ENERGY"]) {
        assert.equal(m.isEnergyShortfall({ code, status: 400 }), true, code);
    }
    assert.deepEqual([...m.ENERGY_SHORTFALL_CODES].sort(), [
        "CAMP_NOT_ENOUGH_ENERGY", "FIGHT_NOT_ENOUGH_ENERGY", "insufficient_energy", "not_enough_energy",
    ]);
    assert.equal(m.isEnergyShortfall({ status: 402 }), true);
    assert.equal(m.isEnergyShortfall({ code: "FIGHT_BLOCKED_INJURY", status: 400 }), false);
    assert.equal(m.isEnergyShortfall({ code: "FIGHT_LIMIT", status: 400 }), false);
    assert.equal(m.isEnergyShortfall(new Error("boom")), false);
    assert.equal(m.isEnergyShortfall(null), false);
    assert.equal(m.isEnergyShortfall(undefined), false);
});

test("shortfallFromError prefers the server's integers", () => {
    const err = { body: { need: 18, have: 7 } };
    assert.deepEqual(m.shortfallFromError(err, { need: 10, have: 99 }), { need: 18, have: 7 });
});

test("shortfallFromError falls back when the body lacks or mangles need/have", () => {
    const fb = { need: 15, have: 4 };
    assert.deepEqual(m.shortfallFromError({}, fb), fb);
    assert.deepEqual(m.shortfallFromError({ body: {} }, fb), fb);
    assert.deepEqual(m.shortfallFromError({ body: { need: 18 } }, fb), fb);
    assert.deepEqual(m.shortfallFromError({ body: { need: "18", have: "7" } }, fb), fb);
    assert.deepEqual(m.shortfallFromError({ body: { need: 18.5, have: 7 } }, fb), fb);
    assert.deepEqual(m.shortfallFromError(null, fb), fb);
});

test("waitMinutes is need minus have, never negative", () => {
    assert.equal(m.waitMinutes(15, 4), 11);
    assert.equal(m.waitMinutes(15, 14), 1);
    assert.equal(m.waitMinutes(15, 15), 0);
    assert.equal(m.waitMinutes(15, 40), 0);
    assert.equal(m.waitMinutes(undefined, 3), 0);
});

test("shotRow: owned uses, cash buys, short of cash is blocked (cash === price buys)", () => {
    assert.equal(m.shotRow({ owned: 2, cash: 0, price: 600 }), "use");
    assert.equal(m.shotRow({ owned: 0, cash: 600, price: 600 }), "buy_use");
    assert.equal(m.shotRow({ owned: 0, cash: 5000, price: 600 }), "buy_use");
    assert.equal(m.shotRow({ owned: 0, cash: 599, price: 600 }), "no_cash");
    assert.equal(m.shotRow({ owned: 0, cash: 100000, price: undefined }), "no_cash");
});

test("drinkRow: use when owned, none otherwise", () => {
    assert.equal(m.drinkRow({ owned: 1 }), "use");
    assert.equal(m.drinkRow({ owned: 0 }), "none");
    assert.equal(m.drinkRow({}), "none");
});

test("actionNounKey maps each source to its noun", () => {
    assert.equal(m.actionNounKey("pvp"), "shop.offer.action.attack");
    assert.equal(m.actionNounKey("fight"), "shop.offer.action.fight");
    assert.equal(m.actionNounKey("fightcamp"), "shop.offer.action.session");
    assert.equal(m.actionNounKey("camp"), "shop.offer.action.drill");
});

test("beaconShortfall clamps to the server's accepted ranges or skips", () => {
    assert.deepEqual(m.beaconShortfall(15, 4), { need: 15, have: 4 });
    assert.deepEqual(m.beaconShortfall(0, -3), { need: 1, have: 0 });
    assert.deepEqual(m.beaconShortfall(250, 400), { need: 100, have: 100 });
    assert.deepEqual(m.beaconShortfall(14.6, 3.4), { need: 15, have: 3 });
    assert.equal(m.beaconShortfall(undefined, 3), null);
    assert.equal(m.beaconShortfall(15, NaN), null);
});

test("isEnergyFullError and isNotEnoughCashError match the server's refusal text", () => {
    assert.equal(m.isEnergyFullError(new Error("Energy already full")), true);
    assert.equal(m.isEnergyFullError(new Error("Not enough cash")), false);
    assert.equal(m.isNotEnoughCashError(new Error("Not enough cash")), true);
    assert.equal(m.isNotEnoughCashError(new Error("Energy already full")), false);
    assert.equal(m.isNotEnoughCashError(null), false);
});
