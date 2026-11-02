/**
 * POST /home-camp/:fighterId/train: not_enough_energy (zero sessions funded) carries need/have
 * through the CODE_EXTRAS whitelist. Status and code unchanged; other codes cannot leak them.
 * No Express, no DB: homeCampTrainingService.runDrill is stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const homeCampController = require("../../controllers/homeCampController");
const homeCampTrainingService = require("../../services/homeCampTrainingService");
const { campError } = require("../../services/homeCampCoachService");
const { markShortfall } = require("../../utils/energyShortfall");

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

const REQ = { params: { fighterId: "f1" }, body: { coachId: null, drillKey: "open_mat", quantity: 3 }, user: { id: "u1", fighterId: "f1" } };

async function train(err) {
    const res = mockRes();
    await withStub(homeCampTrainingService, "runDrill", async () => { throw err; }, () => homeCampController.train(REQ, res));
    return res;
}

test("not_enough_energy: 400 with need and have", async () => {
    const res = await train(markShortfall(campError("not_enough_energy", "Not enough energy", 400), 6, 2));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Not enough energy", code: "not_enough_energy", need: 6, have: 2 });
});

test("not_enough_energy without the fields is the old body", async () => {
    const res = await train(campError("not_enough_energy", "Not enough energy", 400));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Not enough energy", code: "not_enough_energy" });
});

test("other codes never echo need/have", async () => {
    const err = Object.assign(campError("injury_blocked", "Cannot train", 400), { need: 6, have: 2 });
    const res = await train(err);
    assert.deepEqual(res.body, { message: "Cannot train", code: "injury_blocked" });
});

test("insufficient_cash keeps its own extras (cost, have) untouched", async () => {
    const res = await train(campError("insufficient_cash", "Not enough cash", 400, { cost: 500, have: 100 }));
    assert.deepEqual(res.body, { message: "Not enough cash", code: "insufficient_cash", cost: 500, have: 100 });
});
