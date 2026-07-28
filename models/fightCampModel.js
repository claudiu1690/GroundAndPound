const mongoose = require("mongoose");
const { Schema } = mongoose;

// ── Embedded subdocument for each training session taken ─────────────────────
const campSessionSchema = new Schema({
    sessionType:      { type: String, required: true },   // key from CAMP_SESSIONS
    slotIndex:        { type: Number, required: true },   // 0-based slot position
    energySpent:      { type: Number, required: true },
    matchStatus:      { type: String, enum: ["MATCHED", "PARTIAL", "UNMATCHED", "WRONG"], required: true },
    pointsEarned:     { type: Number, required: true },   // modifierContribution × diminishingFactor × matchMultiplier
    diminishingFactor:{ type: Number, required: true },   // 1.0 / 0.6 / 0.3
}, { _id: false });

// ── Main FightCamp document ───────────────────────────────────────────────────
const fightCampSchema = new Schema({
    fightId:   { type: Schema.Types.ObjectId, ref: "Fight",   required: true, unique: true },
    fighterId: { type: Schema.Types.ObjectId, ref: "Fighter", required: true },

    maxSlots:      { type: Number, required: true },
    isShortNotice: { type: Boolean, default: false },

    // The camp-affecting rank-4 perks the fighter held WHEN THIS CAMP WAS CREATED.
    // Frozen deliberately, for the same reason `maxSlots` is: Corner Confidence changes the
    // slot count, which is decided once at creation and cannot be re-derived later without
    // the camp silently gaining or losing a slot mid-build. Freezing all three keeps one
    // rule ("your perks at the moment you accepted the fight") instead of three, and means
    // the sessions already logged can never be re-scored by a perk claimed afterwards.
    perks: { type: [String], default: () => [] },

    sessions:      { type: [campSessionSchema], default: [] },

    // Set on finalise — null until then
    campRating:    { type: String, enum: ["S", "A", "B", "C", "D", "F"], default: null },
    campBreakdown: { type: [Schema.Types.Mixed], default: [] }, // [{ label, matchStatus, pointsEarned }]
    wasSkipped:    { type: Boolean, default: false },

    // v2: conditional session bonuses (populated on finalise, updated after fight)
    sessionBonuses: { type: [Schema.Types.Mixed], default: [] },

    // Special Moves v1 — FROZEN loadout snapshot, computed at camp finalise from the
    // fighter's equipped moves + owned rarities (specialMovesService.buildMoveBonuses).
    // Read at fight resolve instead of rebuilding live, so a mid-camp UPGRADE drop can't
    // change an already-booked fight's power. Empty for legacy/pre-feature camps.
    moveBonuses: { type: [Schema.Types.Mixed], default: [] },

    // v2: hidden wildcard (generated on finalise, excluded from report, revealed post-fight)
    wildcard: { type: Schema.Types.Mixed, default: null },

    // Camp injury state (set when SPARRING_GENERAL triggers an injury)
    isInjured:     { type: Boolean, default: false },
    injuryType:    { type: String, default: null },   // key from CAMP_INJURY_CONFIG
    injuryChoice:  { type: String, enum: ["STOP", "PUSH_THROUGH", null], default: null },
    injuryPenalty: { type: Schema.Types.Mixed, default: null }, // { str: -0.10, ... }

    finalisedAt:   { type: Date, default: null },

    // Shop v1.0 — pre-fight supplement selected for this fight. Selecting does NOT
    // decrement inventory; the buff is consumed (and re-validated) at fight resolve.
    selectedBuffId: { type: String, default: null },
}, { timestamps: true });

fightCampSchema.index({ fighterId: 1 });

const FightCamp = mongoose.model("FightCamp", fightCampSchema);
module.exports = FightCamp;
