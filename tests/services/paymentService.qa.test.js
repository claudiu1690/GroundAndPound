/**
 * QA audit tests for the real-money shop (added by QA, not by the dev agents).
 *
 *  Q1  A grant that throws leaves the purchase claimable (status endpoint does NOT say
 *      fulfilled), so Stripe's retry can deliver. (Fixed 2026-10-27: grant-first, idempotent per
 *      purchase via Fighter.paidPurchaseIds.)
 *  Q1b After a failed grant, the retries deliver the drinks exactly once.
 *  Q2  app.js mounts the raw-body webhook before every body parser / limiter (static scan, because
 *      requiring app.js would boot Sentry, Redis and Mongo).
 *  Q3  Every new analytics literal exists in the AnalyticsEvent enum.
 *
 * Nothing here touches the network, Mongo, Redis or a real Stripe key.
 */
process.env.LOCAL_MODE = "true";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_unit_tests";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy_for_unit_tests";
process.env.RESEND_API_KEY = "";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { installPaymentFakes } = require("../fixtures/paymentFakes");
const fakes = installPaymentFakes();

const USER_ID = "65e000000000000000000001";
const FIGHTER_ID = "65f000000000000000000001";

function seed() {
    fakes.reset();
    fakes.addUser({ _id: USER_ID, email: "buyer@example.com", isGuest: false, paymentsBlocked: false });
    const f = fakes.addFighter({ _id: FIGHTER_ID, firstName: "Ana", lastName: "Silva", nickname: "", inventory: { energyDrinks: 5 } });
    fakes.addPurchase({
        _id: "pur_q1", stripeSessionId: "cs_test_q1", userId: USER_ID, fighterId: FIGHTER_ID,
        bundleId: "drinks-15", amountCents: 999, currency: "usd", drinks: 15, status: "created",
    });
    return f;
}
const completed = (eventId) => ({
    id: eventId, type: "checkout.session.completed",
    data: { object: { id: "cs_test_q1", payment_status: "paid", payment_intent: "pi_q1", amount_total: 999, total_details: { amount_tax: 0 }, consent: { terms_of_service: "accepted" } } },
});

test("Q1 a grant that throws leaves the purchase claimable, so the status endpoint does not claim delivery", async () => {
    const fighter = seed();
    const svc = require("../../services/paymentService");
    const origErr = console.error;
    console.error = () => {};
    try {
        fakes.fighterUpdateImpl = async () => { throw new Error("mongo write timeout"); };
        // Delivery 1: handler throws, controller answers 500 so Stripe retries.
        await assert.rejects(svc.handleEvent(completed("evt_1")), /mongo write timeout/);
        assert.equal(fighter.inventory.energyDrinks, 5, "nothing landed");
        const p = fakes.purchases[0];
        assert.equal(p.status, "created", "still claimable");
        assert.match(p.lastError, /^grant failed/);
        assert.deepEqual(await svc.getPurchaseStatus(FIGHTER_ID, USER_ID, "cs_test_q1"), { status: "created", drinks: 15 },
            "client keeps showing pending, never a false Done");
    } finally {
        console.error = origErr;
    }
});

test("Q1b after a failed grant, the retries deliver the drinks exactly once", async () => {
    const fighter = seed();
    const svc = require("../../services/paymentService");
    const origErr = console.error;
    console.error = () => {};
    try {
        fakes.fighterUpdateImpl = async () => { throw new Error("mongo write timeout"); };
        await assert.rejects(svc.handleEvent(completed("evt_1")));
        fakes.fighterUpdateImpl = null;
        const r2 = await svc.handleEvent(completed("evt_2"));
        const r3 = await svc.handleEvent(completed("evt_3"));
        assert.equal(fighter.inventory.energyDrinks, 20, "5 + 15, once");
        assert.equal(r2.granted, true);
        assert.equal(r3.granted, false);
        assert.equal(fakes.purchases[0].status, "fulfilled");
        assert.equal(fakes.emails.length <= 1, true, "at most one receipt");
    } finally {
        console.error = origErr;
    }
});

test("Q1c a crash between grant and claim does not double-grant on the retry", async () => {
    const fighter = seed();
    const svc = require("../../services/paymentService");
    // Simulate: drinks credited, then the process died before the claim.
    fighter.inventory.energyDrinks = 20;
    fighter.paidPurchaseIds = ["pur_q1"];
    const r = await svc.handleEvent(completed("evt_retry"));
    assert.equal(fighter.inventory.energyDrinks, 20, "not granted again");
    assert.equal(fakes.purchases[0].status, "fulfilled", "claim completes on the retry");
    assert.equal(r.granted, true, "this delivery owns the side effects");
});

test("Q2 app.js mounts the raw webhook before express.json, urlencoded, globalLimiter and every router", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../app.js"), "utf8");
    const at = (needle) => {
        const i = src.indexOf(needle);
        assert.ok(i >= 0, `app.js contains ${needle}`);
        return i;
    };
    const hook = at('app.post("/webhooks/stripe", express.raw(');
    for (const later of ["app.use(express.json())", "app.use(express.urlencoded", "app.use(globalLimiter)", 'app.use("/fighters"', 'app.use("/auth"']) {
        assert.ok(hook < at(later), `webhook must be mounted before ${later}`);
    }
    // No auth middleware on the webhook line itself.
    const line = src.slice(hook, src.indexOf("\n", hook));
    assert.ok(!/authMiddleware|Limiter/.test(line), "webhook has no auth and no limiter");
    // Nothing that reads the body is mounted before it (helmet and cors do not).
    const before = src.slice(0, hook);
    const stripped = before.split("\n").filter((l) => { const t = l.trim(); return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")); }).join("\n");
    assert.ok(!["express.json", "bodyParser", "express.text", "urlencoded"].some((k) => stripped.includes(k)), "no body parser precedes the webhook");
});

test("Q3 new analytics event types are in the AnalyticsEvent enum", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../models/analyticsEventModel.js"), "utf8");
    for (const t of ["checkout_started", "checkout_blocked_guest", "purchase_fulfilled", "purchase_failed", "purchase_refunded"]) {
        assert.ok(src.includes(`"${t}"`) || src.includes(`'${t}'`), `${t} in enum`);
    }
});
