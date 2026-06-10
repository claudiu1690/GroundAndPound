/**
 * Backfill: Career Page badge ledger (badgesEarned / pinnedBadges / media.beefsStarted).
 *
 * Idempotent. For every fighter:
 *   - badgesEarned       ← init [] if missing
 *   - pinnedBadges       ← init [] if missing
 *   - media.beefsStarted ← max(beefFlags.length, 0) if missing (best-effort backfill)
 *   - run evaluateBadges in "state-only" mode (empty ctx) to retro-award every
 *     field-derived badge (career / style record badges, gym Rank-4, media, fame).
 *   - map legacy `badges` strings for the ctx-only / belt badges that state alone
 *     can't re-derive:
 *        "Resilience"        → comeback_kid
 *        "Callout Win"       → callout_win
 *        "Amateur Champion"  → champ_amateur
 *        "Champion"          → champ_* for the HIGHEST belt tier the fighter has passed
 *                              (Regional Pro / National / GCS) — LOSSY, see note below.
 *        gym Rank-4 strings  → gym badge ids (fallback; the state eval already covers
 *                              fighters whose gymRanks survived)
 *        Documentary legacy  → documentary
 *     All legacy-mapped awards get context = "backfilled".
 *
 * LOSSY NOTE: the legacy "Champion" string does not record which tier's belt was won.
 * We infer the highest belt the fighter has passed from promotionTier: a fighter now
 * at tier T who carries "Champion" is credited with the belt of the tier directly
 * BELOW T (the one they had to win to leave). This under-counts fighters who won
 * multiple belts and over/under-counts edge cases; it is the best available signal.
 *
 * No data is removed. Saves through saveWithVersionRetry to tolerate concurrent ticks.
 *
 * Run: node scripts/backfillBadgesEarned.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const badgeService = require("../services/badgeService");
const { getBadge, GYM_BADGE_SLUGS } = require("../consts/badgeCatalog");
const saveWithVersionRetry = require("../utils/saveWithVersionRetry");

const PROMOTION_TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];

// Tier whose belt the legacy "Champion" string most likely represents, inferred from
// the fighter's CURRENT promotion tier (the tier directly below current). GCS Contender
// is non-winnable, so we skip straight past it.
function inferGenericChampionBadge(promotionTier) {
    const idx = PROMOTION_TIER_ORDER.indexOf(promotionTier);
    if (idx <= 0) return null; // still Amateur (handled by "Amateur Champion" string)
    // The tier directly below current is the belt they had to win to leave it.
    let belowIdx = idx - 1;
    // Skip the non-winnable GCS Contender belt.
    if (PROMOTION_TIER_ORDER[belowIdx] === "GCS Contender") belowIdx -= 1;
    const tier = PROMOTION_TIER_ORDER[belowIdx];
    const map = {
        "Amateur": "champ_amateur",
        "Regional Pro": "champ_regional_pro",
        "National": "champ_national",
        "GCS": "champ_gcs",
    };
    return map[tier] || null;
}

const LEGACY_GYM_BADGE_TO_ID = {
    "Champion Boxer": "boxer_rank4",
    "Grand Master Kickboxer": "kickboxing_rank4",
    "Grand Kru": "muaythai_rank4",
    "Olympic Wrestler": "wrestling_rank4",
    "BJJ Black Belt": "bjj_rank4",
    "Submission Master": "submission_rank4",
    "Fight Scientist": "precision_rank4",
    "Titan": "titan_rank4",
    "Tactician": "warroom_rank4",
    "Elite Master": "elite_rank4",
};

const DOCUMENTARY_LEGACY_BADGE = require("../consts/mediaHubConfig").DOCUMENTARY_BADGE;

function ensureEarned(fighter, badgeId, earnedSet) {
    if (!badgeId) return false;
    if (earnedSet.has(badgeId)) return false;
    if (!getBadge(badgeId)) return false;
    fighter.badgesEarned.push({ badgeId, earnedAt: new Date(), context: "backfilled" });
    earnedSet.add(badgeId);
    return true;
}

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const ids = await Fighter.find({}).distinct("_id");
    let updated = 0;

    for (const id of ids) {
        const saved = await saveWithVersionRetry(
            () => Fighter.findById(id),
            (fighter) => {
                let changed = false;

                if (!Array.isArray(fighter.badgesEarned)) { fighter.badgesEarned = []; changed = true; }
                if (!Array.isArray(fighter.pinnedBadges)) { fighter.pinnedBadges = []; changed = true; }

                fighter.media = fighter.media || {};
                if (typeof fighter.media.beefsStarted !== "number") {
                    fighter.media.beefsStarted = Math.max((fighter.beefFlags || []).length, 0);
                    fighter.markModified("media");
                    changed = true;
                }

                // Lifetime training sessions — best-effort backfill from per-gym counts
                // (free-gym sessions weren't tracked historically, so this can undercount).
                if (typeof fighter.careerTrainingSessions !== "number") {
                    let total = 0;
                    const gr = fighter.gymRanks || {};
                    for (const k of Object.keys(gr)) total += (gr[k] && gr[k].trainingSessions) || 0;
                    fighter.careerTrainingSessions = total;
                    changed = true;
                }

                // 1) State-only retro-award (no ctx). Silent → backfilled badges are
                //    pre-acknowledged (not flagged "new").
                const before = fighter.badgesEarned.length;
                badgeService.evaluateBadges(fighter, {}, { silent: true });
                if (fighter.badgesEarned.length !== before) changed = true;

                // 2) Legacy string mapping for ctx-only / belt / documentary badges.
                const earnedSet = new Set(fighter.badgesEarned.map((b) => b.badgeId));
                const legacy = fighter.badges || [];

                if (legacy.includes("Resilience")) {
                    if (ensureEarned(fighter, "comeback_kid", earnedSet)) changed = true;
                }
                if (legacy.includes("Callout Win")) {
                    if (ensureEarned(fighter, "callout_win", earnedSet)) changed = true;
                }
                if (legacy.includes("Amateur Champion")) {
                    if (ensureEarned(fighter, "champ_amateur", earnedSet)) changed = true;
                }
                if (legacy.includes("Champion")) {
                    const inferred = inferGenericChampionBadge(fighter.promotionTier);
                    if (ensureEarned(fighter, inferred, earnedSet)) changed = true;
                }
                // Gym Rank-4 legacy strings (fallback; state eval covers surviving gymRanks).
                for (const [legacyName, badgeId] of Object.entries(LEGACY_GYM_BADGE_TO_ID)) {
                    if (legacy.includes(legacyName)) {
                        if (ensureEarned(fighter, badgeId, earnedSet)) changed = true;
                    }
                }
                // Documentary legacy badge → documentary.
                if (DOCUMENTARY_LEGACY_BADGE && legacy.includes(DOCUMENTARY_LEGACY_BADGE)) {
                    if (ensureEarned(fighter, "documentary", earnedSet)) changed = true;
                }

                if (changed && typeof fighter.markModified === "function") {
                    fighter.markModified("badgesEarned");
                }
                // Stash a flag so the outer loop can count meaningfully-changed docs.
                fighter.$locals = fighter.$locals || {};
                fighter.$locals.badgeBackfillChanged = changed;
            }
        );
        if (saved && saved.$locals && saved.$locals.badgeBackfillChanged) updated += 1;
    }

    console.log(`Backfill complete — touched ${updated}/${ids.length} fighters`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
