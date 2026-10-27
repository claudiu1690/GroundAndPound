/**
 * The three offer-board routes and the resolve route must run ownFighterParam("fighterId")
 * before the handler. The offer-board reroll route was removed (2026-10-26) and must stay gone.
 * Reads the Express router stack directly: no server, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const router = require("../../routes/fightRoutes");
const fightController = require("../../controllers/fightController");

function findRoute(method, path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    return layer ? layer.route : null;
}

function mockRes() {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

const GUARDED = [
    ["get", "/offers/:fighterId", fightController.getOffers],
    ["post", "/offers/:fighterId", fightController.createOffer],
    ["post", "/accept/:fighterId/:fightId", fightController.acceptOffer],
    ["post", "/resolve/:fighterId", fightController.resolveFight],
];

for (const [method, path, handler] of GUARDED) {
    test(`${method.toUpperCase()} ${path} runs ownFighterParam("fighterId") before the handler`, () => {
        const route = findRoute(method, path);
        assert.ok(route, "route is registered");
        const handles = route.stack.map((l) => l.handle);
        assert.equal(handles.length, 2);
        assert.equal(handles[0].name, "ownFighterParamGuard");
        assert.equal(handles[1], handler);

        // The guard is keyed on :fighterId: a mismatch is a 403 and never reaches next().
        const res = mockRes();
        let nextCalled = false;
        handles[0]({ user: { fighterId: "mine" }, params: { fighterId: "theirs", fightId: "x" } }, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);

        let ok = false;
        handles[0]({ user: { fighterId: "mine" }, params: { fighterId: "mine" } }, mockRes(), () => { ok = true; });
        assert.equal(ok, true);
    });
}

test("the offer-board reroll route is NOT registered (any method)", () => {
    const layer = router.stack.find((l) => l.route && l.route.path === "/offers/:fighterId/reroll");
    assert.equal(layer, undefined);
    assert.equal(fightController.rerollOffers, undefined);
});

// Fight Camp routes are keyed on :fightId and run ownFightParam("fightId") before the handler.
const campController = require("../../controllers/campController");

const CAMP_GUARDED = [
    ["get", "/camp/:fightId/report", campController.getReport],
    ["get", "/camp/:fightId", campController.getCampState],
    ["post", "/camp/:fightId/session", campController.addSession],
    ["post", "/camp/:fightId/remove-session", campController.removeSession],
    ["post", "/camp/:fightId/injury-choice", campController.resolveInjury],
    ["post", "/camp/:fightId/finalise", campController.finaliseCamp],
    ["put", "/camp/:fightId/buff", campController.selectBuff],
];

for (const [method, path, handler] of CAMP_GUARDED) {
    test(`${method.toUpperCase()} ${path} is exactly [ownFightParamGuard, handler]`, async () => {
        const route = findRoute(method, path);
        assert.ok(route, "route is registered");
        const handles = route.stack.map((l) => l.handle);
        assert.equal(handles.length, 2);
        assert.equal(handles[0].name, "ownFightParamGuard");
        assert.equal(handles[1], handler);

        // Keyed on :fightId: a malformed id is a 404 before any DB call and never reaches next().
        const res = mockRes();
        let nextCalled = false;
        await handles[0]({ user: { fighterId: "mine" }, params: { fightId: "not-an-id", fighterId: "mine" } }, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 404);
    });
}

test("GET /camp/:fightId/report is registered before GET /camp/:fightId", () => {
    const idx = (p) => router.stack.findIndex((l) => l.route && l.route.path === p && l.route.methods.get);
    assert.ok(idx("/camp/:fightId/report") >= 0);
    assert.ok(idx("/camp/:fightId/report") < idx("/camp/:fightId"));
});
