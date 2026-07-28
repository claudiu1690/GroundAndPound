/**
 * ⚠️ DO NOT DELETE — THE HOME CAMP READS THIS AFTER THE GYMS RETIRE.
 *
 * When `GYMS_RETIRED=true` the ten gyms stop being playable, and this file starts LOOKING
 * deletable. It is not. The Gym collection and `data/gyms.json` remain read-only inputs to:
 *
 *   · `consts/homeCampConfig.js#GYM_PERK_CATALOG` — EVERY camp Rank-4 perk's name and effect
 *     text is read out of `data/gyms.json` at require time, so the camp and the (retired) gym
 *     can never disagree about what a perk is called.
 *   · `validateHomeCampConfig()` — FAILS THE BOOT if `data/gyms.json` is missing or if a slug
 *     has no `GYM_SLUG_TO_DOMAIN` entry.
 *   · `homeCampService.loadGymSlugMap` / `deriveInitialCampState` — converts a player's gym
 *     history into their camp's starter coach; needs `{_id → slug}` from this collection.
 *   · `consts/badgeCatalog.js` — 10 gym badge definitions keyed by these slugs.
 *
 * The later clean-up change deletes `trainingService.js`, `gymRankService.js`, `gymController.js`
 * and `gymRoutes.js`. It must NEVER delete this model, `data/gyms.json`, the Gym collection,
 * `fighter.gymRanks`, `fighter.gymPerks`, the 10 badge defs, or `GYM_PERK_CATALOG`.
 */
const mongoose = require("mongoose");

const rankSchema = new mongoose.Schema({
    rank: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    requirements: {
        trainingSessions: { type: Number, default: 0 },
        relevantWins: { type: Number, default: 0 },
        ironCost: { type: Number, default: 0 },
    },
    unlock: {
        type: { type: String, enum: ["access", "session", "xpBonus", "perk"] },
        sessionKey: { type: String, default: null },
        xpBonusPct: { type: Number, default: null },
        perkId: { type: String, default: null },
        perkName: { type: String, default: null },
        perkEffect: { type: String, default: null },
        badge: { type: String, default: null },
    },
}, { _id: false });

const gymSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    tagline: { type: String, default: "" },
    description: { type: String, default: "" },
    focusStats: [{ type: String }],
    availableFrom: { type: String, required: true },
    weeklyCost: { type: Number, default: 0 },
    xpMultiplier: { type: Number, default: 1.0 },
    focusXpMultiplier: { type: Number, default: 1.0 },
    isFreeGym: { type: Boolean, default: false },
    rankNames: [{ type: String }],
    ranks: [rankSchema],
    sessions: [{ type: String }],
    relevantWinTypes: [{ type: String }],
}, { timestamps: true });

gymSchema.index({ slug: 1 });

const Gym = mongoose.model("Gym", gymSchema);
module.exports = Gym;
