/**
 * POST /pvp/fight: the insufficient_energy 402 carries need/have for the out-of-energy offer.
 * Status, code and message are unchanged; no other PvP code may echo need/have.
 * No Express, no DB: pvpFightService.resolveFight and analytics are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const pvpController = require("../../controllers/pvpController");
const pvpFightService = require("../../services/pvpFightService");
const analyticsService = require("../../services/analyticsService");
const { markShortfall } = require("../../utils/energyShortfall");

const { PvpError } = pvpFightService;

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

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

const REQ = { body: { defenderId: "d1", gameplan: "BALANCED" }, user: { id: "u1", fighterId: "f1" } };
const MSG = "Not enough energy — PVP fights cost 15 energy.";

async function post(err) {
    const tracked = [];
    const res = mockRes();
    await withStubs([
        [pvpFightService, "resolveFight", async () => { throw err; }],
        [analyticsService, "track", async (...a) => { tracked.push(a); }],
    ], () => pvpController.postFight(REQ, res));
    return { res, tracked };
}

test("insufficient_energy: 402 with need and have", async () => {
    const { res, tracked } = await post(markShortfall(new PvpError("insufficient_energy", MSG, 402), 15, 9));
    assert.equal(res.statusCode, 402);
    assert.deepEqual(res.body, { message: MSG, code: "insufficient_energy", need: 15, have: 9 });
    assert.equal(tracked.length, 0, "a refused fight is not a pvp fight");
});

test("insufficient_energy without valid numbers: the body is exactly the old one", async () => {
    let { res } = await post(new PvpError("insufficient_energy", MSG, 402));
    assert.deepEqual(res.body, { message: MSG, code: "insufficient_energy" });
    ({ res } = await post(Object.assign(new PvpError("insufficient_energy", MSG, 402), { need: 15, have: 1.5 })));
    assert.deepEqual(res.body, { message: MSG, code: "insufficient_energy" });
});

test("other PvP codes never echo need/have even if present", async () => {
    const err = Object.assign(new PvpError("attacker_injured", "You can't fight.", 409), { need: 15, have: 2 });
    const { res } = await post(err);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { message: "You can't fight.", code: "attacker_injured" });
});

test("a plain error is still a 500 with no detail", async () => {
    const orig = console.error;
    console.error = () => {};
    try {
        const { res } = await post(markShortfall(new Error("Not enough energy"), 15, 2));
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { message: "Internal server error" });
    } finally {
        console.error = orig;
    }
});
