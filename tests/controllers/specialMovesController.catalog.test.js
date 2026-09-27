/**
 * Contract conformance for GET /fighters/:id/moves/catalog
 * (controllers/specialMovesController.getCatalog): 200 with the service body, 404 for a
 * missing fighter, 500 that never leaks internals.
 *
 * No Express, no DB: Fighter.findById is stubbed and a minimal res double records status and
 * body. Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const specialMovesController = require("../../controllers/specialMovesController");
const specialMovesService = require("../../services/specialMovesService");
const Fighter = require("../../models/fighterModel");

async function withStub(obj, key, impl, body) {
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const original = obj[key];
    obj[key] = impl;
    try {
        return await body();
    } finally {
        if (had) obj[key] = original;
        else delete obj[key];
    }
}

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

function req(over = {}) {
    return { params: { id: "f1" }, body: {}, user: { id: "u1", fighterId: "f1" }, ...over };
}

/** Silence the expected server-side error logs for the 500 cases. */
async function quiet(body) {
    const orig = console.error;
    console.error = () => {};
    try { return await body(); } finally { console.error = orig; }
}

function makeFighter() {
    return {
        _id: "f1",
        promotionTier: "Amateur",
        specialMovesOwned: [{ moveId: "HEAVY_HANDS", rarity: "RARE", acquiredAt: new Date("2026-09-01T12:00:00Z") }],
        specialMovesEquipped: ["HEAVY_HANDS"],
        iron: 0,
        acceptedFightId: null,
    };
}

test("GET catalog: 200 with exactly buildCatalog(fighter)", async () => {
    const fighter = makeFighter();
    let seenId = null;
    const res = mockRes();
    await withStub(Fighter, "findById", async (id) => { seenId = id; return fighter; }, () =>
        specialMovesController.getCatalog(req(), res));
    assert.equal(seenId, "f1");
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, specialMovesService.buildCatalog(fighter));
    assert.equal(typeof res.body.teachChannel, "boolean");
    assert.equal(res.body.moves.length, 24);
});

test("GET catalog: the handler delegates to the service (no logic of its own)", async () => {
    const fighter = makeFighter();
    const sentinel = { teachChannel: true, moves: [] };
    let got = null;
    const res = mockRes();
    await withStub(Fighter, "findById", async () => fighter, () =>
        withStub(specialMovesService, "buildCatalog", (f) => { got = f; return sentinel; }, () =>
            specialMovesController.getCatalog(req(), res)));
    assert.equal(got, fighter);
    assert.equal(res.body, sentinel);
});

test("GET catalog: 404 Fighter not found", async () => {
    const res = mockRes();
    await withStub(Fighter, "findById", async () => null, () =>
        specialMovesController.getCatalog(req(), res));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Fighter not found" });
});

test("GET catalog: 500 hides internals (lookup or build throwing)", async () => {
    let res = mockRes();
    await quiet(() => withStub(Fighter, "findById", async () => { throw new Error("connection string leaked"); }, () =>
        specialMovesController.getCatalog(req(), res)));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });

    res = mockRes();
    await quiet(() => withStub(Fighter, "findById", async () => makeFighter(), () =>
        withStub(specialMovesService, "buildCatalog", () => { throw new Error("secret stack"); }, () =>
            specialMovesController.getCatalog(req(), res))));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});
