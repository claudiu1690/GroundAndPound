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
 *
 * No Redis keys and no BullMQ jobs: Stripe's own webhook retry is the queue, and the Purchase
 * claim makes every redelivery safe.
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const User = require("../models/userModel");
const Purchase = require("../models/purchaseModel");
const analyticsService = require("./analyticsService");
const email = require("../lib/email");
const { PREMIUM_BUNDLES, PREMIUM_CURRENCY } = require("../consts/shopConfig");

/**
 * Shown by Stripe next to the required Terms of Service checkbox, and quoted verbatim in the
 * receipt email. The immediate-delivery acknowledgement is what lets digital goods be delivered
 * inside the EU 14-day withdrawal window; do not reword it without legal review.
 */
const CONSENT_MESSAGE =
    "I agree to the Terms of Service. I ask for the Energy Drinks to be delivered immediately and acknowledge that I lose my 14-day right of withdrawal once delivery starts. I am 18 or older, or have permission from a parent or guardian.";

// Checkout Sessions stay payable for 30 minutes. Stripe accepts 30 min to 24 h.
const CHECKOUT_TTL_SECONDS = 1800;

/**
 * A Purchase may be claimed for fulfilment only from these states. `refunded` and `disputed`
 * are reachable only AFTER fulfilment, so excluding them stops a replayed "completed" event
 * from granting a second batch once support has acted on the order. `failed` stays claimable:
 * if Stripe ever reports a verified paid session for it, the money is real and the goods are owed.
 */
const CLAIMABLE_STATUSES = ["created", "paid", "failed"];

let _stripe = null;
function stripe() {
    if (!config.stripe.enabled) {
        throw payErr("payments_disabled", "Purchases are not available right now. Nothing has changed in your inventory.", 503);
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

/** Own-property lookup, so "constructor" or "__proto__" never resolve to a bundle. */
function findBundle(bundleId) {
    if (typeof bundleId !== "string") return null;
    return Object.prototype.hasOwnProperty.call(PREMIUM_BUNDLES, bundleId) ? PREMIUM_BUNDLES[bundleId] : null;
}

/** Stripe sends ids as strings, or as objects when expanded. Anything else is "no id". */
function stripeId(v) {
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object" && typeof v.id === "string" && v.id) return v.id;
    return null;
}

const ACCOUNT_REQUIRED_MSG = "Add an email and password to your account before buying";

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
    const bundle = findBundle(bundleId);
    if (!bundle) throw payErr("unknown_bundle", "That bundle does not exist", 404);

    // Fail fast, before any DB read: a shop with no keys has nothing to sell.
    if (!config.stripe.enabled) stripe();

    // Refuse rather than guess. Without a caller identity there is no safe fallback: charging
    // someone resolved by any other route risks crediting the wrong account.
    if (!authUserId) throw payErr("account_required", ACCOUNT_REQUIRED_MSG, 403);

    const fighter = await Fighter.findById(fighterId).select("_id");
    if (!fighter) throw payErr("fighter_not_found", "Fighter not found", 404);

    const user = await User.findById(authUserId).select("_id email isGuest paymentsBlocked");
    if (!user) throw payErr("account_required", ACCOUNT_REQUIRED_MSG, 403);
    if (user.isGuest || !user.email) {
        analyticsService.track(user._id, "checkout_blocked_guest", { bundleId: bundle.id }, { fighterId: fighter._id });
        throw payErr("account_required", ACCOUNT_REQUIRED_MSG, 403);
    }
    // Ops kill switch (fraud, chargeback abuse). Checked before Stripe is ever called.
    if (user.paymentsBlocked === true) {
        throw payErr("account_blocked", "Purchases are disabled on this account. Contact support@groundandpound.net.", 403);
    }

    // The amount is read HERE, from server config, and copied onto the Purchase. It is never
    // read from the request and never re-read from config at fulfilment time.
    const amountCents = bundle.amountCents;
    const currency = PREMIUM_CURRENCY;
    const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS;

    // String concatenation, NOT a URL object: URL would percent-encode the braces and Stripe
    // would no longer substitute {CHECKOUT_SESSION_ID}.
    const successUrl = config.stripe.successUrl;
    const successWithSession = successUrl + (successUrl.includes("?") ? "&" : "?") + "session_id={CHECKOUT_SESSION_ID}";

    const session = await stripe().checkout.sessions.create({
        mode: "payment",
        // Prefill so the receipt reaches the account that will hold the goods.
        customer_email: user.email,
        line_items: [{
            quantity: 1,
            price_data: {
                currency,
                unit_amount: amountCents,
                // The listed price is what the player pays; Stripe Tax carves the tax out of it.
                tax_behavior: "inclusive",
                product_data: { name: bundle.name, description: `${bundle.drinks} Energy Drinks for Ground & Pound` },
            },
        }],
        // ⚠️ Needs Stripe Tax enabled with an origin address in the Dashboard, or create fails.
        automatic_tax: { enabled: true },
        expires_at: expiresAt,
        // ⚠️ Needs a public Terms of Service URL in the Dashboard, or create fails.
        consent_collection: { terms_of_service: "required" },
        custom_text: { terms_of_service_acceptance: { message: CONSENT_MESSAGE } },
        success_url: successWithSession,
        cancel_url: config.stripe.cancelUrl,
        /**
         * Metadata is how the webhook finds its way back to a player. It is ALSO not trusted for
         * anything but lookup: the webhook re-reads the Purchase document for the amount and the
         * drink count, because metadata is echoed from what we sent and proves nothing on its own.
         */
        metadata: { fighterId: String(fighter._id), userId: String(user._id), bundleId: bundle.id },
    }, {
        // Guards the Stripe SDK's own network retries of THIS call (same key on each internal retry).
        // Date.now() makes every new click a new session on purpose; it does not dedupe clicks.
        idempotencyKey: `checkout:${fighter._id}:${bundle.id}:${Date.now()}`,
    });

    const purchase = await Purchase.create({
        stripeSessionId: session.id,
        userId: user._id,
        fighterId: fighter._id,
        bundleId: bundle.id,
        amountCents,
        currency,
        drinks: bundle.drinks,
        status: "created",
        expiresAt: new Date(expiresAt * 1000),
    });

    analyticsService.track(user._id, "checkout_started", { bundleId: bundle.id, amountCents }, { fighterId: fighter._id });

    return { url: session.url, purchaseId: String(purchase._id) };
}

/**
 * Status of one of the caller's purchases, for the post-redirect poll. Mongo only, so it
 * answers even with Stripe disabled.
 *
 * The filter carries fighterId AND userId: someone else's session id is indistinguishable from
 * one that does not exist (both are purchase_not_found), so the endpoint cannot be used to
 * probe other players' orders.
 *
 * @param {string} fighterId  route param, already ownership-checked by ownFighterMiddleware
 * @param {string} authUserId req.user.id from the verified token
 * @param {string} sessionId  already shape-checked by the controller
 * @returns {Promise<{status: string, drinks: number}>}
 */
async function getPurchaseStatus(fighterId, authUserId, sessionId) {
    if (typeof sessionId !== "string" || !sessionId) {
        throw payErr("bad_session", "That is not a valid checkout session", 400);
    }
    // A malformed id would throw a CastError (a 500). It can only ever mean "not found".
    if (!mongoose.isValidObjectId(fighterId) || !mongoose.isValidObjectId(authUserId)) {
        throw payErr("purchase_not_found", "Purchase not found", 404);
    }
    const purchase = await Purchase.findOne({ stripeSessionId: sessionId, fighterId, userId: authUserId })
        .select("status drinks")
        .lean();
    if (!purchase) throw payErr("purchase_not_found", "Purchase not found", 404);
    return { status: purchase.status, drinks: purchase.drinks };
}

/**
 * Verify a raw webhook body and return the parsed Stripe event.
 *
 * ⚠️ RAW BODY REQUIRED. Signature verification hashes the exact bytes Stripe sent. If
 * `express.json()` has already parsed and re-serialised the body, the signature will never
 * match (key ordering and whitespace differ). See the route mounting in app.js.
 *
 * @param {Buffer} rawBody
 * @param {string} signatureHeader
 */
function verifyWebhook(rawBody, signatureHeader) {
    if (!signatureHeader) throw payErr("bad_signature", "Missing signature", 400);
    try {
        return stripe().webhooks.constructEvent(rawBody, signatureHeader, config.stripe.webhookSecret);
    } catch (err) {
        // Never echo the underlying message to the caller: it can describe our key handling.
        console.error("[stripe] signature verification failed:", err.message);
        throw payErr("bad_signature", "Invalid signature", 400);
    }
}

/**
 * Grant a paid purchase, exactly once.
 *
 * GRANT FIRST, THEN CLAIM. Two atomic updates, in this order:
 *  1. Fighter.updateOne filtered on "this purchase id is not in paidPurchaseIds yet", which adds
 *     the drinks with $inc and records the id with $push in ONE operation. It is exactly-once per
 *     purchase on its own: a retry, a concurrent delivery or a replay matches nothing.
 *  2. Purchase.updateOne flips a still-claimable purchase to fulfilled and writes the session
 *     facts (consent, amount, tax, payment intent) in the same update. Whoever matches owns the
 *     side effects (receipt email, analytics), so they fire once.
 * If step 1 throws, the purchase is still claimable and the 500 makes Stripe retry, so the player
 * is never left paid-but-not-granted. A crash between 1 and 2 is safe: the retry's step 1 matches
 * nothing and step 2 completes. "fulfilled" therefore always means the drinks really landed.
 *
 * $inc also avoids the lost update a read-modify-write of the whole inventory would risk
 * (saveWithVersionRetry is NOT a mutex: no schema sets optimisticConcurrency).
 *
 * @param {object} purchaseDoc the Purchase found by session id
 * @param {string} eventId     the Stripe event performing fulfilment (audit)
 * @param {object} [session]   the paid Checkout Session from the event payload
 */
async function fulfil(purchaseDoc, eventId, session = {}) {
    const s = session || {};
    const fulfilledAt = new Date();
    const paymentIntentId = stripeId(s.payment_intent);
    const consentAccepted = s.consent?.terms_of_service === "accepted";
    const amountTotalCents = Number.isFinite(s.amount_total) ? s.amount_total : null;
    const taxCents = s.total_details?.amount_tax ?? 0;

    // Refunded / disputed / already fulfilled orders never grant again (a replayed "completed"
    // after a refund must not deliver a second batch).
    if (!CLAIMABLE_STATUSES.includes(purchaseDoc.status)) {
        console.log(`[stripe] purchase ${purchaseDoc._id} is ${purchaseDoc.status}, ignoring event ${eventId}`);
        return { granted: false, reason: "already_fulfilled" };
    }

    // Step 1: the grant. `drinks` is read from the PURCHASE, not from live config, so a reprice or
    // a bundle edit can never change what an old paid order delivers.
    // PLAIN ADD, NO CLAMP. Paid goods always land, even above the 99 soft cap. SOFT_CAP
    // (shopService.grantEnergyDrinks) limits FREE drinks from streaks, promotions and sponsors only;
    // clamping here would take a player's money and silently deliver less than they bought.
    let grant;
    try {
        grant = await Fighter.updateOne(
            { _id: purchaseDoc.fighterId, paidPurchaseIds: { $ne: purchaseDoc._id } },
            { $inc: { "inventory.energyDrinks": purchaseDoc.drinks }, $push: { paidPurchaseIds: purchaseDoc._id } }
        );
    } catch (err) {
        // Nothing was claimed, so the purchase stays claimable: rethrow, answer 500, Stripe retries.
        await Purchase.updateOne({ _id: purchaseDoc._id }, { $set: { lastError: `grant failed: ${err.message}` } }).catch(() => {});
        console.error(`[stripe] grant failed, will be retried by Stripe: purchase=${purchaseDoc._id} fighter=${purchaseDoc.fighterId}:`, err.message);
        throw err;
    }
    if (grant.matchedCount === 0 && !(await Fighter.exists({ _id: purchaseDoc.fighterId }))) {
        // The fighter no longer exists. A retry cannot fix that, so record it for a manual refund
        // instead of making Stripe redeliver forever.
        await Purchase.updateOne({ _id: purchaseDoc._id }, { $set: { lastError: "grant failed: fighter not found" } }).catch(() => {});
        console.error(`[stripe] PAID BUT NOT GRANTED purchase=${purchaseDoc._id}: fighter ${purchaseDoc.fighterId} not found, refund manually`);
        return { granted: false, reason: "fighter_not_found" };
    }
    // matchedCount 0 with the fighter present = an earlier delivery already credited this purchase.

    // Step 2: the claim, with the session facts in the same update.
    const claim = await Purchase.updateOne(
        { _id: purchaseDoc._id, status: { $in: CLAIMABLE_STATUSES } },
        {
            $set: {
                status: "fulfilled",
                fulfilledAt,
                fulfilledByEventId: eventId,
                consentAccepted,
                amountTotalCents,
                taxCents,
                ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
            },
        }
    );
    if (claim.matchedCount === 0 || claim.modifiedCount === 0) {
        // A concurrent delivery completed the claim first; the drinks were credited exactly once
        // by step 1 either way, and that delivery owns the receipt and analytics.
        console.log(`[stripe] purchase ${purchaseDoc._id} already fulfilled or closed, ignoring event ${eventId}`);
        return { granted: false, reason: "already_fulfilled" };
    }

    console.log(`[stripe] granted ${purchaseDoc.drinks} drinks to fighter ${purchaseDoc.fighterId} (purchase ${purchaseDoc._id})`);

    // Side effects AFTER the grant. Neither may turn a delivered order into a 500:
    // analyticsService.track never rejects, and the receipt is caught below.
    const createdAtMs = purchaseDoc.createdAt ? new Date(purchaseDoc.createdAt).getTime() : NaN;
    analyticsService.track(purchaseDoc.userId, "purchase_fulfilled", {
        bundleId: purchaseDoc.bundleId,
        drinks: purchaseDoc.drinks,
        amountCents: purchaseDoc.amountCents,
        amountTotalCents,
        taxCents,
        secondsSinceCreate: Number.isFinite(createdAtMs) ? Math.round((fulfilledAt.getTime() - createdAtMs) / 1000) : null,
    }, { fighterId: purchaseDoc.fighterId });

    // Fire-and-forget: never awaited by the grant path.
    sendPurchaseReceipt({
        _id: purchaseDoc._id,
        userId: purchaseDoc.userId,
        fighterId: purchaseDoc.fighterId,
        bundleId: purchaseDoc.bundleId,
        drinks: purchaseDoc.drinks,
        currency: purchaseDoc.currency,
        amountCents: purchaseDoc.amountCents,
        amountTotalCents,
        taxCents,
        consentAccepted,
        fulfilledAt,
    }).catch((err) => console.error("[stripe] receipt email failed", String(purchaseDoc._id), err && err.message));

    return { granted: true, drinks: purchaseDoc.drinks };
}

/**
 * Take back what is left of a disputed order's drinks: energyDrinks = max(0, energyDrinks - drinks).
 * One atomic pipeline update guarded by clawedBackPurchaseIds, so it runs at most once per
 * purchase however often Stripe redelivers the dispute.
 *
 * @returns {Promise<number|null>} drinks actually removed, or null when this purchase was already
 *   clawed back (or the fighter no longer exists).
 */
async function clawBackDrinks(purchaseDoc) {
    const before = await Fighter.findOneAndUpdate(
        { _id: purchaseDoc.fighterId, clawedBackPurchaseIds: { $ne: purchaseDoc._id } },
        [{
            $set: {
                "inventory.energyDrinks": { $max: [0, { $subtract: [{ $ifNull: ["$inventory.energyDrinks", 0] }, purchaseDoc.drinks] }] },
                clawedBackPurchaseIds: { $concatArrays: [{ $ifNull: ["$clawedBackPurchaseIds", []] }, [purchaseDoc._id]] },
            },
        }],
        { new: false, projection: { "inventory.energyDrinks": 1 } }
    );
    if (!before) return null;
    return Math.min(before.inventory?.energyDrinks ?? 0, purchaseDoc.drinks);
}

/**
 * Email the buyer a receipt. Async on purpose: any throw, sync or not, becomes a rejection the
 * caller's `.catch` logs, so a mail outage can never reach the webhook response.
 *
 * Uses sendEmail, not sendAccountEmail: a payment receipt is a transactional record and is
 * sent regardless of the notifications toggle.
 */
async function sendPurchaseReceipt(purchase) {
    const user = await User.findById(purchase.userId).select("email");
    if (!user || !user.email) {
        console.warn(`[stripe] no email on account for purchase ${purchase._id}; receipt not sent`);
        return null;
    }
    const fighter = await Fighter.findById(purchase.fighterId).select("firstName lastName nickname");
    const fighterName = fighter
        ? (fighter.nickname || [fighter.firstName, fighter.lastName].filter(Boolean).join(" "))
        : null;
    const bundle = findBundle(purchase.bundleId);
    const tpl = email.purchaseReceiptTemplate({
        fighterName,
        bundleName: bundle ? bundle.name : `${purchase.drinks} Energy Drinks`,
        drinks: purchase.drinks,
        amountTotalCents: purchase.amountTotalCents != null ? purchase.amountTotalCents : purchase.amountCents,
        taxCents: purchase.taxCents || 0,
        currency: purchase.currency,
        paidAt: purchase.fulfilledAt,
        // Only quote consent the buyer actually gave.
        consentSentence: purchase.consentAccepted ? CONSENT_MESSAGE : null,
        testMode: !config.stripe.liveMode,
    });
    return email.sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html });
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
                console.log(`[stripe] session ${session.id} completed but payment_status=${session.payment_status}, not granting`);
                return { handled: true, granted: false };
            }
            const purchase = await Purchase.findOne({ stripeSessionId: session.id });
            if (!purchase) {
                // A session we have no record of. Do not invent one: grant nothing and shout.
                console.error(`[stripe] no Purchase for session ${session.id}; refusing to grant`);
                return { handled: true, granted: false, reason: "unknown_session" };
            }
            const res = await fulfil(purchase, event.id, session);
            return { handled: true, ...res };
        }
        case "checkout.session.expired":
        case "checkout.session.async_payment_failed": {
            const session = event.data.object;
            // Never move a fulfilled purchase backwards.
            const failed = await Purchase.findOneAndUpdate(
                { stripeSessionId: session.id, status: { $in: ["created", "paid"] } },
                { $set: { status: "failed", lastError: event.type } },
                { new: true }
            );
            if (failed) {
                analyticsService.track(failed.userId, "purchase_failed", { bundleId: failed.bundleId, reason: event.type }, { fighterId: failed.fighterId });
            }
            return { handled: true, granted: false };
        }
        case "charge.refunded": {
            /**
             * Recorded, NOT clawed back. A refund is the owner's own decision in the Stripe
             * Dashboard, so the drinks are left as goodwill. (Chargebacks are different: see
             * charge.dispute.created.)
             *
             * Filtered on "fulfilled" so a refund that follows a dispute does not overwrite
             * "disputed" or count the same order as refunded twice.
             */
            const charge = event.data.object;
            const pi = stripeId(charge.payment_intent);
            if (!pi) return { handled: true, granted: false };
            const refunded = await Purchase.findOneAndUpdate(
                { stripePaymentIntentId: pi, status: "fulfilled" },
                { $set: { status: "refunded" } },
                { new: true }
            );
            console.warn(`[stripe] refund recorded for payment_intent ${pi}; goods NOT reclaimed, review manually`);
            if (refunded) {
                analyticsService.track(refunded.userId, "purchase_refunded", { bundleId: refunded.bundleId, disputed: false }, { fighterId: refunded.fighterId });
            }
            return { handled: true, granted: false };
        }
        case "charge.dispute.created": {
            /**
             * A chargeback: the buyer asked their bank to reverse the payment, which also costs a
             * dispute fee. Buy, spend, charge back is the abuse this blocks:
             *   1. take back what is left of this order's drinks (never below 0), and
             *   2. block real-money purchases on the buyer's account.
             * Both steps are idempotent and run BEFORE the status flip, so if either throws the
             * 500 makes Stripe redeliver and the retry finishes the job. Unblocking (say, after a
             * won dispute) stays a manual Mongo edit, and reclaimed drinks are not restored.
             */
            const dispute = event.data.object;
            const pi = stripeId(dispute.payment_intent);
            if (!pi) return { handled: true, granted: false };
            const purchase = await Purchase.findOne({ stripePaymentIntentId: pi, status: { $in: ["fulfilled", "refunded", "disputed"] } });
            if (!purchase) {
                console.warn(`[stripe] DISPUTE opened for payment_intent ${pi} (no matching purchase), review manually`);
                return { handled: true, granted: false };
            }
            const clawedBack = await clawBackDrinks(purchase);
            await User.updateOne({ _id: purchase.userId }, { $set: { paymentsBlocked: true } });
            // Returns the PRE-update document, so analytics can tell a fresh dispute from one on
            // an order already counted as refunded. A redelivered dispute matches nothing.
            const before = await Purchase.findOneAndUpdate(
                { _id: purchase._id, status: { $in: ["fulfilled", "refunded"] } },
                { $set: { status: "disputed", ...(clawedBack != null ? { clawedBackDrinks: clawedBack } : {}) } },
                { new: false }
            );
            console.warn(`[stripe] DISPUTE opened for payment_intent ${pi} purchase=${purchase._id}: ${clawedBack != null ? `took back ${clawedBack} of ${purchase.drinks} drinks` : "nothing taken back (already done or fighter gone)"}, payments blocked for user ${purchase.userId}`);
            if (before && before.status === "fulfilled") {
                analyticsService.track(before.userId, "purchase_refunded", { bundleId: before.bundleId, disputed: true }, { fighterId: before.fighterId });
            }
            return { handled: true, granted: false };
        }
        default:
            return { handled: false };
    }
}

module.exports = {
    createCheckoutSession,
    getPurchaseStatus,
    verifyWebhook,
    handleEvent,
    fulfil,
    clawBackDrinks,
    sendPurchaseReceipt,
    payErr,
    CONSENT_MESSAGE,
    CHECKOUT_TTL_SECONDS,
};
