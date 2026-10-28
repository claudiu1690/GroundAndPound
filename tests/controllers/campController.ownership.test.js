/**
 * controllers/campController.js: every handler acts on req.user.fighterId, never on a
 * client fighterId (query or body), and maps service errors to the documented statuses.
 *
 * No Express, no DB: campService functions are stubbed and a minimal res double records
 * status and body (same helpers as fightController.resolve.test.js). Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const campController = require("../../controllers/campController");
const campService = require("../../services/campService");

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

const FIGHT_ID = "64b7f0c2a1b2c3d4e5f60718";

function req(over = {}) {
    return { params: { fightId: FIGHT_ID }, query: {}, body: {}, user: { id: "u1", fighterId: "f1" }, ...over };
}

/** Silence the expected server-side error logs for the 500 cases. */
async function quiet(body) {
    const orig = console.error;
    console.error = () => {};
    try { return await body(); } finally { console.error = orig; }
}

const SPOOFS = ["someone-else", { $ne: null }, ["f1"]];

// [handler, service fn, valid body (without fighterId), index of fighterId in the service args]
const WRITE_HANDLERS = [
    ["addSession", "addCampSession", { sessionType: "STRIKING" }],
    ["removeSession", "removeSession", { slotIndex: 0 }],
    ["resolveInjury", "resolveInjury", { choice: "STOP" }],
    ["finaliseCamp", "finaliseCamp", { skip: true }],
    ["selectBuff", "selectBuff", { buffId: "x" }],
];

for (const [handler, svc, validBody] of WRITE_HANDLERS) {
    test(`${handler}: a spoofed body fighterId never reaches the service; it gets req.user.fighterId`, async () => {
        for (const spoof of SPOOFS) {
            const res = mockRes();
            let args = null;
            // eslint-disable-next-line no-await-in-loop
            await withStub(campService, svc, async (...a) => { args = a; return { ok: true }; },
                () => campController[handler](req({ body: { ...validBody, fighterId: spoof } }), res));
            assert.equal(res.statusCode, 200, `${handler} with ${JSON.stringify(spoof)}`);
            assert.deepEqual(res.body, { ok: true });
            assert.equal(args[0], FIGHT_ID);
            assert.equal(args[1], "f1");
        }
    });

    test(`${handler}: a missing client fighterId is no longer a 400`, async () => {
        const res = mockRes();
        let called = false;
        await withStub(campService, svc, async () => { called = true; return { ok: true }; },
            () => campController[handler](req({ body: { ...validBody } }), res));
        assert.equal(called, true);
        assert.equal(res.statusCode, 200);
    });
}

test("getCampState: no query fighterId needed, and a spoofed one is ignored", async () => {
    for (const query of [{}, ...SPOOFS.map((fighterId) => ({ fighterId }))]) {
        const res = mockRes();
        let args = null;
        // eslint-disable-next-line no-await-in-loop
        await withStub(campService, "getCampState", async (...a) => { args = a; return { state: 1 }; },
            () => campController.getCampState(req({ query }), res));
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { state: 1 });
        assert.deepEqual(args, [FIGHT_ID, "f1"]);
    }
});

test("getReport: passes only the fightId to the service", async () => {
    const res = mockRes();
    let args = null;
    await withStub(campService, "getFighterReport", async (...a) => { args = a; return { report: 1 }; },
        () => campController.getReport(req({ query: { fighterId: "someone-else" } }), res));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(args, [FIGHT_ID]);
});

test("finaliseCamp: skip is optional and coerced to a boolean", async () => {
    for (const [body, expected] of [[{}, false], [{ skip: 1 }, true], [{ skip: "" }, false]]) {
        let args = null;
        // eslint-disable-next-line no-await-in-loop
        await withStub(campService, "finaliseCamp", async (...a) => { args = a; return {}; },
            () => campController.finaliseCamp(req({ body }), mockRes()));
        assert.deepEqual(args, [FIGHT_ID, "f1", expected]);
    }
});

test("selectBuff: a missing buffId clears the selection (null)", async () => {
    let args = null;
    await withStub(campService, "selectBuff", async (...a) => { args = a; return {}; },
        () => campController.selectBuff(req({ body: {} }), mockRes()));
    assert.deepEqual(args, [FIGHT_ID, "f1", null]);
});

test("missing required fields are 400 and the service is never called", async () => {
    const cases = [
        ["addSession", "addCampSession", "sessionType is required"],
        ["removeSession", "removeSession", "slotIndex is required"],
        ["resolveInjury", "resolveInjury", "choice is required"],
    ];
    for (const [handler, svc, message] of cases) {
        for (const body of [{}, { fighterId: "f1" }, undefined, null, "a string body"]) {
            const res = mockRes();
            let called = false;
            // eslint-disable-next-line no-await-in-loop
            await withStub(campService, svc, async () => { called = true; return {}; },
                () => campController[handler](req({ body }), res));
            assert.equal(called, false, `${handler} ${JSON.stringify(body)}`);
            assert.equal(res.statusCode, 400, `${handler} ${JSON.stringify(body)}`);
            assert.deepEqual(res.body, { message });
        }
    }
});

test("finaliseCamp and selectBuff with an undefined body are not a 500", async () => {
    for (const [handler, svc] of [["finaliseCamp", "finaliseCamp"], ["selectBuff", "selectBuff"]]) {
        const res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await withStub(campService, svc, async () => ({ ok: true }),
            () => campController[handler](req({ body: undefined }), res));
        assert.equal(res.statusCode, 200, handler);
    }
});

test("removeSession: slotIndex 0 is present, not missing", async () => {
    let args = null;
    await withStub(campService, "removeSession", async (...a) => { args = a; return {}; },
        () => campController.removeSession(req({ body: { slotIndex: 0 } }), mockRes()));
    assert.deepEqual(args, [FIGHT_ID, "f1", 0]);
});

test("handleError maps service errors to the documented statuses", async () => {
    const cases = [
        ["Fight is resolving or already resolved", 409, { message: "Fight is resolving or already resolved", code: "CAMP_FIGHT_LOCKED" }],
        ["Invalid slot index", 400, { message: "Invalid slot index", code: "CAMP_INVALID_SLOT" }],
        ["Resolve camp injury before removing sessions", 400, { message: "Resolve camp injury before removing sessions", code: "CAMP_INJURED" }],
        ["Forbidden", 403, { message: "Access denied", code: "CAMP_FORBIDDEN" }],
        ["Fight not found", 404, { message: "Fight not found", code: "CAMP_FIGHT_NOT_FOUND" }],
        ["Fight not found or not accepted", 404, { message: "Fight not found or not accepted", code: "CAMP_FIGHT_NOT_FOUND" }],
        ["Camp not found", 404, { message: "Camp not found", code: "CAMP_FIGHT_NOT_FOUND" }],
        ["Camp is already finalised", 400, { message: "Camp is already finalised", code: "CAMP_FINALISED" }],
        ["Not enough energy", 400, { message: "Not enough energy", code: "CAMP_NOT_ENOUGH_ENERGY" }],
    ];
    for (const [message, status, body] of cases) {
        const res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await withStub(campService, "removeSession", async () => { throw new Error(message); },
            () => campController.removeSession(req({ body: { slotIndex: 0 } }), res));
        assert.equal(res.statusCode, status, message);
        assert.deepEqual(res.body, body, message);
    }
});

test("handleError: the retired \"Fight already resolved\" message and unknown errors are 500 with no echo", async () => {
    for (const message of ["Fight already resolved", "E11000 secret mongo detail"]) {
        const res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await quiet(() => withStub(campService, "selectBuff", async () => { throw new Error(message); },
            () => campController.selectBuff(req({ body: { buffId: "x" } }), res)));
        assert.equal(res.statusCode, 500, message);
        assert.deepEqual(res.body, { message: "Internal server error" });
    }
});

test("the lock maps to 409 CAMP_FIGHT_LOCKED from every write handler", async () => {
    for (const [handler, svc, validBody] of WRITE_HANDLERS) {
        const res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await withStub(campService, svc, async () => { throw new Error("Fight is resolving or already resolved"); },
            () => campController[handler](req({ body: validBody }), res));
        assert.equal(res.statusCode, 409, handler);
        assert.equal(res.body.code, "CAMP_FIGHT_LOCKED");
    }
});

test("addSession: not-enough-energy carries need/have, code and status unchanged", async () => {
    const { markShortfall } = require("../../utils/energyShortfall");
    let res = mockRes();
    await withStub(campService, "addCampSession", async () => { throw markShortfall(new Error("Not enough energy"), 6, 2); },
        () => campController.addSession(req({ body: { sessionType: "STRIKING" } }), res));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Not enough energy", code: "CAMP_NOT_ENOUGH_ENERGY", need: 6, have: 2 });

    // Without the fields (or with invalid ones) the body is exactly what it was before.
    for (const err of [new Error("Not enough energy"), Object.assign(new Error("Not enough energy"), { need: "6", have: 2 })]) {
        res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await withStub(campService, "addCampSession", async () => { throw err; },
            () => campController.addSession(req({ body: { sessionType: "STRIKING" } }), res));
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { message: "Not enough energy", code: "CAMP_NOT_ENOUGH_ENERGY" });
    }
});
