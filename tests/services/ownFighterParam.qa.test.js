/**
 * QA regression coverage for the ownFighterParam auth-guard fix
 * (middleware/ownFighterMiddleware.js) wired into routes/mediaRoutes.js and
 * controllers/fightController.js (postInterview / getInterviewCandidates).
 *
 * Pure middleware-logic test (no Express/DB harness needed) -- mirrors the
 * req/res shape the real middleware reads (req.user.fighterId, req.params[name]).
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const { ownFighterParam } = require("../../middleware/ownFighterMiddleware");

function mockRes() {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

test("ownFighterParam: owner match calls next() and sends no response", () => {
    const req = { user: { fighterId: "abc123" }, params: { fighterId: "abc123" } };
    const res = mockRes();
    let nextCalled = false;
    ownFighterParam("fighterId")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
});

test("ownFighterParam: mismatched fighterId returns 403 and never calls next()", () => {
    const req = { user: { fighterId: "abc123" }, params: { fighterId: "someone-elses-id" } };
    const res = mockRes();
    let nextCalled = false;
    ownFighterParam("fighterId")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
});

test("ownFighterParam: no fighter linked to account returns 403", () => {
    const req = { user: {}, params: { fighterId: "abc123" } };
    const res = mockRes();
    let nextCalled = false;
    ownFighterParam("fighterId")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
});

test("ownFighterParam: works with an arbitrary param name (not just :id)", () => {
    const req = { user: { fighterId: "xyz" }, params: { someParam: "xyz" } };
    const res = mockRes();
    let nextCalled = false;
    ownFighterParam("someParam")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
});
