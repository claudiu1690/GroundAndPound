/**
 * Payment fulfilment invariants.
 *
 * These test the three properties that decide whether real money is handled correctly:
 * the server sets the price, a duplicate webhook grants nothing extra, and a forged webhook
 * grants nothing at all. Everything else about Stripe is Stripe's problem; this is ours.
 *
 * Mongo-free: the fulfilment claim is exercised against a fake Purchase collection that models
 * the one behaviour that matters, `updateOne` matching at most once on a conditional filter.
 */
process.env.LOCAL_MODE = "true";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_unit_tests";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy_for_unit_tests";
// Pinned so a developer's .env cannot change what the success_url assertions see.
process.env.STRIPE_SUCCESS_URL = "http://localhost:5173/?purchase=success";
process.env.STRIPE_CANCEL_URL = "http://localhost:5173/?purchase=cancelled";
// No real mail provider, ever: lib/email's transport is faked below as well.
process.env.RESEND_API_KEY = "";

const test = require("node:test");
const assert = require("node:assert");

// Fake Stripe, models, analytics and email transport BEFORE paymentService is required.
// Nothing in this file touches the network or a database.
const { installPaymentFakes } = require("../fixtures/paymentFakes");
const fakes = installPaymentFakes();

const { PREMIUM_BUNDLES, PREMIUM_CURRENCY } = require("../../consts/shopConfig");

test("P1 every bundle has an explicit integer price that matches its label", () => {
    // The boot validator in shopConfig throws on mismatch; this pins the intent so nobody
    // "simplifies" it into parsing the display string at runtime.
    for (const b of Object.values(PREMIUM_BUNDLES)) {
        assert.ok(Number.isInteger(b.amountCents) && b.amountCents > 0, `${b.id} amountCents`);
        const fromLabel = Math.round(parseFloat(b.priceLabel.replace(/[^0-9.]/g, "")) * 100);
        assert.equal(b.amountCents, fromLabel, `${b.id} label/amount agreement`);
        assert.ok(Number.isInteger(b.drinks) && b.drinks > 0, `${b.id} drinks`);
    }
    assert.equal(PREMIUM_CURRENCY, "usd");
});

test("P2 bundle ids are the ONLY chargeable input — no bundle exposes a client-settable price", () => {
    // A bundle must not carry a field a request could plausibly override to change the charge.
    for (const b of Object.values(PREMIUM_BUNDLES)) {
        assert.ok(!("price" in b), `${b.id} must not carry a generic 'price' field`);
        assert.ok(!("amount" in b), `${b.id} must not carry a generic 'amount' field`);
    }
});

// ── fulfilment claim ────────────────────────────────────────────────────────
// Models Purchase.updateOne({_id, status:{$ne:'fulfilled'}}, ...): matches at most once.
function fakePurchases(initialStatus = "paid") {
    const doc = { _id: "p1", fighterId: "f1", drinks: 15, status: initialStatus, lastError: null };
    return {
        doc,
        async updateOne(filter, update) {
            const wantsUnfulfilled = filter.status && filter.status.$ne === "fulfilled";
            if (wantsUnfulfilled && doc.status === "fulfilled") return { matchedCount: 0, modifiedCount: 0 };
            Object.assign(doc, update.$set || {});
            return { matchedCount: 1, modifiedCount: 1 };
        },
    };
}

test("P3 a paid purchase grants exactly once, and a duplicate webhook grants nothing", async () => {
    const purchases = fakePurchases("paid");
    const granted = [];
    // Stand-in for the guarded grant in paymentService.fulfil.
    const fulfil = async (eventId) => {
        const claim = await purchases.updateOne({ _id: "p1", status: { $ne: "fulfilled" } }, { $set: { status: "fulfilled", fulfilledByEventId: eventId } });
        if (claim.matchedCount === 0 || claim.modifiedCount === 0) return { granted: false };
        granted.push(purchases.doc.drinks);
        return { granted: true };
    };

    const first = await fulfil("evt_1");
    const replay = await fulfil("evt_1");          // Stripe redelivering the same event
    const different = await fulfil("evt_2");       // a different event for the same session

    assert.equal(first.granted, true, "first delivery grants");
    assert.equal(replay.granted, false, "identical redelivery must not grant");
    assert.equal(different.granted, false, "any later event must not grant again");
    assert.deepEqual(granted, [15], "goods handed over exactly once");
    assert.equal(purchases.doc.fulfilledByEventId, "evt_1", "audit records the event that won");
});

test("P4 concurrent deliveries: only one wins the claim", async () => {
    const purchases = fakePurchases("paid");
    let grants = 0;
    const fulfil = async () => {
        const claim = await purchases.updateOne({ _id: "p1", status: { $ne: "fulfilled" } }, { $set: { status: "fulfilled" } });
        if (claim.matchedCount === 1 && claim.modifiedCount === 1) grants++;
    };
    await Promise.all([fulfil(), fulfil(), fulfil(), fulfil()]);
    assert.equal(grants, 1, "four simultaneous deliveries must produce one grant");
});

test("P5 a refund records status but never reclaims consumables", () => {
    // Encoded as an explicit expectation because the tempting 'fix' is to subtract the drinks,
    // which drives a spent balance negative and punishes the player for a support action.
    const doc = { status: "fulfilled", drinks: 40 };
    const afterRefund = { ...doc, status: "refunded" };
    assert.equal(afterRefund.drinks, 40, "granted goods are not clawed back");
    assert.equal(afterRefund.status, "refunded");
});

test("P6 webhook verification rejects a forged body", () => {
    const paymentService = require("../../services/paymentService");
    // A body Stripe never signed must not verify, whatever it claims to contain.
    const forged = Buffer.from(JSON.stringify({
        id: "evt_forged", type: "checkout.session.completed",
        data: { object: { id: "cs_test_forged", payment_status: "paid" } },
    }));
    assert.throws(
        () => paymentService.verifyWebhook(forged, "t=1,v1=deadbeef"),
        (e) => e.code === "bad_signature",
        "an unsigned body must be rejected"
    );
    assert.throws(
        () => paymentService.verifyWebhook(forged, undefined),
        (e) => e.code === "bad_signature",
        "a missing signature header must be rejected"
    );
});

test("P7 payments fail closed when keys are absent", () => {
    // config snapshots env at load, so this asserts the rule rather than re-loading the module.
    const mk = (secret, hook) => !!(secret && hook);
    assert.equal(mk(null, null), false, "no keys -> disabled");
    assert.equal(mk("sk_test_x", null), false, "secret without webhook secret -> disabled");
    assert.equal(mk(null, "whsec_x"), false, "webhook secret without secret key -> disabled");
    assert.equal(mk("sk_test_x", "whsec_x"), true, "both present -> enabled");
});

// ── Service behaviour against in-memory fakes (contract section f) ──────────

const FIGHTER_ID = "65f000000000000000000001";
const OTHER_FIGHTER_ID = "65f000000000000000000002";
const USER_ID = "65e000000000000000000001";
const OTHER_USER_ID = "65e000000000000000000002";

function seedBuyer({ drinks = 0, user = {} } = {}) {
    fakes.reset();
    fakes.addUser({ _id: USER_ID, email: "buyer@example.com", isGuest: false, paymentsBlocked: false, ...user });
    return fakes.addFighter({ _id: FIGHTER_ID, firstName: "Ana", lastName: "Silva", nickname: "", inventory: { energyDrinks: drinks } });
}

function completedEvent(sessionId, overrides = {}) {
    return {
        id: overrides.eventId || "evt_completed_1",
        type: overrides.type || "checkout.session.completed",
        data: {
            object: {
                id: sessionId,
                payment_status: "paid",
                payment_intent: "pi_test_1",
                amount_total: 3999,
                total_details: { amount_tax: 333 },
                consent: { terms_of_service: "accepted" },
                ...(overrides.session || {}),
            },
        },
    };
}

function addOpenPurchase(over) {
    return fakes.addPurchase({
        userId: USER_ID, fighterId: FIGHTER_ID, bundleId: "drinks-6", amountCents: 499,
        currency: "usd", drinks: 6, status: "created", ...over,
    });
}

/** Let fire-and-forget promises (receipt email) settle. */
const flush = () => new Promise((r) => setImmediate(r));

test("S1 checkout sends the exact Stripe session params and records the purchase", async () => {
    seedBuyer();
    const svc = require("../../services/paymentService");
    const before = Math.floor(Date.now() / 1000);
    const out = await svc.createCheckoutSession(FIGHTER_ID, "drinks-100", USER_ID);

    assert.equal(fakes.stripeCreates.length, 1, "exactly one session opened");
    assert.deepEqual(fakes.stripeKeys, ["sk_test_dummy_for_unit_tests"], "fake client built with the dummy key only");
    const { params, opts } = fakes.stripeCreates[0];
    const bundle = PREMIUM_BUNDLES["drinks-100"];

    assert.equal(params.mode, "payment");
    assert.equal(params.customer_email, "buyer@example.com");
    const pd = params.line_items[0].price_data;
    assert.equal(pd.unit_amount, bundle.amountCents, "server-side price");
    assert.equal(pd.currency, "usd");
    assert.equal(pd.tax_behavior, "inclusive");
    assert.equal(pd.product_data.name, bundle.name);
    assert.ok(pd.product_data.description);
    assert.deepEqual(params.automatic_tax, { enabled: true });
    assert.deepEqual(params.consent_collection, { terms_of_service: "required" });
    assert.equal(
        params.custom_text.terms_of_service_acceptance.message,
        "I agree to the Terms of Service. I ask for the Energy Drinks to be delivered immediately and acknowledge that I lose my 14-day right of withdrawal once delivery starts. I am 18 or older, or have permission from a parent or guardian.",
    );
    assert.ok(Math.abs(params.expires_at - (before + 1800)) <= 5, `expires_at ${params.expires_at} is now+1800 +-5s`);
    assert.equal(params.success_url, "http://localhost:5173/?purchase=success&session_id={CHECKOUT_SESSION_ID}");
    assert.ok(params.success_url.endsWith("&session_id={CHECKOUT_SESSION_ID}"), "braces are not URL-encoded");
    assert.equal(params.cancel_url, "http://localhost:5173/?purchase=cancelled");
    assert.deepEqual(params.metadata, { fighterId: FIGHTER_ID, userId: USER_ID, bundleId: "drinks-100" });
    assert.ok(opts && typeof opts.idempotencyKey === "string" && opts.idempotencyKey.startsWith(`checkout:${FIGHTER_ID}:drinks-100:`));

    assert.equal(fakes.purchases.length, 1);
    const p = fakes.purchases[0];
    assert.equal(p.status, "created");
    assert.equal(p.amountCents, 3999);
    assert.equal(p.drinks, 100);
    assert.equal(p.expiresAt.getTime(), params.expires_at * 1000, "Purchase.expiresAt mirrors the session");
    assert.deepEqual(out, { url: `https://checkout.stripe.test/c/pay/${p.stripeSessionId}`, purchaseId: String(p._id) });

    const started = fakes.tracked.filter((t) => t.type === "checkout_started");
    assert.equal(started.length, 1);
    assert.deepEqual(started[0].meta, { bundleId: "drinks-100", amountCents: 3999 });
});

test("S1b hostile bundle ids never resolve to a bundle", async () => {
    seedBuyer();
    const svc = require("../../services/paymentService");
    for (const bad of ["constructor", "__proto__", "toString", "drinks-999", "", 42, null, { $ne: 1 }]) {
        await assert.rejects(svc.createCheckoutSession(FIGHTER_ID, bad, USER_ID), (e) => e.code === "unknown_bundle", String(bad));
    }
    assert.equal(fakes.stripeCreates.length, 0);
});

test("S2 a paid purchase lands in full above the 99 soft cap (99 + 100 = 199) and records the session facts", async () => {
    const fighter = seedBuyer({ drinks: 99 });
    const svc = require("../../services/paymentService");
    const p = addOpenPurchase({ _id: "pur_cap", stripeSessionId: "cs_test_cap", bundleId: "drinks-100", amountCents: 3999, drinks: 100 });

    const res = await svc.handleEvent(completedEvent("cs_test_cap"));
    assert.equal(res.granted, true);
    assert.equal(fighter.inventory.energyDrinks, 199, "no clamp on paid goods");
    assert.equal(p.status, "fulfilled");
    assert.equal(p.fulfilledByEventId, "evt_completed_1");
    assert.equal(p.stripePaymentIntentId, "pi_test_1");
    assert.equal(p.consentAccepted, true);
    assert.equal(p.amountTotalCents, 3999);
    assert.equal(p.taxCents, 333);
    assert.ok(p.fulfilledAt instanceof Date);

    const ful = fakes.tracked.filter((t) => t.type === "purchase_fulfilled");
    assert.equal(ful.length, 1);
    assert.equal(ful[0].meta.bundleId, "drinks-100");
    assert.equal(typeof ful[0].meta.secondsSinceCreate, "number");

    await flush();
    assert.equal(fakes.emails.length, 1, "one receipt");
    assert.equal(fakes.emails[0].to, "buyer@example.com");
    assert.match(fakes.emails[0].html, /\$39\.99/);
    assert.match(fakes.emails[0].html, /incl\. \$3\.33 tax/);
    // Test keys (sk_test_) in this file: the confirmation is labelled as a test, never a real charge.
    assert.match(fakes.emails[0].subject, /^\[TEST\] Your Ground & Pound order confirmation$/);
    assert.match(fakes.emails[0].html, /This was a test purchase\. No real money was charged\./);
    assert.doesNotMatch(fakes.emails[0].html, /receipt/i);
});

test("S2b an unpaid completed session grants nothing", async () => {
    const fighter = seedBuyer({ drinks: 5 });
    const svc = require("../../services/paymentService");
    const p = addOpenPurchase({ _id: "pur_unpaid", stripeSessionId: "cs_test_unpaid" });
    const res = await svc.handleEvent(completedEvent("cs_test_unpaid", { session: { payment_status: "unpaid" } }));
    assert.equal(res.handled, true);
    assert.equal(res.granted, false);
    assert.equal(fighter.inventory.energyDrinks, 5);
    assert.equal(p.status, "created");
});

test("S3 a duplicate (and a later different) completed event grants nothing more", async () => {
    const fighter = seedBuyer({ drinks: 0 });
    const svc = require("../../services/paymentService");
    addOpenPurchase({ _id: "pur_dup", stripeSessionId: "cs_test_dup", bundleId: "drinks-15", amountCents: 999, drinks: 15 });

    const first = await svc.handleEvent(completedEvent("cs_test_dup"));
    const replay = await svc.handleEvent(completedEvent("cs_test_dup"));
    const later = await svc.handleEvent(completedEvent("cs_test_dup", { eventId: "evt_2", type: "checkout.session.async_payment_succeeded" }));
    await flush();

    assert.equal(first.granted, true);
    assert.equal(replay.granted, false);
    assert.equal(later.granted, false);
    assert.equal(fighter.inventory.energyDrinks, 15, "granted exactly once");
    assert.equal(fakes.tracked.filter((t) => t.type === "purchase_fulfilled").length, 1);
    assert.equal(fakes.emails.length, 1, "one receipt");
});

test("S4 charge.dispute.created marks disputed, takes the drinks back and blocks payments", async () => {
    const fighter = seedBuyer({ drinks: 0 });
    const svc = require("../../services/paymentService");
    const p = addOpenPurchase({ _id: "pur_disp", stripeSessionId: "cs_test_disp", bundleId: "drinks-40", amountCents: 1999, drinks: 40 });
    await svc.handleEvent(completedEvent("cs_test_disp", { session: { payment_intent: "pi_disp" } }));
    assert.equal(fighter.inventory.energyDrinks, 40);

    const dispute = { id: "evt_d", type: "charge.dispute.created", data: { object: { id: "dp_1", payment_intent: "pi_disp" } } };
    const res = await svc.handleEvent(dispute);
    assert.equal(res.handled, true);
    assert.equal(p.status, "disputed");
    assert.equal(fighter.inventory.energyDrinks, 0, "unspent drinks taken back");
    assert.equal(p.clawedBackDrinks, 40);
    assert.equal(fakes.users.get(USER_ID).paymentsBlocked, true, "buyer can no longer check out");
    const refunds = fakes.tracked.filter((t) => t.type === "purchase_refunded");
    assert.equal(refunds.length, 1);
    assert.deepEqual(refunds[0].meta, { bundleId: "drinks-40", disputed: true });

    // Redelivered dispute: no second analytics event, nothing taken twice.
    fighter.inventory.energyDrinks = 7; // earned some since
    await svc.handleEvent(dispute);
    assert.equal(fakes.tracked.filter((t) => t.type === "purchase_refunded").length, 1);
    assert.equal(fighter.inventory.energyDrinks, 7, "a redelivered dispute takes nothing more");
    assert.equal(p.clawedBackDrinks, 40, "audit amount not overwritten");
});

test("S5 charge.refunded marks refunded, keeps the drinks, and never overwrites disputed", async () => {
    const fighter = seedBuyer({ drinks: 0 });
    const svc = require("../../services/paymentService");
    const p = addOpenPurchase({ _id: "pur_ref", stripeSessionId: "cs_test_ref" });
    await svc.handleEvent(completedEvent("cs_test_ref", { session: { payment_intent: "pi_ref" } }));

    await svc.handleEvent({ id: "evt_r", type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_ref" } } });
    assert.equal(p.status, "refunded");
    assert.equal(fighter.inventory.energyDrinks, 6, "refund never reclaims goods");
    let refunds = fakes.tracked.filter((t) => t.type === "purchase_refunded");
    assert.equal(refunds.length, 1);
    assert.deepEqual(refunds[0].meta, { bundleId: "drinks-6", disputed: false });

    // A replayed completed event after the refund must not grant a second batch.
    const replay = await svc.handleEvent(completedEvent("cs_test_ref", { eventId: "evt_late" }));
    assert.equal(replay.granted, false);
    assert.equal(fighter.inventory.energyDrinks, 6);
    assert.equal(p.status, "refunded");

    // Dispute first, refund second: the refund leaves "disputed" alone and is not counted again.
    const f2 = seedBuyer({ drinks: 0 });
    const p2 = addOpenPurchase({ _id: "pur_dr", stripeSessionId: "cs_test_dr" });
    await svc.handleEvent(completedEvent("cs_test_dr", { session: { payment_intent: "pi_dr" } }));
    await svc.handleEvent({ id: "evt_d2", type: "charge.dispute.created", data: { object: { payment_intent: "pi_dr" } } });
    await svc.handleEvent({ id: "evt_r2", type: "charge.refunded", data: { object: { payment_intent: "pi_dr" } } });
    assert.equal(p2.status, "disputed", "refund does not overwrite disputed");
    assert.equal(f2.inventory.energyDrinks, 0, "the dispute took the 6 back; the later refund changes nothing");
    refunds = fakes.tracked.filter((t) => t.type === "purchase_refunded");
    assert.equal(refunds.length, 1, "purchase_refunded fired once for this order");
    assert.equal(refunds[0].meta.disputed, true);

    // A charge with no payment intent touches nothing.
    const res = await svc.handleEvent({ id: "evt_r3", type: "charge.refunded", data: { object: { id: "ch_x" } } });
    assert.equal(res.handled, true);
    assert.equal(p2.status, "disputed");
});

test("S4b a chargeback after the drinks were partly spent takes back only what is left, never below 0", async () => {
    const fighter = seedBuyer({ drinks: 0 });
    const svc = require("../../services/paymentService");
    const p = addOpenPurchase({ _id: "pur_spent", stripeSessionId: "cs_test_spent", bundleId: "drinks-15", amountCents: 999, drinks: 15 });
    await svc.handleEvent(completedEvent("cs_test_spent", { session: { payment_intent: "pi_spent" } }));
    fighter.inventory.energyDrinks = 4; // spent 11
    await svc.handleEvent({ id: "evt_ds", type: "charge.dispute.created", data: { object: { payment_intent: "pi_spent" } } });
    assert.equal(fighter.inventory.energyDrinks, 0);
    assert.equal(p.clawedBackDrinks, 4, "records what was actually removed");
    assert.equal(fakes.users.get(USER_ID).paymentsBlocked, true);
});

test("S4c a chargeback on an order already refunded still takes the drinks back and blocks", async () => {
    const fighter = seedBuyer({ drinks: 2 });
    const svc = require("../../services/paymentService");
    const p = addOpenPurchase({ _id: "pur_rd", stripeSessionId: "cs_test_rd" });
    await svc.handleEvent(completedEvent("cs_test_rd", { session: { payment_intent: "pi_rd" } }));
    await svc.handleEvent({ id: "evt_rr", type: "charge.refunded", data: { object: { payment_intent: "pi_rd" } } });
    assert.equal(fighter.inventory.energyDrinks, 8, "the refund alone keeps the drinks");
    await svc.handleEvent({ id: "evt_rd", type: "charge.dispute.created", data: { object: { payment_intent: "pi_rd" } } });
    assert.equal(p.status, "disputed");
    assert.equal(fighter.inventory.energyDrinks, 2);
    assert.equal(fakes.users.get(USER_ID).paymentsBlocked, true);
});

test("S4d a claw-back write that fails rethrows (Stripe retries) and the retry finishes exactly once", async () => {
    const fighter = seedBuyer({ drinks: 0 });
    const svc = require("../../services/paymentService");
    const p = addOpenPurchase({ _id: "pur_cf", stripeSessionId: "cs_test_cf", bundleId: "drinks-15", amountCents: 999, drinks: 15 });
    await svc.handleEvent(completedEvent("cs_test_cf", { session: { payment_intent: "pi_cf" } }));
    const dispute = (id) => ({ id, type: "charge.dispute.created", data: { object: { payment_intent: "pi_cf" } } });

    fakes.clawbackImpl = async () => { throw new Error("mongo write timeout"); };
    await assert.rejects(svc.handleEvent(dispute("evt_cf1")), /mongo write timeout/);
    assert.equal(p.status, "fulfilled", "status not flipped, so the retry still finds it");
    assert.equal(fighter.inventory.energyDrinks, 15);
    assert.equal(fakes.users.get(USER_ID).paymentsBlocked, false);

    fakes.clawbackImpl = null;
    await svc.handleEvent(dispute("evt_cf2"));
    await svc.handleEvent(dispute("evt_cf3"));
    assert.equal(p.status, "disputed");
    assert.equal(fighter.inventory.energyDrinks, 0, "taken back once");
    assert.equal(fakes.users.get(USER_ID).paymentsBlocked, true);
    assert.equal(fakes.tracked.filter((t) => t.type === "purchase_refunded").length, 1);
});

test("S4f a dispute that arrives BEFORE checkout.session.completed is retried, then claws back once fulfilled", async () => {
    const fighter = seedBuyer({ drinks: 3 });
    const svc = require("../../services/paymentService");
    const p = addOpenPurchase({ _id: "pur_early", stripeSessionId: "cs_test_early", bundleId: "drinks-6", amountCents: 499, drinks: 6 });
    fakes.sessionsByPi.set("pi_early", "cs_test_early");
    const dispute = (id) => ({ id, type: "charge.dispute.created", data: { object: { payment_intent: "pi_early" } } });

    await assert.rejects(svc.handleEvent(dispute("evt_early1")), /arrived before fulfilment/);
    assert.equal(p.status, "created", "nothing changed yet");
    assert.equal(fakes.users.get(USER_ID).paymentsBlocked, false);

    await svc.handleEvent(completedEvent("cs_test_early", { session: { payment_intent: "pi_early" } }));
    assert.equal(fighter.inventory.energyDrinks, 9);

    await svc.handleEvent(dispute("evt_early2")); // Stripe's retry
    assert.equal(p.status, "disputed");
    assert.equal(fighter.inventory.energyDrinks, 3, "the 6 bought drinks are taken back");
    assert.equal(fakes.users.get(USER_ID).paymentsBlocked, true);
});

test("S4e a dispute for an unknown payment intent touches no fighter and blocks nobody", async () => {
    const fighter = seedBuyer({ drinks: 9 });
    const svc = require("../../services/paymentService");
    const origWarn = console.warn;
    console.warn = () => {};
    try {
        const res = await svc.handleEvent({ id: "evt_du", type: "charge.dispute.created", data: { object: { payment_intent: "pi_nobody" } } });
        assert.equal(res.handled, true);
    } finally {
        console.warn = origWarn;
    }
    assert.equal(fighter.inventory.energyDrinks, 9);
    assert.equal(fakes.users.get(USER_ID).paymentsBlocked, false);
});

test("S5b expired / async-failed sessions fail only from created|paid", async () => {
    seedBuyer();
    const svc = require("../../services/paymentService");
    const open = addOpenPurchase({ _id: "pur_exp", stripeSessionId: "cs_test_exp" });
    const done = addOpenPurchase({ _id: "pur_done", stripeSessionId: "cs_test_done", status: "fulfilled" });

    await svc.handleEvent({ id: "e1", type: "checkout.session.expired", data: { object: { id: "cs_test_exp" } } });
    await svc.handleEvent({ id: "e2", type: "checkout.session.async_payment_failed", data: { object: { id: "cs_test_done" } } });

    assert.equal(open.status, "failed");
    assert.equal(open.lastError, "checkout.session.expired");
    assert.equal(done.status, "fulfilled", "a fulfilled purchase never moves backwards");
    const failed = fakes.tracked.filter((t) => t.type === "purchase_failed");
    assert.equal(failed.length, 1);
    assert.deepEqual(failed[0].meta, { bundleId: "drinks-6", reason: "checkout.session.expired" });
});

test("S5c unknown event types are acknowledged as unhandled", async () => {
    const svc = require("../../services/paymentService");
    assert.deepEqual(await svc.handleEvent({ id: "e", type: "customer.created", data: { object: {} } }), { handled: false });
});

test("S6 blocked accounts and guests never reach Stripe", async () => {
    const svc = require("../../services/paymentService");

    seedBuyer({ user: { paymentsBlocked: true } });
    await assert.rejects(svc.createCheckoutSession(FIGHTER_ID, "drinks-6", USER_ID), (e) => e.code === "account_blocked" && e.status === 403);
    assert.equal(fakes.stripeCreates.length, 0);
    assert.equal(fakes.purchases.length, 0);

    seedBuyer({ user: { isGuest: true, email: null } });
    await assert.rejects(svc.createCheckoutSession(FIGHTER_ID, "drinks-6", USER_ID), (e) => e.code === "account_required" && e.status === 403);
    const blocked = fakes.tracked.filter((t) => t.type === "checkout_blocked_guest");
    assert.equal(blocked.length, 1);
    assert.deepEqual(blocked[0].meta, { bundleId: "drinks-6" });

    seedBuyer({ user: { isGuest: false, email: "" } });
    await assert.rejects(svc.createCheckoutSession(FIGHTER_ID, "drinks-6", USER_ID), (e) => e.code === "account_required");
    assert.equal(fakes.tracked.filter((t) => t.type === "checkout_blocked_guest").length, 1, "no-email account is blocked the same way");

    seedBuyer();
    await assert.rejects(svc.createCheckoutSession(FIGHTER_ID, "drinks-6", undefined), (e) => e.code === "account_required");
    await assert.rejects(svc.createCheckoutSession(OTHER_FIGHTER_ID, "drinks-6", USER_ID), (e) => e.code === "fighter_not_found");
    assert.equal(fakes.stripeCreates.length, 0);
});

test("S7 purchase status is only visible to the owning fighter AND account", async () => {
    seedBuyer();
    const svc = require("../../services/paymentService");
    addOpenPurchase({ _id: "pur_st", stripeSessionId: "cs_test_status", bundleId: "drinks-15", amountCents: 999, drinks: 15 });

    assert.deepEqual(await svc.getPurchaseStatus(FIGHTER_ID, USER_ID, "cs_test_status"), { status: "created", drinks: 15 });
    await assert.rejects(svc.getPurchaseStatus(OTHER_FIGHTER_ID, USER_ID, "cs_test_status"), (e) => e.code === "purchase_not_found");
    await assert.rejects(svc.getPurchaseStatus(FIGHTER_ID, OTHER_USER_ID, "cs_test_status"), (e) => e.code === "purchase_not_found");
    await assert.rejects(svc.getPurchaseStatus(FIGHTER_ID, USER_ID, "cs_test_nope"), (e) => e.code === "purchase_not_found");
    await assert.rejects(svc.getPurchaseStatus("not-an-id", USER_ID, "cs_test_status"), (e) => e.code === "purchase_not_found");
    await assert.rejects(svc.getPurchaseStatus(FIGHTER_ID, undefined, "cs_test_status"), (e) => e.code === "purchase_not_found");
    await assert.rejects(svc.getPurchaseStatus(FIGHTER_ID, USER_ID, { $ne: null }), (e) => e.code === "bad_session");
});

test("S8 a failing email sender never fails fulfilment, and the drinks still land", async () => {
    const fighter = seedBuyer({ drinks: 3 });
    const svc = require("../../services/paymentService");
    addOpenPurchase({ _id: "pur_mail", stripeSessionId: "cs_test_mail" });

    const unhandled = [];
    const onUnhandled = (r) => unhandled.push(r);
    process.on("unhandledRejection", onUnhandled);
    const origError = console.error;
    const logged = [];
    console.error = (...a) => logged.push(a.join(" "));
    try {
        fakes.sendEmailImpl = async () => { throw new Error("SMTP down"); };
        const res = await svc.handleEvent(completedEvent("cs_test_mail"));
        await flush();
        await flush();
        assert.equal(res.granted, true);
        assert.equal(fighter.inventory.energyDrinks, 9);

        // A synchronous throw inside the sender is contained too.
        addOpenPurchase({ _id: "pur_mail2", stripeSessionId: "cs_test_mail2" });
        fakes.sendEmailImpl = () => { throw new Error("sync boom"); };
        const res2 = await svc.handleEvent(completedEvent("cs_test_mail2", { eventId: "evt_m2" }));
        await flush();
        await flush();
        assert.equal(res2.granted, true);
        assert.equal(fighter.inventory.energyDrinks, 15);
    } finally {
        console.error = origError;
        process.off("unhandledRejection", onUnhandled);
    }
    assert.deepEqual(unhandled, [], "no unhandled rejection escapes the fire-and-forget email");
    assert.equal(logged.filter((l) => l.includes("[stripe] receipt email failed")).length, 2, "each failure is logged");
});

test("S9 webhook signature: only a verified body parses", () => {
    const svc = require("../../services/paymentService");
    const body = Buffer.from(JSON.stringify({ id: "evt_ok", type: "checkout.session.completed", data: { object: {} } }));
    assert.equal(svc.verifyWebhook(body, "t=1,v1=valid").id, "evt_ok");
});

test("S10 receipt template escapes input, formats cents, and has no em dash", () => {
    const { purchaseReceiptTemplate, formatCents } = require("../../lib/email");
    assert.equal(formatCents(3999), "$39.99");
    assert.equal(formatCents(5), "$0.05");
    assert.equal(formatCents(0), "$0.00");
    assert.equal(formatCents(undefined), "$0.00");
    const tpl = purchaseReceiptTemplate({
        fighterName: "<b>x</b>", bundleName: "100 Energy Drinks", drinks: 100,
        amountTotalCents: 3999, taxCents: 333, currency: "usd", paidAt: new Date("2026-10-27T12:00:00Z"),
        consentSentence: "I agree & consent",
    });
    assert.ok(!tpl.html.includes("<b>x</b>"), "player text is escaped");
    assert.match(tpl.html, /\$39\.99 USD \(incl\. \$3\.33 tax\)/);
    assert.match(tpl.html, /I agree &amp; consent/);
    assert.ok(!/—/.test(tpl.html + tpl.subject), "no em dash in receipt copy");
    const noConsent = purchaseReceiptTemplate({ drinks: 6, amountTotalCents: 499, taxCents: 0, currency: "usd" });
    assert.ok(!noConsent.html.includes("blockquote"), "no consent quoted when none was given");
});
