/**
 * GET /fighters/:id/moves/catalog must be registered, run ownFighter before the handler, and
 * sit ABOVE the /:id/moves/:moveId param route (otherwise "catalog" is swallowed as a moveId
 * and the client gets 404 "Unknown move"). Reads the Express router stack directly: no server,
 * no DB. (lib/redis.js is lazyConnect, so requiring the router opens no socket.)
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const router = require("../../routes/fighterRoutes");
const specialMovesController = require("../../controllers/specialMovesController");
const ownFighterMiddleware = require("../../middleware/ownFighterMiddleware");

function layerIndex(method, path) {
    return router.stack.findIndex((l) => l.route && l.route.path === path && l.route.methods[method]);
}

function mockRes() {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

test("GET /:id/moves/catalog is registered as [ownFighter, getCatalog]", () => {
    const idx = layerIndex("get", "/:id/moves/catalog");
    assert.ok(idx >= 0, "route is registered");
    const handles = router.stack[idx].route.stack.map((l) => l.handle);
    assert.equal(handles.length, 2);
    assert.equal(handles[0], ownFighterMiddleware);
    assert.equal(handles[1], specialMovesController.getCatalog);
});

test("the catalog route's guard 403s on a mismatch and calls next on a match", () => {
    const guard = router.stack[layerIndex("get", "/:id/moves/catalog")].route.stack[0].handle;

    const res = mockRes();
    let nextCalled = false;
    guard({ user: { fighterId: "mine" }, params: { id: "theirs" } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);

    const noFighter = mockRes();
    guard({ user: {}, params: { id: "mine" } }, noFighter, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(noFighter.statusCode, 403);

    let ok = false;
    guard({ user: { fighterId: "mine" }, params: { id: "mine" } }, mockRes(), () => { ok = true; });
    assert.equal(ok, true);
});

test("the catalog route precedes GET /:id/moves/:moveId", () => {
    const catalogIdx = layerIndex("get", "/:id/moves/catalog");
    const paramIdx = layerIndex("get", "/:id/moves/:moveId");
    assert.ok(catalogIdx >= 0 && paramIdx >= 0);
    assert.ok(catalogIdx < paramIdx, `catalog (${catalogIdx}) must be registered before :moveId (${paramIdx})`);

    // Behavioural check: the FIRST GET layer that matches the concrete URL is the catalog one.
    const first = router.stack.find((l) => l.route && l.route.methods.get && l.match("/f1/moves/catalog"));
    assert.equal(first.route.path, "/:id/moves/catalog");
});

test("the existing moves routes are unchanged", () => {
    const expect = [
        ["get", "/:id/moves", specialMovesController.listMoves],
        ["post", "/:id/moves/equip", specialMovesController.equipMove],
        ["post", "/:id/moves/unequip", specialMovesController.unequipMove],
        ["get", "/:id/moves/:moveId", specialMovesController.getMoveDetail],
    ];
    for (const [method, path, handler] of expect) {
        const idx = layerIndex(method, path);
        assert.ok(idx >= 0, `${method} ${path}`);
        const handles = router.stack[idx].route.stack.map((l) => l.handle);
        assert.deepEqual(handles, [ownFighterMiddleware, handler], `${method} ${path}`);
    }
});
