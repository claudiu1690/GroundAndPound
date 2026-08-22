/**
 * Real-money purchases via Stripe Checkout.
 *
 * THE THREE RULES THIS FILE EXISTS TO ENFORCE:
 *
 *  1. THE SERVER DECIDES THE PRICE. A checkout request carries a bundle id and nothing else.
 *     The amount comes from shopConfig.PREMIUM_BUNDLES. Accepting a client-supplied amount is
 *     how a $39.99 bundle gets bought for a cent.
 *
 *  2. THE WEBHOOK IS THE SOURCE OF TRUTH, NOT THE REDIRECT. A player landing on the success URL
 *     proves nothing: they can navigate there directly, and a real payment can complete after
 *     they close the tab. Goods are granted only from a signature-verified webhook.
 *
 *  3. FULFILMENT IS EXACTLY-ONCE. Stripe delivers at-least-once and retries on any non-2xx.
 *     The grant is guarded by an atomic conditional update on the Purchase document, so a
 *     duplicate delivery is a no-op rather than a second batch of free drinks.
 *
 * Card data never reaches this server. Hosted Checkout keeps PCI scope at SAQ-A.
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const User = require("../models/userModel");
const Purchase = require("../models/purchaseModel");
const { PREMIUM_BUNDLES, PREMIUM_CURRENCY } = require("../consts/shopConfig");
const saveWithVersionRetry = require("../utils/saveWithVersionRetry");

let _stripe = null;
function stripe() {
    if (!config.stripe.enabled) {
        throw payErr("payments_disabled", "Purchases are temporarily unavailable", 503);
    }
    if (!_stripe) _stripe = require("stripe")(config.stripe.secretKey);
    return _stripe;
}

function payErr(code, message, status = 400) {
    const e = new Error(message);
    e.code = code;
    e.status = status;
    return e;
}

/**
 * Open a Checkout Session for a bundle.
 *
 * Guests are refused. They have no email and no password, so a purchase cannot be recovered if
 * they lose the device, and in a dispute there is no way to identify the buyer. The block is a
 * product decision, not a technical limit: the client should prompt them to claim the account.
 *
 * ⚠️ THE OWNER IS THE AUTHENTICATED CALLER, NOT `fighter.userId`.
 * `User.fighterId` is the authoritative link (it is what authMiddleware reads and what
 * ownFighterMiddleware enforces); `Fighter.userId` is only a back-pointer written at creation
 * time, and it is absent on most fighters. Resolving the buyer from that back-pointer refused
 * real, verified accounts with "account_required" because the field was simply never set.
 * `authUserId` comes from the verified JWT, and ownFighter has already proven it owns `fighterId`.
 *
 * @param {string} fighterId  route param, already ownership-checked by ownFighterMiddleware
 * @param {string} bundleId
 * @param {string} authUserId authenticated user id from the verified token (req.user.id)
 * @returns {Promise<{url: string, purchaseId: string}>}
 */
async function createCheckoutSession(fighterId, bundleId, authUserId) {
    const bundle = PREMIUM_BUNDLES[bundleId];
    if (!bundle) throw payErr("unknown_bundle", "That bundle does not exist", 404);

    // Refuse rather than guess. Without a caller identity there is no safe fallback: charging
    // someone resolved by any other route risks crediting the wrong account.
    if (!authUserId) throw payErr("account_required", "Sign in before buying", 403);

    const fighter = await Fighter.findById(fighterId).select("_id");
    if (!fighter) throw payErr("fighter_not_found", "Fighter not found", 404);

    const user = await User.findById(authUserId).select("_id email isGuest");
    if (!user) throw payErr("account_required", "Add an email and password before buying", 403);
    if (user.isGuest || !user.email) {
        throw payErr("account_required", "Add an email and password to your account before buying", 403);
    }

    // The amount is read HERE, from server config, and copied onto the Purchase. It is never
    // read from the request and never re-read from config at fulfilment time.
    const amountCents = bundle.amountCents;
    const currency = PREMIUM_CURRENCY;

    const session = await stripe().checkout.sessions.create({
        mode: "payment",
        // Prefill so the receipt reaches the account that will hold the goods.
        customer_email: user.email,
        line_items: [{
            quantity: 1,
            price_data: {
                currency,
                unit_amount: amountCents,
                product_data: { name: bundle.name, description: `${bundle.drinks} Energy Drinks for Ground & Pound` },
            },
        }],
        success_url: config.stripe.successUrl,
        cancel_url: config.stripe.cancelUrl,
        /**
         * Metadata is how the webhook finds its way back to a player. It is ALSO not trusted for
         * anything but lookup: the webhook re-reads the Purchase document for the amount and the
         * drink count, because metadata is echoed from what we sent and proves nothing on its own.
         */
        metadata: { fighterId: String(fighter._id), userId: String(user._id), bundleId },
    }, {
        // Retrying a create without this can open two sessions, and two chances to be charged.
        idempotencyKey: `checkout:${fighter._id}:${bundleId}:${Date.now()}`,
    });

    const purchase = await Purchase.create({
        stripeSessionId: session.id,
        userId: user._id,
        fighterId: fighter._id,
        bundleId,
        amountCents,
        currency,
        drinks: bundle.drinks,
        status: "created",
    });

    return { url: session.url, purchaseId: String(purchase._id) };
}

/**
 * Verify a raw webhook body and return the parsed Stripe event.
 *
 * ⚠️ RAW BODY REQUIRED. Signature verification hashes the exact bytes Stripe sent. If
 * `express.json()` has already parsed and re-serialised the body, the signature will never
 * match — key ordering and whitespace differ. See the route mounting in app.js.
 *
 * @param {Buffer} rawBody
 * @param {string} signatureHeader
 */
function verifyWebhook(rawBody, signatureHeader) {
    if (!signatureHeader) throw payErr("bad_signature", "Missing signature", 400);
    try {
        return stripe().webhooks.constructEvent(rawBody, signatureHeader, config.stripe.webhookSecret);
    } catch (err) {
        // Never echo the underlying message to the caller — it can describe our key handling.
        console.error("[stripe] signature verification failed:", err.message);
        throw payErr("bad_signature", "Invalid signature", 400);
    }
}

/**
 * Grant a paid purchase, exactly once.
 *
 * THE CLAIM IS THE WHOLE MECHANISM. `updateOne` matches only a document that is not already
 * fulfilled and flips it in one atomic operation. Whoever gets matchedCount === 1 owns the
 * grant; everyone else — a Stripe retry, a concurrent delivery, a manual replay — sees 0 and
 * returns without touching the fighter.
 *
 * This is the same shape as claimCoachPerk, and for the same reason: saveWithVersionRetry is
 * NOT a mutex (no schema sets optimisticConcurrency), so read-then-write cannot serialise this.
 */
async function fulfil(purchaseDoc, eventId, paymentIntentId) {
    const claim = await Purchase.updateOne(
        { _id: purchaseDoc._id, status: { $ne: "fulfilled" } },
        {
            $set: {
                status: "fulfilled",
                fulfilledAt: new Date(),
                fulfilledByEventId: eventId,
                ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
            },
        }
    );
    if (claim.matchedCount === 0 || claim.modifiedCount === 0) {
        console.log(`[stripe] purchase ${purchaseDoc._id} already fulfilled — ignoring duplicate event ${eventId}`);
        return { granted: false, reason: "already_fulfilled" };
    }

    // Only now, holding the claim, do we hand over goods. `drinks` is read from the PURCHASE,
    // not from live config, so a reprice or a bundle edit can never change what an old paid
    // order delivers.
    try {
        await saveWithVersionRetry(
            () => Fighter.findById(purchaseDoc.fighterId),
            (doc) => {
                if (!doc.inventory) doc.inventory = {};
                doc.inventory.energyDrinks = (doc.inventory.energyDrinks || 0) + purchaseDoc.drinks;
            }
        );
    } catch (err) {
        /**
         * The money is taken and the claim is spent, but the goods did not land. Do NOT release
         * the claim — that would risk double-granting on the retry. Mark it so it surfaces, and
         * rethrow so Stripe retries the delivery and an operator sees a non-2xx.
         */
        await Purchase.updateOne({ _id: purchaseDoc._id }, { $set: { lastError: `grant failed: ${err.message}` } }).catch(() => {});
        console.error(`[stripe] PAID BUT NOT GRANTED purchase=${purchaseDoc._id} fighter=${purchaseDoc.fighterId}:`, err.message);
        throw err;
    }

    console.log(`[stripe] granted ${purchaseDoc.drinks} drinks to fighter ${purchaseDoc.fighterId} (purchase ${purchaseDoc._id})`);
    return { granted: true, drinks: purchaseDoc.drinks };
}

/**
 * Handle a verified Stripe event.
 *
 * Unknown event types are ACKNOWLEDGED, not errored. Returning non-2xx makes Stripe retry
 * forever for events we simply do not care about.
 */
async function handleEvent(event) {
    switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
            const session = event.data.object;
            // `payment_status` is the authoritative field. A completed session with a pending
            // async method is not money yet.
            if (session.payment_status !== "paid") {
                console.log(`[stripe] session ${session.id} completed but payment_status=${session.payment_status} — not granting`);
                return { handled: true, granted: false };
            }
            const purchase = await Purchase.findOne({ stripeSessionId: session.id });
            if (!purchase) {
                // A session we have no record of. Do not invent one — grant nothing and shout.
                console.error(`[stripe] no Purchase for session ${session.id}; refusing to grant`);
                return { handled: true, granted: false, reason: "unknown_session" };
            }
            const res = await fulfil(purchase, event.id, session.payment_intent || null);
            return { handled: true, ...res };
        }
        case "checkout.session.expired":
        case "checkout.session.async_payment_failed": {
            const session = event.data.object;
            // Never move a fulfilled purchase backwards.
            await Purchase.updateOne(
                { stripeSessionId: session.id, status: { $in: ["created", "paid"] } },
                { $set: { status: "failed" } }
            );
            return { handled: true, granted: false };
        }
        case "charge.refunded": {
            /**
             * Recorded, NOT clawed back. Removing consumables a player may already have spent
             * would drive their balance negative and punish them for a support action. Refunds
             * are handled by a human who can also decide whether the account should be limited.
             */
            const charge = event.data.object;
            await Purchase.updateOne(
                { stripePaymentIntentId: charge.payment_intent },
                { $set: { status: "refunded" } }
            );
            console.warn(`[stripe] refund recorded for payment_intent ${charge.payment_intent} — goods NOT reclaimed, review manually`);
            return { handled: true, granted: false };
        }
        default:
            return { handled: false };
    }
}

module.exports = { createCheckoutSession, verifyWebhook, handleEvent, fulfil, payErr };
