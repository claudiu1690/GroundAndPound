const mongoose = require("mongoose");

/**
 * The Circuit v1.1 — one document per unordered pair of fighters who have fought in PvP.
 *
 * The pair is keyed by `pair_key = `${minIdStr}:${maxIdStr}`` (sorted) so (A,B) === (B,A)
 * resolve to the same document. fighter_a is always the lexicographically smaller _id,
 * fighter_b the larger — this keeps a_wins/b_wins unambiguous regardless of who attacks.
 *
 * Upserts go through `findOneAndUpdate(... { upsert:true })`, NEVER saveWithVersionRetry,
 * because this is a separate collection from `fighters` and the atomic upsert is the
 * concurrency guard (two mutual attacks both land cleanly).
 *
 * Rivalries START EMPTY (no historical backfill for beta) — they accrue from the first
 * fight that lands after this ships.
 */
const rivalrySchema = new mongoose.Schema({
    pair_key: { type: String, required: true, unique: true },
    fighter_a: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    fighter_b: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true },
    a_wins: { type: Number, default: 0 },
    b_wins: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    total_fights: { type: Number, default: 0 },
    heat: { type: Number, default: 0, min: 0 },
    leader_id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null }, // null = tied
    last_fought_at: { type: Date, default: null },
    last_winner_id: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", default: null },
    last_method: { type: String, default: null },
    heat_last_decay_at: { type: Date, default: null },
}, { timestamps: true });

rivalrySchema.index({ pair_key: 1 }, { unique: true });
rivalrySchema.index({ fighter_a: 1, heat: -1 });
rivalrySchema.index({ fighter_b: 1, heat: -1 });
rivalrySchema.index({ heat: 1, heat_last_decay_at: 1 });

const Rivalry = mongoose.model("Rivalry", rivalrySchema);
module.exports = Rivalry;
