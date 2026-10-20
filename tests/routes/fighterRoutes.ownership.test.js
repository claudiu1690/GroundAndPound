/**
 * Every fighter-scoped write route on /fighters must run ownFighter before its handler, the
 * gym-writing routes must be [ownFighter, blockWhenGymsRetired, handler], the debug energy
 * routes must be gone, GET /:id (the full owner payload) must be [ownFighter, getById], and
 * the public reads must stay unguarded (the rival profile view and leaderboards depend on
 * them; /:id/profile serves non-owners the public projection). Reads the Express router stack directly: no server, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const router = require("../../routes/fighterRoutes");
const fighterController = require("../../controllers/fighterController");
const rankingController = require("../../controllers/rankingController");
const ownFighter = require("../../middleware/ownFighterMiddleware");
const blockWhenGymsRetired = require("../../middleware/gymsRetiredMiddleware");

function findRoute(method, path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    return layer ? layer.route : null;
}

function handlesOf(method, path) {
    const route = findRoute(method, path);
    assert.ok(route, `${method.toUpperCase()} ${path} is registered`);
    return route.stack.map((l) => l.handle);
}

function mockRes() {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

const OWNER_WRITES = [
    ["put", "/:id", fighterController.update],
    ["put", "/:id/pinned-badges", fighterController.setPinnedBadges],
    ["post", "/:id/badges/seen", fighterController.markBadgesSeen],
    ["put", "/:id/banner", fighterController.saveBanner],
    ["get", "/:id/callouts/roster", fighterController.getCalloutRoster],
    ["post", "/:id/callouts", fighterController.createCallout],
    ["delete", "/:id/callouts", fighterController.cancelCallout],
    ["post", "/:id/media-event", fighterController.mediaEventStub],
];

const GYM_WRITES = [
    ["post", "/:id/train", fighterController.train],
    ["post", "/:id/switch-gym", fighterController.switchGym],
    ["post", "/:id/rank-up-gym", fighterController.rankUpGym],
];

const GUARDED_READS = [
    ["get", "/:id", fighterController.getById],
];

const PUBLIC_READS = [
    ["get", "/", fighterController.list],
    ["get", "/leaderboard/notoriety", fighterController.notorietyLeaderboard],
    ["post", "/", fighterController.create],
    ["get", "/:id/champions", fighterController.getChampions],
    ["get", "/:id/rank", rankingController.getFighterRank],
    ["get", "/:id/activity", fighterController.getActivity],
    ["get", "/:id/profile", fighterController.getCareerProfile],
    ["get", "/:id/fame-events", fighterController.getFameEvents],
    ["get", "/:id/banner/catalog", fighterController.getBannerCatalog],
];

for (const [method, path, handler] of OWNER_WRITES) {
    test(`${method.toUpperCase()} ${path} runs ownFighter first and ends at its controller`, () => {
        assert.equal(typeof handler, "function", "controller fn exists");
        const handles = handlesOf(method, path);
        assert.equal(handles[0], ownFighter);
        assert.equal(handles[handles.length - 1], handler);
    });
}

for (const [method, path, handler] of GYM_WRITES) {
    test(`${method.toUpperCase()} ${path} is exactly [ownFighter, blockWhenGymsRetired, handler]`, () => {
        assert.equal(typeof handler, "function", "controller fn exists");
        assert.deepEqual(handlesOf(method, path), [ownFighter, blockWhenGymsRetired, handler]);
    });
}

test("the debug energy routes are not registered", () => {
    assert.equal(findRoute("patch", "/:id/energy"), null);
    assert.equal(findRoute("post", "/:id/debug/recharge-energy"), null);
    assert.equal(fighterController.deductEnergy, undefined);
    assert.equal(fighterController.debugRechargeEnergy, undefined);
});

for (const [method, path, handler] of GUARDED_READS) {
    test(`${method.toUpperCase()} ${path} is exactly [ownFighter, handler]`, () => {
        assert.equal(typeof handler, "function", "controller fn exists");
        assert.deepEqual(handlesOf(method, path), [ownFighter, handler]);
    });
}

for (const [method, path, handler] of PUBLIC_READS) {
    test(`${method.toUpperCase()} ${path} stays public (single handle)`, () => {
        assert.deepEqual(handlesOf(method, path), [handler]);
    });
}

test("ownFighter 403s on a mismatched id and on a missing fighterId, and calls next on a match", () => {
    const guard = handlesOf("put", "/:id")[0];

    const mismatch = mockRes();
    let nextCalled = false;
    guard({ user: { fighterId: "mine" }, params: { id: "theirs" } }, mismatch, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(mismatch.statusCode, 403);

    const noFighter = mockRes();
    guard({ user: {}, params: { id: "mine" } }, noFighter, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(noFighter.statusCode, 403);

    let ok = false;
    guard({ user: { fighterId: "mine" }, params: { id: "mine" } }, mockRes(), () => { ok = true; });
    assert.equal(ok, true);
});

test("GET /:id with a malformed id is 403 from the guard with no DB hit", () => {
    const Fighter = require("../../models/fighterModel");
    const fighterService = require("../../services/fighterService");
    const realFind = Fighter.findById;
    const realGet = fighterService.getFighterById;
    let dbHits = 0;
    Fighter.findById = () => { dbHits += 1; throw new Error("DB must not be touched"); };
    fighterService.getFighterById = async () => { dbHits += 1; throw new Error("service must not be called"); };
    try {
        const [guard] = handlesOf("get", "/:id");
        const res = mockRes();
        let nextCalled = false;
        guard({ user: { fighterId: "507f1f77bcf86cd799439011" }, params: { id: "not-an-objectid" } }, res, () => { nextCalled = true; });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
        assert.equal(dbHits, 0);
    } finally {
        Fighter.findById = realFind;
        fighterService.getFighterById = realGet;
    }
});
