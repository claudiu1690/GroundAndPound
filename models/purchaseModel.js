const mongoose = require("mongoose");
const { PREMIUM_BUNDLES } = require("../consts/shopConfig");

/**
 * A real-money purchase. One document per Stripe Checkout Session.
 *
 * THIS COLLECTION IS THE FULFILMENT LEDGER, not an analytics nicety. Stripe guarantees
 * *at-least-once* webhook delivery, retries on any non-2xx, and will happily deliver the same
 * event twice on its own. Without a durable record keyed on the session, a retry grants the
 * player a second batch of drinks they never paid for. The `status` transition below is the
 * thing that makes fulfilment exactly-once.
 *
 * It is also the only record connecting a Stripe payment to a fighter. When a customer disputes
 * a charge, this is what answers "who was this, and what did they receive".
 */
const purchaseSchema = new mongoose.Schema({
    /**
     * Stripe Checkout Session id. UNIQUE — this is the idempotency key.
     *
     * ⚠️ The unique index is not decoration. `fulfil()` claims a purchase with a conditional
     * updateOne on `status`, and that claim is only atomic because at most one document can
     * carry a given session id. Drop the index and two concurrent webhook deliveries can both
     * observe status "paid" and both grant.
     */
    stripeSessionId: { type: String, required: true, unique: true, index: true },
    // Stripe PaymentIntent, recorded for support and refund lookups. Absent until payment.
    stripePaymentIntentId: { type: String, default: null },
    // The event that actually performed fulfilment, for audit.
    fulfilledByEventId: { type: String, default: null },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fighterId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true, index: true },

    bundleId: { type: String, required: true, enum: Object.keys(PREMIUM_BUNDLES) },
    /**
     * What was charged and what was granted, COPIED AT CREATION rather than looked up later.
     *
     * Same rule as `hireFee` on a coach: a later reprice must never rewrite history. If these
     * were read from shopConfig at render time, changing a bundle's price would retroactively
     * restate what every past customer paid, and a dispute would be argued against the wrong
     * number.
     */
    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true },
    drinks: { type: Number, required: true, min: 1 },

    /**
     * created  — session opened, nothing charged yet. The common resting state for abandoned carts.
     * paid     — Stripe confirmed payment; fulfilment not yet applied.
     * fulfilled— drinks granted to the fighter. TERMINAL for the happy path.
     * failed   — payment failed or the session expired.
     * refunded — money returned. Does NOT claw the drinks back; see paymentService.
     * disputed — the buyer opened a chargeback. The unspent drinks from this order are taken
     *            back and the buyer's payments are blocked; see paymentService.
     *
     * In practice a purchase goes created -> fulfilled in one step (the webhook claim); `paid`
     * stays in the enum for compatibility with older documents and the failure filters.
     */
    status: { type: String, required: true, enum: ["created", "paid", "fulfilled", "failed", "refunded", "disputed"], default: "created", index: true },
    fulfilledAt: { type: Date, default: null },
    /**
     * Copied from the paid Checkout Session in the SAME claim update that marks the purchase
     * fulfilled, so a retried webhook can never leave a half-written record.
     *  consentAccepted  — the buyer ticked the ToS / immediate-delivery consent box at checkout.
     *  amountTotalCents — what Stripe actually charged, tax included.
     *  taxCents         — the tax portion Stripe Tax computed (0 when none applied).
     */
    consentAccepted: { type: Boolean, default: null },
    amountTotalCents: { type: Number, default: null },
    taxCents: { type: Number, default: null },
    // When the Checkout Session stops accepting payment (session expires_at), for support.
    expiresAt: { type: Date, default: null },
    // Drinks actually removed from the fighter after a chargeback (may be less than `drinks`
    // when some were already spent). Null until a dispute.
    clawedBackDrinks: { type: Number, default: null },
    // Last Stripe error seen, for support. Never contains card data.
    lastError: { type: String, default: null },
}, { timestamps: true });

// Support lookup: "show me this player's purchases, newest first".
purchaseSchema.index({ fighterId: 1, createdAt: -1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
