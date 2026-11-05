/**
 * /tutorial routes (first-session contract B.1): all four are ownership-guarded on
 * :fighterId and end at their controller. Reads the Express router stack directly and
 * drives the guard with mock req/res: no server, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const router = require("../../routes/tutorialRoutes");
const tutorialController = require("../../controllers/tutorialController");

function handlesOf(method, path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    assert.ok(layer, `${method.toUpperCase()} ${path} is registered`);
    return layer.route.stack.map((l) => l.handle);
}

function mockRes() {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

const ROUTES = [
    ["get", "/:fighterId", tutorialController.getTutorial],
    ["post", "/:fighterId/advance", tutorialController.advanceTutorial],
    ["post", "/:fighterId/complete", tutorialController.completeTutorial],
    ["post", "/:fighterId/tips/seen", tutorialController.markTipSeen],
];

for (const [method, path, handler] of ROUTES) {
    test(`${method.toUpperCase()} /tutorial${path}: ownership guard first, controller last`, () => {
        assert.equal(typeof handler, "function");
        const handles = handlesOf(method, path);
        assert.equal(handles.length, 2);
        assert.equal(handles[handles.length - 1], handler);

        const guard = handles[0];
        // Another account's fighter: 403, handler never reached.
        let res = mockRes();
        let nexted = false;
        guard({ user: { fighterId: "mine" }, params: { fighterId: "theirs" } }, res, () => { nexted = true; });
        assert.equal(res.statusCode, 403);
        assert.equal(nexted, false);
        // No fighter on the account: 403.
        res = mockRes();
        guard({ user: {}, params: { fighterId: "mine" } }, res, () => { nexted = true; });
        assert.equal(res.statusCode, 403);
        assert.equal(nexted, false);
        // Own fighter: passes.
        res = mockRes();
        guard({ user: { fighterId: "mine" }, params: { fighterId: "mine" } }, res, () => { nexted = true; });
        assert.equal(nexted, true);
        assert.equal(res.statusCode, null);
    });
}
