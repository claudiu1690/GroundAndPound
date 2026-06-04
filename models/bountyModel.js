const mongoose = require("mongoose");

/**
 * The Circuit v1.2 — Bounties (mirror mainEventService stake→debit→settle; NET IRON SINK).
 *
 * A poster stakes real iron on a target's head. The post burns 10% (PVP_BOUNTY_POST_BURN) and
 * escrows 90% (PVP_BOUNTY_ESCROW). A legit attacker who beats the target with the required
 * method collects the escrow. On expiry the poster is refunded 80% (PVP_BOUNTY_REFUND_FRAC) of
 * the escrow (the other 20% burns). Every path nets to a sink — iron is NEVER created.
 *
 * Double-pay guard (Risk 6): collection flips `status` via an atomic compare-and-set
 * `findOneAndUpdate({ _id, status: "open" }, { $set: { status: "collected", ... } })` and only
 * credits the attacker if the conditional update actually flipped a doc — so a VersionError
 * snapshot-retry inside processPvpResult can never pay twice.
 */
const bountySchema = new mongoose.Schema({
    target_id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    poster_id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    amount_posted: { type: Number, required: true },              // gross iron the poster paid
    escrow_amount: { type: Number, required: true },              // 90% of amount_posted (the payout)
    method_required: {
        type: String,
        enum: ["any", "KO", "Submission", "Decision"],
        default: "any",
    },
    status: {
        type: String,
        enum: ["open", "collected", "expired", "refunded"],
        default: "open",
    },
    expires_at: { type: Date, required: true },                   // posted_at + PVP_BOUNTY_EXPIRY_DAYS
    collected_by: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null },
    collected_fight_id: { type: mongoose.Schema.Types.ObjectId, ref: "PvpFight", default: null },
    posted_at: { type: Date, default: Date.now },
    resolved_at: { type: Date, default: null },                  // set on collect/expire/refund
}, { timestamps: true });

bountySchema.index({ target_id: 1, status: 1 });
bountySchema.index({ poster_id: 1, status: 1 });
bountySchema.index({ status: 1, expires_at: 1 });
bountySchema.index({ status: 1, target_id: 1, collected_by: 1 });

const Bounty = mongoose.model("Bounty", bountySchema);
module.exports = Bounty;
