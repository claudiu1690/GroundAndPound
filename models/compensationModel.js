const mongoose = require("mongoose");

/**
 * One-off compensation grants (goodwill payouts tied to a named campaign).
 *
 * WHY A LEDGER AND NOT A FLAG ON THE FIGHTER:
 * this is a public promise ("everyone affected will be compensated directly"), so the first
 * question anyone asks later is "did MY fighter get it, and when?". A flag answers yes/no; a row
 * answers who, when, how much, and under which campaign. It also keeps a one-off event out of
 * the fighter schema forever. Same shape as models/purchaseModel.js, deliberately.
 *
 * ⚠️ THE UNIQUE INDEX IS THE IDEMPOTENCY KEY. `{ fighterId, campaign }` is unique, so a second
 * attempt to pay the same fighter for the same campaign fails with E11000 instead of paying
 * twice. That is what makes the grant script safe to re-run, and it is enforced by the DB rather
 * than by a check-then-write in application code, which would race.
 *
 * TWO-PHASE ON PURPOSE: the row is created FIRST (the claim), and `grantedAt` is stamped only
 * after the drinks actually land. A crash between the two leaves a claimed-but-ungranted row,
 * which a re-run finds and completes. The reverse order (grant, then record) would double-pay on
 * a crash, which is the failure that actually costs you.
 */
const compensationSchema = new mongoose.Schema({
    fighterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fighter",
        required: true,
    },
    /** Campaign key, e.g. "gym-retirement-1.6". Never reuse one. */
    campaign: {
        type: String,
        required: true,
        trim: true,
    },
    /** What the campaign intended to pay. */
    drinks: {
        type: Number,
        required: true,
        min: 0,
    },
    /**
     * What actually landed. Can be LESS than `drinks` when the fighter was at or near the
     * inventory soft cap. Recorded separately so "you got fewer than promised" is answerable
     * from data instead of guesswork.
     */
    granted: {
        type: Number,
        default: null,
    },
    /** Null until the drinks are in the inventory. Null + existing row = interrupted, retryable. */
    grantedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

compensationSchema.index({ fighterId: 1, campaign: 1 }, { unique: true });
compensationSchema.index({ campaign: 1, grantedAt: 1 });

const Compensation = mongoose.model("Compensation", compensationSchema);
module.exports = Compensation;
