const mongoose = require("mongoose");
const {
    ARCHETYPE_KEYS,
    COACH_RARITIES,
    COACH_MAX_RANK,
    CONDITION_MAX,
    MAX_CAMP_TIER,
    CAMP_NAME_MIN,
    CAMP_NAME_MAX,
} = require("../consts/homeCampConfig");

/**
 * Home Camp — the player's own training camp ("My Camp"). One doc per fighter.
 *
 * NAMING: `camp*` on the backend means the FIGHT camp (models/fightCampModel.js, GDD §9).
 * This is the HOME camp; everything here carries the `homeCamp` prefix.
 *
 * SEPARATE COLLECTION on purpose: this doc is write-heavy (condition, per-coach session
 * counters), swept by a daily job, and read by nothing but the camp screen — while
 * fighterModel.js is ~490 lines and serialised on nearly every request.
 *
 * Coaches are EMBEDDED: bounded (≤4 roster, ≤4 market candidates), always read with the
 * parent, never queried on their own.
 */

const coachSchema = new mongoose.Schema({
    archetype: { type: String, enum: ARCHETYPE_KEYS, required: true },
    // Computed once at creation and STORED — a coach's name must never change under
    // the player, and Phase-0 starter names are fixed (anti-reroll).
    name: { type: String, required: true },
    initials: { type: String, required: true },
    rarity: { type: String, enum: COACH_RARITIES, default: "COMMON" },
    traitKey: { type: String, default: null },   // PHASE 1
    wage: { type: Number, default: 0, min: 0 },  // PHASE 1 (Phase-0 starter is free)
    isStarter: { type: Boolean, default: false },
    hiredAt: { type: Date, default: Date.now },
    rank: { type: Number, default: 1, min: 1, max: COACH_MAX_RANK },
    // The rank this coach was AT WHEN HE JOINED — 1 for every market hire and every new-camp
    // starter, and the converted gym rank for a migrated head coach.
    //
    // ⚠️ THIS IS WHAT SEPARATES "THE PLAYER PAID FOR THIS RANK" FROM "HE ARRIVED WITH IT",
    // and that distinction decides whether a teach slot he has already ranked past can be
    // claimed. Promotions the player bought in the camp earn their move; ranks a gym veteran
    // was converted in at do NOT (that rule exists so a Rank-4 conversion can't hand over a
    // whole Legendary teach pool for $0). Absent on documents written before this field
    // existed — `resolveJoinedAtRank` derives a conservative fallback rather than assuming 1,
    // which would retro-grant exactly the case the rule forbids.
    joinedAtRank: { type: Number, min: 1, max: COACH_MAX_RANK, default: 1 },
    // Sessions run WITH THIS COACH (not the fighter's career total).
    sessionsCompleted: { type: Number, default: 0, min: 0 },
    relevantWins: { type: Number, default: 0, min: 0 },
    // PHASE 1 decay/quit. Pinned at 100 in Phase 0 so the response shape never breaks.
    morale: { type: Number, default: 100, min: 0, max: 100 },
    // The fee ACTUALLY charged, frozen at generation. Stored (not re-derived) so a later
    // rebalance of RARITY_ECONOMICS can never rewrite history on an existing roster — and so
    // the fire/refund UI can always show what this coach really cost. Starter coaches: 0.
    hireFee: { type: Number, default: 0, min: 0 },
    // Last time this coach ran a session. Drives the −3/week "unused coach" morale decay.
    // null on an existing doc means "never used" — but the first weekly tick after migration
    // deliberately skips history (lastWeeklyTickIndex < 0), so nobody is retro-punished.
    lastSessionAt: { type: Date, default: null },
    // LEGENDARY only — PHASE 2 builds the drill this key points at. Phase 1 just records it,
    // and deliberately does NOT advertise it on the hire card.
    exclusiveSessionKey: { type: String, default: null },
    // Ordered, frozen at hire. Granting the moves is PHASE 2.
    teachPoolMoveIds: { type: [String], default: () => [] },
    taughtMoveIds: { type: [String], default: () => [] }, // PHASE 2
}, { _id: true });   // the subdoc _id IS the public coachId
//
// ⚠️ ONE coachSchema. Market candidates are stored with the SAME schema as roster coaches
// (homeCampSchema.market.candidates below) and a hire simply MOVES the subdoc across, keeping
// its _id — so candidateId === coachId. Forking a separate candidateSchema is how the hire
// card and the coach card start disagreeing about wage, trait or teach pool.

const homeCampSchema = new mongoose.Schema({
    fighterId: { type: mongoose.Schema.Types.ObjectId, ref: "Fighter", required: true, unique: true },
    name: { type: String, default: "", trim: true, minlength: CAMP_NAME_MIN, maxlength: CAMP_NAME_MAX },
    // Seeded at creation from the migrated head-coach gym (or the fighter's style) and
    // IMMUTABLE thereafter — it is the camp's identity, not a setting.
    focusDomain: { type: String, enum: ARCHETYPE_KEYS, required: true },
    // STORED tier — only renovation (PHASE 1) raises it. The tier the camp actually runs at
    // is homeCampConfig.effectiveTier(camp, fighter), which floors it by promotion tier.
    tier: { type: Number, default: 1, min: 1, max: MAX_CAMP_TIER },
    condition: {
        value: { type: Number, default: CONDITION_MAX, min: 0, max: CONDITION_MAX },
        lastNeglectAt: { type: Date, default: Date.now },
        // "YYYY-MM-DD" UTC. THE idempotency key for neglect decay — running the daily job
        // five times in one day must apply -2 once, not -10.
        lastNeglectDayKey: { type: String, default: null },
        // "YYYY-MM-DD" UTC of the last camp session; suppresses neglect for that day.
        lastSessionDayKey: { type: String, default: null },
    },
    coaches: { type: [coachSchema], default: () => [] },   // max enforced in the service
    // PHASE 1 — the trainer market. Rolled lazily on read (no job), seeded deterministically.
    market: {
        weekIndex: { type: Number, default: -1 },
        candidates: { type: [coachSchema], default: () => [] },
    },
    // Map<domain, {bankedSessions, bankedWins}> — the "trainer-XP credit" half of the gym
    // migration. Consumed in PHASE 1 when a coach of that domain is hired.
    disciplineFamiliarity: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    // PHASE 1 wages/morale idempotency. The weekly job CLAIMS a camp by compare-and-setting
    // this BEFORE any debit, so a crash mid-tick costs the player a free week rather than
    // charging them twice. -1 means "never ticked": the first tick processes NO history.
    lastWeeklyTickIndex: { type: Number, default: -1 },
    nextWageDebitAt: { type: Date, default: null },        // PHASE 1, display only
    // Consecutive weeks the wage bill could not be paid in full. Compounds the condition
    // penalty (−5/wk × this, capped ×4) and drives the unpaid morale hit.
    consecutiveUnpaidWeeks: { type: Number, default: 0, min: 0 },
    // Receipt for the last wage run — the camp bar shows the player what actually happened
    // instead of leaving them to infer it from a missing pile of cash.
    lastWageDebit: {
        at: { type: Date, default: null },
        amount: { type: Number, default: 0 },
        paid: { type: Boolean, default: true },
    },
    origin: {
        source: { type: String, enum: ["NEW", "GYM_MIGRATION"], default: "NEW" },
        sourceGymSlug: { type: String, default: null },
        convertedAt: { type: Date, default: null },
        // Bumping this may only ever RAISE rank/sessions/wins/familiarity — never lower.
        conversionVersion: { type: Number, default: 1 },
    },
}, { timestamps: true });

// One camp per fighter. This unique index IS the concurrency guard for ensureCamp:
// two simultaneous first-reads race, one gets E11000, catches, and re-reads.
homeCampSchema.index({ fighterId: 1 }, { unique: true });
// Daily condition-decay sweep scan.
homeCampSchema.index({ "condition.lastNeglectAt": 1 });
// PHASE 1 weekly wage/morale sweep scan.
homeCampSchema.index({ lastWeeklyTickIndex: 1 });

module.exports = mongoose.model("HomeCamp", homeCampSchema);
