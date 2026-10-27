/**
 * Real-money shop HTTP layer. Thin: validate input, call paymentService, map errors.
 *
 * SHARED SHAPES (single source; frontend/src/api.js references these by name):
 *
 * @typedef {Object} CheckoutResponse
 *   POST /fighters/:id/shop/checkout  body { bundleId: string }  (nothing else is read)
 * @property {string} url         Stripe-hosted Checkout page. Redirect the browser here.
 * @property {string} purchaseId  Our Purchase document id (support reference).
 *
 * @typedef {Object} PurchaseStatusResponse
 *   GET /fighters/:id/shop/purchases/:sessionId  (works with Stripe disabled: Mongo read only)
 * @property {"created"|"paid"|"fulfilled"|"failed"|"refunded"|"disputed"} status
 *   created = checkout opened, payment not confirmed by the webhook yet (keep polling);
 *   fulfilled = drinks delivered;
 *   failed / refunded / disputed = terminal, no (further) delivery. `paid` is not written by
 *   current code and is kept for compatibility.
 * @property {number} drinks      Energy Drinks this purchase delivers (or delivered).
 *
 * @typedef {Object} PaymentErrorBody
 * @property {string} message     Human readable, safe to log; the client maps `code` to copy.
 * @property {string} code        One of the codes below.
 *
 * CODE TABLE
 *   status code                when
 *   400    unknown_bundle      bundleId missing or not a string (checkout)
 *   404    unknown_bundle      bundleId is not a known bundle (checkout)
 *   404    fighter_not_found   fighter document missing (checkout)
 *   403    account_required    guest account or no email on the account (checkout)
 *   403    account_blocked     User.paymentsBlocked is set (checkout)
 *   503    payments_disabled   Stripe keys not configured (checkout)
 *   400    bad_session         :sessionId does not match /^cs_[A-Za-z0-9_]{1,200}$/ (status)
 *   404    purchase_not_found  no such session for this fighter and account (status)
 *   429    rate_limited        checkoutLimiter in app.js, 10 per 15 min per IP (checkout)
 *   500    server_error        anything else, including every Stripe API error (logged only)
 *
 * Note: a 403 from ownFighterMiddleware (not your fighter) and a 401 from authMiddleware come
 * from shared middleware and carry only `message`.
 */
const paymentService = require("../services/paymentService");

const CODE_STATUS = {
    unknown_bundle: 404,
    fighter_not_found: 404,
    account_required: 403,
    account_blocked: 403,
    payments_disabled: 503,
    bad_signature: 400,
    purchase_not_found: 404,
    bad_session: 400,
};

// Stripe Checkout Session ids: "cs_test_..." / "cs_live_...". Bounded so a hostile param can
// never reach Mongo as anything but a short plain string.
const SESSION_ID_RE = /^cs_[A-Za-z0-9_]{1,200}$/;

function handleError(err, res) {
    /**
     * KNOWN CONTRACT CODES PASS THROUGH, EVERYTHING ELSE COLLAPSES TO 500.
     *
     * Branching on the status instead (`if (status >= 500) generic`) buried
     * `payments_disabled`, which is a 503: the client could not tell "the shop is switched off"
     * from "something exploded" and had to show a generic error for a perfectly known state.
     * The deciding question is whether WE authored the code, not what number it carries.
     *
     * Anything unrecognised is still swallowed: a raw Stripe error can name internal
     * configuration, and none of it belongs in a response body.
     */
    const known = err && err.code && Object.prototype.hasOwnProperty.call(CODE_STATUS, err.code);
    if (!known) {
        console.error("[payments]", err && err.message);
        return res.status(500).json({ message: "Something went wrong", code: "server_error" });
    }
    const status = CODE_STATUS[err.code];
    if (status >= 500) console.error("[payments]", err.code, err.message);
    return res.status(status).json({ message: err.message, code: err.code });
}

/** POST /fighters/:id/shop/checkout  { bundleId } -> CheckoutResponse */
async function createCheckout(req, res) {
    try {
        const { bundleId } = req.body || {};
        if (typeof bundleId !== "string" || !bundleId) {
            return res.status(400).json({ message: "bundleId is required", code: "unknown_bundle" });
        }
        // NOTE: no amount, quantity or currency is read from the body. The bundle id is the
        // entire input; everything chargeable is resolved server-side.
        //
        // The buyer is the authenticated caller (req.user.id, from the verified JWT), not
        // anything derived from the fighter document. ownFighterMiddleware has already proven
        // this account owns :id, so the two always refer to the same player.
        const out = await paymentService.createCheckoutSession(req.params.id, bundleId, req.user && req.user.id);
        return res.json(out);
    } catch (err) {
        return handleError(err, res);
    }
}

/** GET /fighters/:id/shop/purchases/:sessionId -> PurchaseStatusResponse */
async function getPurchaseStatus(req, res) {
    try {
        const sessionId = req.params.sessionId;
        if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
            return res.status(400).json({ message: "That is not a valid checkout session", code: "bad_session" });
        }
        const out = await paymentService.getPurchaseStatus(req.params.id, req.user && req.user.id, sessionId);
        return res.json(out);
    } catch (err) {
        return handleError(err, res);
    }
}

/**
 * POST /webhooks/stripe
 *
 * ⚠️ UNAUTHENTICATED BY DESIGN: Stripe cannot present a session token. The SIGNATURE is the
 * authentication, which is why this handler does nothing before verifying it.
 *
 * ⚠️ `req.body` MUST be a raw Buffer here. See the mounting in app.js.
 */
async function stripeWebhook(req, res) {
    let event;
    try {
        event = paymentService.verifyWebhook(req.body, req.headers["stripe-signature"]);
    } catch (err) {
        // 400 tells Stripe not to retry: an unverifiable body will never become verifiable.
        return res.status(400).json({ message: "Invalid signature" });
    }

    try {
        const result = await paymentService.handleEvent(event);
        // 200 acknowledges receipt. Unhandled event types are acknowledged too: a non-2xx
        // would make Stripe retry forever for events this app does not care about.
        return res.status(200).json({ received: true, handled: !!(result && result.handled) });
    } catch (err) {
        /**
         * Deliberate 500: fulfilment failed after the money was taken. Stripe will retry, which
         * is what we want: the grant is idempotent, so a retry either completes the delivery or
         * no-ops safely.
         */
        console.error("[stripe] handler failed for event", event && event.id, err && err.message);
        return res.status(500).json({ message: "Handler failed" });
    }
}

module.exports = { createCheckout, getPurchaseStatus, stripeWebhook, SESSION_ID_RE, CODE_STATUS };
