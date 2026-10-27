/**
 * Contract conformance for POST /fights/resolve/:fighterId (controllers/fightController.js
 * resolveFight) plus the body-keyed ownership guard on PUT /fights/weight-cut and
 * PUT /fights/strategy.
 *
 * No Express, no DB: the service functions are stubbed and a minimal res double records
 * status and body (same helpers as fightController.offers.test.js). Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fightController = require("../../controllers/fightController");
const fightService = require("../../services/fightService");

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
    return { params: { fighterId: "f1" }, body: {}, user: { id: "u1", fighterId: "f1" }, ...over };
}

/** Silence the expected server-side error logs for the 500 cases. */
async function quiet(body) {
    const orig = console.error;
    console.error = () => {};
    try { return await body(); } finally { console.error = orig; }
}

function codedError(code, message, status) {
    const err = new Error(message);
    err.code = code;
    err.status = status;
    return err;
}

test("resolve: FIGHT_ALREADY_RESOLVED maps to 409 { message, code }", async () => {
    const res = mockRes();
    const err = codedError("FIGHT_ALREADY_RESOLVED", "This fight has already been resolved.", 409);
    await withStub(fightService, "resolveFightAndApply", async () => { throw err; },
        () => fightController.resolveFight(req(), res));
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { message: "This fight has already been resolved.", code: "FIGHT_ALREADY_RESOLVED" });
});

test("resolve: \"No accepted fight\" still maps to 400 FIGHT_NO_ACCEPTED_FIGHT", async () => {
    const res = mockRes();
    await withStub(fightService, "resolveFightAndApply", async () => { throw new Error("No accepted fight"); },
        () => fightController.resolveFight(req(), res));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "No accepted fight", code: "FIGHT_NO_ACCEPTED_FIGHT" });
});

test("resolve: existing message mappings are unchanged", async () => {
    const cases = [
        ["Fight not found", 404, { message: "Fight not found" }],
        ["Fighter not found", 404, { message: "Fighter not found" }],
        ["Opponent not found", 404, { message: "Opponent not found" }],
        ["Not enough energy", 400, { message: "Not enough energy", code: "FIGHT_NOT_ENOUGH_ENERGY" }],
        ["Cannot fight: concussion", 400, { message: "Cannot fight: concussion", code: "FIGHT_DOCTOR_VISIT_REQUIRED" }],
        ["Mental Reset required first", 400, { message: "Mental Reset required first", code: "FIGHT_MENTAL_RESET_REQUIRED" }],
    ];
    for (const [message, status, body] of cases) {
        const res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await withStub(fightService, "resolveFightAndApply", async () => { throw new Error(message); },
            () => fightController.resolveFight(req(), res));
        assert.equal(res.statusCode, status, message);
        assert.deepEqual(res.body, body, message);
    }
});

test("resolve: a generic error is 500 \"Internal server error\" with no message echo", async () => {
    const res = mockRes();
    await quiet(() => withStub(fightService, "resolveFightAndApply",
        async () => { throw new Error("E11000 secret mongo detail"); },
        () => fightController.resolveFight(req(), res)));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});

test("resolve: an unknown code or a 5xx status is never echoed", async () => {
    for (const err of [
        codedError("SOME_INTERNAL_CODE", "internal detail", 409),
        codedError("FIGHT_ALREADY_RESOLVED", "internal detail", 500),
    ]) {
        const res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await quiet(() => withStub(fightService, "resolveFightAndApply", async () => { throw err; },
            () => fightController.resolveFight(req(), res)));
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { message: "Internal server error" });
    }
});

test("resolve: success passes the service result through and threads req.user.id", async () => {
    const res = mockRes();
    let args = null;
    const payload = { fight: {}, fighter: {}, result: {}, summary: {}, breakdownView: null };
    await withStub(fightService, "resolveFightAndApply", async (...a) => { args = a; return payload; },
        () => fightController.resolveFight(req(), res));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, payload);
    assert.deepEqual(args, ["f1", "u1"]);
});

for (const [handler, svcFn, field] of [["setWeightCut", "setWeightCut", "weightCut"], ["setStrategy", "setStrategy", "strategy"]]) {
    test(`${handler}: a body fighterId that is not the caller's is 403 and never reaches the service`, async () => {
        const hostile = [
            "someone-else",
            { $ne: null },
            ["f1"],
        ];
        for (const fighterId of hostile) {
            const res = mockRes();
            let called = false;
            // eslint-disable-next-line no-await-in-loop
            await withStub(fightService, svcFn, async () => { called = true; return {}; },
                () => fightController[handler](req({ body: { fighterId, fightId: "x", [field]: "easy" } }), res));
            assert.equal(called, false, JSON.stringify(fighterId));
            assert.equal(res.statusCode, 403, JSON.stringify(fighterId));
        }
    });

    test(`${handler}: the caller's own fighterId reaches the service`, async () => {
        const res = mockRes();
        let args = null;
        await withStub(fightService, svcFn, async (...a) => { args = a; return { ok: true }; },
            () => fightController[handler](req({ body: { fighterId: "f1", fightId: "x", [field]: "easy" } }), res));
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { ok: true });
        assert.deepEqual(args, ["f1", "x", "easy"]);
    });

    test(`${handler}: a missing body is a 400, not a 500`, async () => {
        const res = mockRes();
        await fightController[handler](req({ body: undefined }), res);
        assert.equal(res.statusCode, 400);
    });
}
