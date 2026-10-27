/**
 * Payments with NO Stripe keys configured (contract section f, case 9).
 *
 * The keys are cleared BEFORE config.js loads. dotenv never overrides a variable that already
 * exists, so an empty string here wins over whatever a developer's .env contains, and the
 * first assertion proves it. Stripe, the models, analytics and email are faked; nothing in
 * this file touches the network or a database.
 */
process.env.LOCAL_MODE = "true";
process.env.STRIPE_SECRET_KEY = "";
process.env.STRIPE_WEBHOOK_SECRET = "";
process.env.RESEND_API_KEY = "";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const { installPaymentFakes } = require("../fixtures/paymentFakes");
const fakes = installPaymentFakes();

// shopService.getCatalog also reads live energy (Redis) and fighterService; fake both.
const ROOT = path.resolve(__dirname, "../..");
function inject(rel, exports) {
    const abs = path.resolve(ROOT, rel);
    require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}
inject("services/energyService.js", { getEnergy: async () => ({ current: 10, max: 100 }) });
inject("services/fighterService.js", { toPublicFighter: (f) => f });

const config = require("../../config");

const FIGHTER_ID = "65f000000000000000000001";
const USER_ID = "65e000000000000000000001";

test("D0 the keys really are absent for this file", () => {
    assert.equal(config.stripe.enabled, false, "STRIPE_* must be unset here; .env must not leak in");
    assert.equal(config.stripe.secretKey, null);
});

test("D1 checkout answers payments_disabled (503) and never builds a Stripe client", async () => {
    fakes.reset();
    fakes.addUser({ _id: USER_ID, email: "buyer@example.com", isGuest: false, paymentsBlocked: false });
    fakes.addFighter({ _id: FIGHTER_ID, firstName: "Ana", lastName: "Silva" });
    const svc = require("../../services/paymentService");
    await assert.rejects(
        svc.createCheckoutSession(FIGHTER_ID, "drinks-15", USER_ID),
        (e) => e.code === "payments_disabled" && e.status === 503 && !/—/.test(e.message),
    );
    assert.equal(fakes.stripeCreates.length, 0);
    assert.equal(fakes.stripeKeys.length, 0, "no Stripe client constructed");
    assert.equal(fakes.purchases.length, 0);
});

test("D2 the controller maps payments_disabled to 503 with its code", async () => {
    const ctrl = require("../../controllers/paymentController");
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    const origError = console.error;
    console.error = () => {};
    try {
        await ctrl.createCheckout({ params: { id: FIGHTER_ID }, body: { bundleId: "drinks-15" }, user: { id: USER_ID } }, res);
    } finally {
        console.error = origError;
    }
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, "payments_disabled");
});

test("D3 purchase status still answers from Mongo with Stripe disabled", async () => {
    fakes.reset();
    fakes.addPurchase({ _id: "pur_1", stripeSessionId: "cs_test_x", userId: USER_ID, fighterId: FIGHTER_ID, bundleId: "drinks-6", amountCents: 499, currency: "usd", drinks: 6, status: "fulfilled" });
    const svc = require("../../services/paymentService");
    assert.deepEqual(await svc.getPurchaseStatus(FIGHTER_ID, USER_ID, "cs_test_x"), { status: "fulfilled", drinks: 6 });
});

test("D4 the catalog reports paymentsEnabled false, the soft cap, and no stub flag", async () => {
    fakes.reset();
    fakes.addFighter({ _id: FIGHTER_ID, firstName: "Ana", lastName: "Silva", iron: 0, inventory: { energyDrinks: 0, energyShots: 0 } });
    const shopService = require("../../services/shopService");
    const catalog = await shopService.getCatalog(FIGHTER_ID);
    assert.equal(catalog.paymentsEnabled, false);
    assert.equal(catalog.drinkSoftCap, 99);
    assert.ok(catalog.premiumBundles.length > 0);
    for (const row of catalog.premiumBundles) {
        assert.equal(row.stub, undefined, `${row.id} has no stub flag`);
        assert.deepEqual(
            Object.keys(row).filter((k) => k !== "popular").sort(),
            ["drinks", "id", "name", "priceLabel"],
            `${row.id} exposes only the contract fields (never amountCents)`,
        );
    }
    assert.equal(typeof shopService.buyPremium, "undefined", "the buy-premium stub is gone");
});
