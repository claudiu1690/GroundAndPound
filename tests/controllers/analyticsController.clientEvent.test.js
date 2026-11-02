/**
 * POST /fighters/:id/analytics/events: 204 accepted, 400 invalid_event, 500 hidden.
 * The fighterId is the owner-checked route param and the userId comes from the token; the
 * body can never choose either. No Express, no DB: analytics track is stubbed.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const analyticsController = require("../../controllers/analyticsController");
const analyticsService = require("../../services/analyticsService");

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
    const res = { statusCode: 200, body: undefined, ended: false };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.end = () => { res.ended = true; return res; };
    return res;
}

function req(body) {
    return { params: { id: "f1" }, body, user: { id: "u1", fighterId: "f1" } };
}

async function post(body, trackImpl) {
    const calls = [];
    const res = mockRes();
    await withStub(analyticsService, "track", trackImpl || (async (...a) => { calls.push(a); }), () =>
        analyticsController.trackClientEvent(req(body), res));
    return { res, calls };
}

test("204 on a valid event; ids come from the route and token, not the body", async () => {
    const { res, calls } = await post({ type: "premium_panel_expanded", meta: { from: "chip" }, userId: "evil", fighterId: "evil" });
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.body, undefined);
    assert.deepEqual(calls, [["u1", "premium_panel_expanded", { from: "chip" }, { fighterId: "f1" }]]);
});

test("400 invalid_event for every rejected shape, and nothing is written", async () => {
    const bad = [
        undefined, null, "string body", [], {},
        { type: "premium_panel_shown", meta: { reason: "first_visit" } },
        { type: "nope", meta: {} },
        { type: "energy_offer_shown", meta: { source: "pvp", need: 500, have: 1 } },
        { type: "energy_offer_choice" },
        { type: { $ne: null }, meta: { from: "bar" } },
    ];
    for (const body of bad) {
        // eslint-disable-next-line no-await-in-loop
        const { res, calls } = await post(body);
        assert.equal(res.statusCode, 400, JSON.stringify(body));
        assert.deepEqual(res.body, { message: "Invalid event", code: "invalid_event" }, JSON.stringify(body));
        assert.deepEqual(calls, [], JSON.stringify(body));
    }
});

test("a storage failure inside track never fails the request", async () => {
    // track's own contract is never-reject; even a rejected promise is not awaited by the beacon.
    const { res } = await post({ type: "energy_offer_choice", meta: { source: "pvp", choice: "wait" } }, () => new Promise(() => {}));
    assert.equal(res.statusCode, 204);
});

test("an unexpected internal error is a 500 with no detail", async () => {
    const res = mockRes();
    const orig = console.error;
    console.error = () => {};
    try {
        await withStub(analyticsService, "trackClientEvent", () => { throw new Error("secret"); }, () =>
            analyticsController.trackClientEvent(req({ type: "x" }), res));
    } finally {
        console.error = orig;
    }
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});
