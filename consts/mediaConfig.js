/**
 * Media Hub (Phase 6).
 *
 * Three media actions:
 *   1. Podcast — weekly, 5 energy. Three segments:
 *        a) Recap last fight  → small fame, small iron, always available (if you have a last fight).
 *        b) Division talk     → pick a roster fighter + tone (Respectful / Trash / Cryptic).
 *             Respectful: small fame + respect flag (on a win vs that fighter: +15% iron).
 *             Trash:      bigger fame + beef flag (on a win vs them: +30% fame via existing grudge hook;
 *                         if they never appear in 4 fight cycles, -150 fame when the flag lapses).
 *             Cryptic:    tiny fame, no side-effects.
 *        c) Predict main event → delegates to mainEventService; the existing prediction rewards apply.
 *
 *   2. Documentary — once per career, unlocks at Star fame tier. Big fame lump sum + "Documentary"
 *      badge (unlocks BADGE_DOCUMENTARY banner piece).
 *
 *   3. Interview archive — read-only. Lists past post-fight interviews.
 */

const PODCAST_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // once per week
const PODCAST_ENERGY_COST = 5;

/** Segment definitions drive rewards + UI. */
const PODCAST_SEGMENTS = {
    RECAP: {
        key: "RECAP",
        label: "Recap your last fight",
        fameReward: 100,
        ironReward: 150,
        requiresLastFight: true,
    },
    DIVISION: {
        key: "DIVISION",
        label: "Talk about the division",
        requiresTarget: true,
        tones: {
            RESPECTFUL: {
                key: "RESPECTFUL",
                label: "Respectful",
                tagline: "Pay respect. Build up a future fight.",
                fameReward: 100,
                emitRespectFlag: true,
                respectExpiresAfterFights: 6,
            },
            TRASH: {
                key: "TRASH",
                label: "Trash Talk",
                tagline: "Call them out on the mic. Risk fame if they never show.",
                fameReward: 300,
                emitBeefFlag: true,
                beefExpiresAfterFights: 4,
            },
            CRYPTIC: {
                key: "CRYPTIC",
                label: "Cryptic",
                tagline: "Say nothing. Say everything.",
                fameReward: 40,
            },
        },
    },
    PREDICT: {
        key: "PREDICT",
        label: "Predict the main event",
        // No direct reward here — rewards come from the mainEventService when it resolves.
    },
};

/** Documentary: once per career. Big payout, locks itself. */
const DOCUMENTARY = {
    unlockTier: "STAR",
    fameReward: 1500,
    ironReward: 2000,
    badge: "Documentary",
};

/** Fame penalty when a TRASH beef flag lapses (opponent never shown up). */
const BEEF_LAPSE_PENALTY_FAME = 150;

/** Win-vs-respect-flagged opponent: iron purse multiplier bump. */
const RESPECT_WIN_IRON_MULT = 1.15;

/** Up to 8 division-talk candidates shown per tier. */
const DIVISION_ROSTER_LIMIT_PER_TIER = 8;

module.exports = {
    PODCAST_COOLDOWN_MS,
    PODCAST_ENERGY_COST,
    PODCAST_SEGMENTS,
    DOCUMENTARY,
    BEEF_LAPSE_PENALTY_FAME,
    RESPECT_WIN_IRON_MULT,
    DIVISION_ROSTER_LIMIT_PER_TIER,
};
