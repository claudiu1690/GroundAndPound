const paymentService = require("../services/paymentService");

const CODE_STATUS = {
    unknown_bundle: 404,
    fighter_not_found: 404,
    account_required: 403,
    payments_disabled: 503,
    bad_signature: 400,
};

function handleError(err, res) {
    /**
     * KNOWN CONTRACT CODES PASS THROUGH, EVERYTHING ELSE COLLAPSES TO 500.
     *
     * Branching on the status instead (`if (status >= 500) generic`) buried
     * `payments_disabled`, which is a 503: the client could not tell "the shop is switched off"
     * from "something exploded" and had to show a generic error for a perfectly known state.
     * The deciding question is whether WE authored the code, not what number it carries.
     *
     * Anything unrecognised is still swallowed — a raw Stripe error can name internal
     * configuration, and none of it belongs in a response body.
     */
    const known = err.code && Object.prototype.hasOwnProperty.call(CODE_STATUS, err.code);
    if (!known) {
        console.error("[payments]", err.message);
        return res.status(500).json({ message: "Something went wrong", code: "server_error" });
    }
    const status = CODE_STATUS[err.code];
    if (status >= 500) console.error("[payments]", err.code, err.message);
    return res.status(status).json({ message: err.message, code: err.code });
}

/** POST /fighters/:id/shop/checkout  { bundleId } -> { url } */
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

/**
 * POST /webhooks/stripe
 *
 * ⚠️ UNAUTHENTICATED BY DESIGN — Stripe cannot present a session token. The SIGNATURE is the
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
        // 200 acknowledges receipt. Unhandled event types are acknowledged too — a non-2xx
        // would make Stripe retry forever for events this app does not care about.
        return res.status(200).json({ received: true, handled: !!result.handled });
    } catch (err) {
        /**
         * Deliberate 500: fulfilment failed after the money was taken. Stripe will retry, which
         * is exactly what we want — the grant is idempotent, so a retry either completes the
         * delivery or no-ops safely.
         */
        console.error("[stripe] handler failed for event", event.id, err.message);
        return res.status(500).json({ message: "Handler failed" });
    }
}

module.exports = { createCheckout, stripeWebhook };
