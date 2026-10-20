/**
 * GET /fighters/:id (fighterController.getById) is owner-only at the route (ownFighter) and
 * returns the full fighter payload plus statProgress. No DB: getFighterById and
 * buildStatProgress are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fighterService = require("../../services/fighterService");
const fighterController = require("../../controllers/fighterController");

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

async function run(getImpl) {
    const real = { get: fighterService.getFighterById, progress: fighterService.buildStatProgress };
    const calls = [];
    fighterService.getFighterById = async (id) => { calls.push(id); return getImpl(id); };
    fighterService.buildStatProgress = (f) => ({ str: { current: f.str, next: f.str + 1 } });
    const res = mockRes();
    const orig = console.error;
    console.error = () => {};
    try {
        await fighterController.getById({ params: { id: "f1" }, user: { id: "u1", fighterId: "f1" } }, res);
    } finally {
        console.error = orig;
        fighterService.getFighterById = real.get;
        fighterService.buildStatProgress = real.progress;
    }
    return { res, calls };
}

test("owner read is 200 with the full payload plus statProgress", async () => {
    const full = { _id: "f1", firstName: "Ana", iron: 4321, inventory: { energyDrinks: 2 }, str: 50, pvpDefense: { unreadCount: 0 } };
    const { res, calls } = await run(async () => full);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, ["f1"]);
    assert.deepEqual(res.body, { ...full, statProgress: { str: { current: 50, next: 51 } } });
});

test("Fighter not found is 404", async () => {
    const { res } = await run(async () => { throw new Error("Fighter not found"); });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Fighter not found" });
});

test("any other error is a generic 500", async () => {
    const { res } = await run(async () => { throw new Error("ECONNREFUSED redis internal detail"); });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});
