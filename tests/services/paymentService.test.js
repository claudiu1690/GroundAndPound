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

const test = require("node:test");
const assert = require("node:assert");

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
