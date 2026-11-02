/**
 * Shop redesign: POST /fighters/:id/shop/premium-seen.
 *
 * shopService.markPremiumPanelSeen must be ONE atomic findOneAndUpdate (never fighter.save,
 * which is not a mutex), decide `acknowledged` from the PRE-image, and track
 * premium_panel_shown only when a full panel was actually owed. The controller maps
 * 200 / 404 / 500. No DB: model statics and analytics are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const shopService = require("../../services/shopService");
const analyticsService = require("../../services/analyticsService");
const shopController = require("../../controllers/shopController");

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

async function quiet(body) {
    const orig = console.error;
    console.error = () => {};
    try { return await body(); } finally { console.error = orig; }
}

const FID = "507f1f77bcf86cd799439011";

function harness(preImage) {
    const calls = { fou: [], track: [], save: 0, findById: 0, updateOne: 0 };
    const stubs = [
        [Fighter, "findOneAndUpdate", async (...a) => { calls.fou.push(a); return preImage; }],
        [Fighter, "findById", async () => { calls.findById += 1; throw new Error("must not read-modify-save"); }],
        [Fighter, "updateOne", async () => { calls.updateOne += 1; throw new Error("must use findOneAndUpdate"); }],
        [analyticsService, "track", async (...a) => { calls.track.push(a); }],
    ];
    return { calls, stubs };
}

test("first visit: one atomic write clearing both flags, acknowledged, tracked with first_visit", async () => {
    const { calls, stubs } = harness({ premiumPanelSeen: false, premiumPanelReshowPending: false });
    const out = await withStubs(stubs, () => shopService.markPremiumPanelSeen(FID, "u1"));
    assert.deepEqual(out, { acknowledged: true });
    assert.equal(calls.fou.length, 1);
    const [filter, update, opts] = calls.fou[0];
    assert.deepEqual(filter, { _id: FID });
    assert.deepEqual(update, { $set: { premiumPanelSeen: true, premiumPanelReshowPending: false } });
    assert.equal(opts.new, false, "the pre-image decides acknowledged");
    assert.match(opts.projection, /premiumPanelSeen/);
    assert.match(opts.projection, /premiumPanelReshowPending/);
    assert.equal(calls.findById, 0);
    assert.deepEqual(calls.track, [["u1", "premium_panel_shown", { reason: "first_visit" }, { fighterId: FID }]]);
});

test("reshow pending: acknowledged with account_secured", async () => {
    const { calls, stubs } = harness({ premiumPanelSeen: true, premiumPanelReshowPending: true });
    const out = await withStubs(stubs, () => shopService.markPremiumPanelSeen(FID, "u1"));
    assert.deepEqual(out, { acknowledged: true });
    assert.deepEqual(calls.track[0][2], { reason: "account_secured" });
});

test("both flags owed: first_visit wins and the one write clears both", async () => {
    const { calls, stubs } = harness({ premiumPanelSeen: false, premiumPanelReshowPending: true });
    const out = await withStubs(stubs, () => shopService.markPremiumPanelSeen(FID, "u1"));
    assert.deepEqual(out, { acknowledged: true });
    assert.deepEqual(calls.track[0][2], { reason: "first_visit" });
    assert.deepEqual(calls.fou[0][1].$set, { premiumPanelSeen: true, premiumPanelReshowPending: false });
});

test("idempotent: already seen is acknowledged:false and tracks nothing", async () => {
    const { calls, stubs } = harness({ premiumPanelSeen: true, premiumPanelReshowPending: false });
    const out = await withStubs(stubs, () => shopService.markPremiumPanelSeen(FID, "u1"));
    assert.deepEqual(out, { acknowledged: false });
    assert.equal(calls.track.length, 0);
    assert.equal(calls.fou.length, 1);
});

test("missing fighter: Fighter not found, nothing tracked", async () => {
    const { calls, stubs } = harness(null);
    await withStubs(stubs, () => assert.rejects(() => shopService.markPremiumPanelSeen(FID, "u1"), /Fighter not found/));
    assert.equal(calls.track.length, 0);
});

test("a failing analytics write never fails the call", async () => {
    const stubs = [
        [Fighter, "findOneAndUpdate", async () => ({ premiumPanelSeen: false })],
        // track is contractually non-rejecting; even a synchronous throw-free resolve is all we rely on.
        [analyticsService, "track", async () => {}],
    ];
    const out = await withStubs(stubs, () => shopService.markPremiumPanelSeen(FID, "u1"));
    assert.deepEqual(out, { acknowledged: true });
});

test("controller: 200 {acknowledged}, body ignored, ids from params and token", async () => {
    let args = null;
    const res = mockRes();
    await withStubs([[shopService, "markPremiumPanelSeen", async (...a) => { args = a; return { acknowledged: true }; }]], () =>
        shopController.premiumSeen({ params: { id: FID }, body: { premiumPanelSeen: false, $set: 1 }, user: { id: "u1", fighterId: FID } }, res));
    assert.deepEqual(args, [FID, "u1"]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { acknowledged: true });

    const res2 = mockRes();
    await withStubs([[shopService, "markPremiumPanelSeen", async () => ({ acknowledged: false })]], () =>
        shopController.premiumSeen({ params: { id: FID }, user: { id: "u1", fighterId: FID } }, res2));
    assert.deepEqual(res2.body, { acknowledged: false });
});

test("controller: 404 Fighter not found; 500 hides internals", async () => {
    let res = mockRes();
    await withStubs([[shopService, "markPremiumPanelSeen", async () => { throw new Error("Fighter not found"); }]], () =>
        shopController.premiumSeen({ params: { id: FID }, user: { id: "u1" } }, res));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Fighter not found" });

    res = mockRes();
    await quiet(() => withStubs([[shopService, "markPremiumPanelSeen", async () => { throw new Error("mongo secret"); }]], () =>
        shopController.premiumSeen({ params: { id: FID }, user: { id: "u1" } }, res)));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});
