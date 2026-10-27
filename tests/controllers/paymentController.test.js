/**
 * paymentController: input validation, error-code mapping and route wiring for the real-money
 * shop. No Express server, no DB, no Stripe: paymentService functions are stubbed as own
 * properties and restored, and a minimal res double records status and body.
 */
process.env.LOCAL_MODE = "true";
// Dummies so config never arms with a developer's real keys. The service is stubbed anyway.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_unit_tests";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy_for_unit_tests";
process.env.RESEND_API_KEY = "";

const { test } = require("node:test");
const assert = require("node:assert/strict");

// A fake Stripe module, so even an accidental client construction cannot reach the network.
require.cache[require.resolve("stripe")] = {
    id: require.resolve("stripe"), filename: require.resolve("stripe"), loaded: true,
    exports: () => { throw new Error("controller tests must never build a Stripe client"); },
};

const paymentService = require("../../services/paymentService");
const ctrl = require("../../controllers/paymentController");
const router = require("../../routes/fighterRoutes");
const ownFighter = require("../../middleware/ownFighterMiddleware");

const FIGHTER_ID = "65f000000000000000000001";
const USER_ID = "65e000000000000000000001";

function mockRes() {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

/** Run `fn` with paymentService[key] replaced, silencing console.error; always restores. */
async function withStub(key, impl, fn) {
    const orig = paymentService[key];
    const origErr = console.error;
    paymentService[key] = impl;
    console.error = () => {};
    try {
        return await fn();
    } finally {
        paymentService[key] = orig;
        console.error = origErr;
    }
}

const errWith = (code, message = "msg") => Object.assign(new Error(message), { code });

// ── checkout ────────────────────────────────────────────────────────────────

test("C1 checkout rejects a missing or non-string bundleId with 400 unknown_bundle before the service", async () => {
    let calls = 0;
    await withStub("createCheckoutSession", async () => { calls += 1; }, async () => {
        for (const body of [undefined, {}, { bundleId: "" }, { bundleId: 6 }, { bundleId: ["drinks-6"] }, { bundleId: { $ne: null } }]) {
            const res = mockRes();
            await ctrl.createCheckout({ params: { id: FIGHTER_ID }, body, user: { id: USER_ID } }, res);
            assert.equal(res.statusCode, 400, JSON.stringify(body));
            assert.equal(res.body.code, "unknown_bundle");
        }
    });
    assert.equal(calls, 0);
});

test("C2 checkout passes only the bundle id and the authenticated user to the service", async () => {
    let seen;
    await withStub("createCheckoutSession", async (...args) => { seen = args; return { url: "https://x", purchaseId: "p1" }; }, async () => {
        const res = mockRes();
        await ctrl.createCheckout({
            params: { id: FIGHTER_ID },
            body: { bundleId: "drinks-6", amountCents: 1, currency: "eur", userId: "someone-else" },
            user: { id: USER_ID },
        }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { url: "https://x", purchaseId: "p1" });
    });
    assert.deepEqual(seen, [FIGHTER_ID, "drinks-6", USER_ID]);
});

test("C3 every contract code maps to its status with { message, code }", async () => {
    const table = [
        ["unknown_bundle", 404], ["fighter_not_found", 404], ["account_required", 403],
        ["account_blocked", 403], ["payments_disabled", 503],
    ];
    for (const [code, status] of table) {
        await withStub("createCheckoutSession", async () => { throw errWith(code, `m-${code}`); }, async () => {
            const res = mockRes();
            await ctrl.createCheckout({ params: { id: FIGHTER_ID }, body: { bundleId: "drinks-6" }, user: { id: USER_ID } }, res);
            assert.equal(res.statusCode, status, code);
            assert.deepEqual(res.body, { message: `m-${code}`, code });
        });
    }
});

test("C4 a Stripe or unknown error is a generic 500 server_error that leaks nothing", async () => {
    const stripeErr = Object.assign(new Error("Invalid API Key provided: sk_test_****abcd"), { type: "StripeAuthenticationError", code: "api_key_invalid" });
    for (const err of [stripeErr, new Error("boom"), null]) {
        await withStub("createCheckoutSession", async () => { throw err; }, async () => {
            const res = mockRes();
            await ctrl.createCheckout({ params: { id: FIGHTER_ID }, body: { bundleId: "drinks-6" }, user: { id: USER_ID } }, res);
            assert.equal(res.statusCode, 500);
            assert.deepEqual(res.body, { message: "Something went wrong", code: "server_error" });
        });
    }
});

// ── purchase status ─────────────────────────────────────────────────────────

test("C5 a malformed :sessionId is 400 bad_session and never reaches the service", async () => {
    let calls = 0;
    await withStub("getPurchaseStatus", async () => { calls += 1; }, async () => {
        const bad = ["", "abc", "cs_", "cs_../../x", "cs_test%00", "cs_a-b", "pi_123", "CS_test_1", "cs_" + "a".repeat(201), "cs_test x"];
        for (const sessionId of bad) {
            const res = mockRes();
            await ctrl.getPurchaseStatus({ params: { id: FIGHTER_ID, sessionId }, user: { id: USER_ID } }, res);
            assert.equal(res.statusCode, 400, sessionId);
            assert.equal(res.body.code, "bad_session");
        }
    });
    assert.equal(calls, 0);
});

test("C6 a well-formed :sessionId is looked up for this fighter and this account", async () => {
    let seen;
    await withStub("getPurchaseStatus", async (...args) => { seen = args; return { status: "fulfilled", drinks: 15 }; }, async () => {
        const res = mockRes();
        const sessionId = "cs_test_a1B2c3_" + "z".repeat(185);
        await ctrl.getPurchaseStatus({ params: { id: FIGHTER_ID, sessionId }, user: { id: USER_ID } }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { status: "fulfilled", drinks: 15 });
        assert.deepEqual(seen, [FIGHTER_ID, USER_ID, sessionId]);
    });
});

test("C7 purchase_not_found is 404 and anything unexpected is 500", async () => {
    await withStub("getPurchaseStatus", async () => { throw errWith("purchase_not_found", "Purchase not found"); }, async () => {
        const res = mockRes();
        await ctrl.getPurchaseStatus({ params: { id: FIGHTER_ID, sessionId: "cs_test_1" }, user: { id: USER_ID } }, res);
        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { message: "Purchase not found", code: "purchase_not_found" });
    });
    await withStub("getPurchaseStatus", async () => { throw new Error("connection reset"); }, async () => {
        const res = mockRes();
        await ctrl.getPurchaseStatus({ params: { id: FIGHTER_ID, sessionId: "cs_test_1" }, user: { id: USER_ID } }, res);
        assert.equal(res.statusCode, 500);
        assert.equal(res.body.code, "server_error");
    });
});

// ── webhook ─────────────────────────────────────────────────────────────────

test("C8 webhook: bad signature 400, unknown event 200 handled:false, handler throw 500", async () => {
    await withStub("verifyWebhook", () => { throw errWith("bad_signature"); }, async () => {
        let handled = 0;
        await withStub("handleEvent", async () => { handled += 1; return { handled: true }; }, async () => {
            const res = mockRes();
            await ctrl.stripeWebhook({ body: Buffer.from("{}"), headers: {} }, res);
            assert.equal(res.statusCode, 400);
        });
        assert.equal(handled, 0, "nothing runs before verification");
    });

    await withStub("verifyWebhook", () => ({ id: "evt_1", type: "customer.created" }), async () => {
        await withStub("handleEvent", async () => ({ handled: false }), async () => {
            const res = mockRes();
            await ctrl.stripeWebhook({ body: Buffer.from("{}"), headers: { "stripe-signature": "x" } }, res);
            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.body, { received: true, handled: false });
        });
        await withStub("handleEvent", async () => { throw new Error("grant failed"); }, async () => {
            const res = mockRes();
            await ctrl.stripeWebhook({ body: Buffer.from("{}"), headers: { "stripe-signature": "x" } }, res);
            assert.equal(res.statusCode, 500);
        });
    });
});

// ── route wiring ────────────────────────────────────────────────────────────

function handlesOf(method, path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    assert.ok(layer, `${method.toUpperCase()} ${path} is registered`);
    return layer.route.stack.map((l) => l.handle);
}

test("C9 checkout and purchase status are mounted behind ownFighter; buy-premium is gone", () => {
    assert.deepEqual(handlesOf("post", "/:id/shop/checkout"), [ownFighter, ctrl.createCheckout]);
    assert.deepEqual(handlesOf("get", "/:id/shop/purchases/:sessionId"), [ownFighter, ctrl.getPurchaseStatus]);
    const premium = router.stack.find((l) => l.route && l.route.path === "/:id/shop/buy-premium");
    assert.equal(premium, undefined, "buy-premium route removed");
    assert.equal(require("../../controllers/shopController").buyPremium, undefined);
});
