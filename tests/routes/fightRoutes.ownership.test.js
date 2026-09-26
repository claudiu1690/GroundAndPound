/**
 * The four offer-board routes must run ownFighterParam("fighterId") before the handler.
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
    ["post", "/offers/:fighterId/reroll", fightController.rerollOffers],
    ["post", "/accept/:fighterId/:fightId", fightController.acceptOffer],
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
