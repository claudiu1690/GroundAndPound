/**
 * Badge Catalog — Career Page / badge system.
 *
 * Each badge def:
 *   { id, category, subgroup?, name, description,
 *     condition(f, ctx) -> bool,
 *     progress?(f) -> { current, target, unit },
 *     contextFmt?(f, ctx) -> string }
 *
 * Conditions read persistent fighter fields where possible and `ctx` for
 * one-shot fight facts (knockdown, end-health, callout win, etc.). Every accessor
 * is null-guarded; progress.current is clamped to [0, target] by the caller and here.
 *
 * STAR threshold (40000) is sourced from notorietyConfig (NOTORIETY_TIERS.STAR.min),
 * NOT the mockup's 15000.
 */

const { tierRank, NOTORIETY_TIERS } = require("./notorietyConfig");

const STAR_THRESHOLD = NOTORIETY_TIERS.STAR.min; // 40000
const RISING_STAR_RANK = tierRank("RISING_STAR");
const STAR_RANK = tierRank("STAR");

// Promotion ladder. By game rules a fighter can only leave a winnable tier by
// beating its champion, so reaching any tier proves they won the title of every
// WINNABLE tier strictly below it. GCS Contender (index 3) is non-winnable — you
// advance from it to GCS via OVR, not a belt — so it is never credited this way.
const PROMOTION_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];
function promoIndex(t) {
    const i = PROMOTION_ORDER.indexOf(t);
    return i < 0 ? 0 : i;
}
/** True once the fighter has advanced PAST `tier` (⇒ they won that tier's title). */
function passedTier(f, tier) {
    return promoIndex(f && f.promotionTier) > promoIndex(tier);
}

const BADGE_CATEGORIES = [
    { key: "career", label: "Career" },
    { key: "championships", label: "Championships" },
    { key: "style", label: "Style" },
    { key: "gym", label: "Gym" },
    { key: "media", label: "Media" },
];

// ── safe accessors ──────────────────────────────────────────────
function num(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function rec(f) {
    return (f && f.record) || {};
}
function wins(f) { return num(rec(f).wins); }
function losses(f) { return num(rec(f).losses); }
function draws(f) { return num(rec(f).draws); }
function koWins(f) { return num(rec(f).koWins); }
function subWins(f) { return num(rec(f).subWins); }
function decisionWins(f) { return num(rec(f).decisionWins); }
function winStreak(f) { return num(f && f.winStreak); }
function totalFights(f) { return wins(f) + losses(f) + draws(f); }
function notorietyScore(f) { return num(f && f.notoriety && f.notoriety.score); }
function peakTierRank(f) { return tierRank((f && f.notoriety && f.notoriety.peakTier) || "UNKNOWN"); }
function gymRankFor(f, slug) {
    const gr = (f && f.gymRanks) || {};
    const entry = gr[slug];
    if (!entry) return 0;
    return num(entry.rank);
}
function clampCurrent(current, target) {
    const c = num(current);
    const t = num(target) || 1;
    return Math.max(0, Math.min(c, t));
}
function prog(current, target, unit) {
    const t = num(target) || 1;
    return { current: clampCurrent(current, t), target: t, unit: unit || "" };
}

// Decision-outcome detector for fight ctx.
function isDecisionOutcome(outcome) {
    return outcome === "Decision (unanimous)" || outcome === "Decision (split)";
}

// id → gym slug map (verified against data/gyms.json).
const GYM_BADGE_SLUGS = {
    boxer_rank4: "iron-fist-boxing",
    kickboxing_rank4: "dragon-kickboxing",
    muaythai_rank4: "warrior-muay-thai",
    wrestling_rank4: "apex-wrestling",
    bjj_rank4: "gracie-ground-game",
    submission_rank4: "renzo-combat",
    precision_rank4: "precision-mma-lab",
    titan_rank4: "titan-performance",
    warroom_rank4: "the-war-room",
    elite_rank4: "elite-fight-academy",
};

const GYM_BADGE_NAMES = {
    boxer_rank4: { name: "Champion Boxer", description: "Reach Rank 4 at Iron Fist Boxing." },
    kickboxing_rank4: { name: "Grand Master Kickboxer", description: "Reach Rank 4 at Dragon Kickboxing." },
    muaythai_rank4: { name: "Grand Kru", description: "Reach Rank 4 at Warrior Muay Thai." },
    wrestling_rank4: { name: "Olympic Wrestler", description: "Reach Rank 4 at Apex Wrestling Academy." },
    bjj_rank4: { name: "BJJ Black Belt", description: "Reach Rank 4 at Gracie Ground Game." },
    submission_rank4: { name: "Submission Master", description: "Reach Rank 4 at Renzo Combat Systems." },
    precision_rank4: { name: "Fight Scientist", description: "Reach Rank 4 at Precision MMA Lab." },
    titan_rank4: { name: "Titan", description: "Reach Rank 4 at Titan Performance Center." },
    warroom_rank4: { name: "Tactician", description: "Reach Rank 4 at The War Room." },
    elite_rank4: { name: "Elite Master", description: "Reach Rank 4 at Elite Fight Academy." },
};

/**
 * HOME CAMP RE-POINT (Phase 2, decision P2-D2 — "Option C: re-point 4, legacy 6").
 *
 * There are 10 gym badges and only 4 coach archetypes, and `GYM_SLUG_TO_DOMAIN` collapses FOUR
 * striking gyms into one STRIKING domain — so re-pointing all ten would award four badges for a
 * single Rank-4 Striking coach. Instead exactly four are re-pointed, chosen so THE BADGE FOLLOWS
 * THE PERK: each archetype already inherits its Rank-4 perk from one specific gym
 * (homeCampConfig.COACH_ARCHETYPES[*].perkKey), and that same gym's badge is the one that moves.
 *
 *   STRIKING     ← iron-fist-boxing   (corner_confidence)    → boxer_rank4     "Champion Boxer"
 *   WRESTLING    ← apex-wrestling     (mat_returns)          → wrestling_rank4 "Olympic Wrestler"
 *   BJJ          ← gracie-ground-game (submission_awareness) → bjj_rank4       "BJJ Black Belt"
 *   CONDITIONING ← warrior-muay-thai  (iron_conditioning)    → muaythai_rank4  "Grand Kru"
 *
 * The other six stay LEGACY: still earnable while the gyms are open, still displayed forever
 * once earned, unobtainable after the cutover. `badgeService` excludes a LOCKED legacy badge
 * from `lockedCount` so nobody's completion percentage is permanently six short.
 */
const GYM_BADGE_TO_ARCHETYPE = Object.freeze({
    boxer_rank4: "STRIKING",
    wrestling_rank4: "WRESTLING",
    bjj_rank4: "BJJ",
    muaythai_rank4: "CONDITIONING",
});

/**
 * Player-facing archetype wording for the re-pointed descriptions. Hardcoded rather than
 * imported from `consts/homeCampConfig.js` on purpose: this catalog is required by the fighter
 * profile path and must not drag the whole camp config (and its boot validator, and its
 * data/gyms.json read) in behind it.
 */
const ARCHETYPE_CAMP_CLAUSE = Object.freeze({
    STRIKING: "or take a Striking coach to Rank 4 in your camp.",
    WRESTLING: "or take a Wrestling coach to Rank 4 in your camp.",
    BJJ: "or take a BJJ Professor to Rank 4 in your camp.",
    CONDITIONING: "or take a Conditioning coach to Rank 4 in your camp.",
});

/**
 * 4 if the fighter has taken this archetype to Rank 4 in their Home Camp, else 0.
 *
 * Reads the DENORMALISED `fighter.campRank4Archetypes` (written additively by
 * homeCampCoachService) because badge conditions are synchronous functions of the fighter
 * document and cannot query the HomeCamp collection.
 */
function campRank4For(f, archetype) {
    const list = f && f.campRank4Archetypes;
    return Array.isArray(list) && list.includes(archetype) ? 4 : 0;
}

function gymBadgeDef(id) {
    const slug = GYM_BADGE_SLUGS[id];
    const meta = GYM_BADGE_NAMES[id];
    const arche = GYM_BADGE_TO_ARCHETYPE[id] || null;

    /**
     * ⚠️ `Math.max(gym, camp)` — COMBINED, NEVER REPLACING, NEVER AN if/else.
     *
     * THAT ONE WORD IS THE ENTIRE "cannot regress for veterans" GUARANTEE. `gymRankFor` stays
     * primary and is never consulted conditionally, so this function is monotonically
     * non-decreasing by construction: a veteran sitting at gym Rank 4 keeps reading 4 whatever
     * their camp says, and a camp-only player reads 4 from the camp side. Refactoring this into
     * `arche ? campRank4For(...) : gymRankFor(...)` would silently zero the progress bar of
     * every player who earned this at a gym and never opened the camp screen.
     */
    const rankOf = (f) => Math.max(gymRankFor(f, slug), arche ? campRank4For(f, arche) : 0);

    return {
        id,
        category: "gym",
        // ⚠️ NAMES NEVER CHANGE. A badge already pinned on a Career Page must not be renamed
        // under the player. Only the four re-pointed DESCRIPTIONS gain an "or" clause.
        name: meta.name,
        description: arche ? `${meta.description} — ${ARCHETYPE_CAMP_CLAUSE[arche]}` : meta.description,
        slug,
        archetype: arche,
        /**
         * LEGACY = this badge has no camp route, so once the gyms retire it becomes
         * unobtainable. Consumed by badgeService (excluded from `lockedCount`) and rendered as
         * a "Retired" chip. It is NOT a deletion marker:
         *
         * ⚠️ ALL 10 GYM BADGE DEFS STAY IN THIS CATALOG FOREVER. `buildBadgeProfile` renders
         * from the earned ledger by looking each id up here — delete a def and `getBadge(id)`
         * returns undefined and the badge SILENTLY VANISHES from the Career Page of every
         * veteran who earned it. That is the sharpest edge in this whole change.
         */
        legacy: !arche,
        condition: (f) => rankOf(f) >= 4,
        progress: (f) => prog(rankOf(f), 4, "rank"),
    };
}

// ── catalog ─────────────────────────────────────────────────────
const BADGES = [
    // ── career ──
    {
        id: "first_blood", category: "career", name: "First Blood",
        description: "Win your first professional fight.",
        condition: (f) => wins(f) >= 1,
    },
    {
        id: "wins_10", category: "career", name: "10 Wins",
        description: "Reach 10 career wins.",
        condition: (f) => wins(f) >= 10,
        progress: (f) => prog(wins(f), 10, "wins"),
    },
    {
        id: "wins_25", category: "career", name: "25 Wins",
        description: "Reach 25 career wins.",
        condition: (f) => wins(f) >= 25,
        progress: (f) => prog(wins(f), 25, "wins"),
    },
    {
        id: "wins_50", category: "career", name: "50 Wins",
        description: "Reach 50 career wins.",
        condition: (f) => wins(f) >= 50,
        progress: (f) => prog(wins(f), 50, "wins"),
    },
    {
        id: "streak_5", category: "career", name: "On a Roll",
        description: "Win 5 fights in a row.",
        condition: (f) => winStreak(f) >= 5,
        progress: (f) => prog(winStreak(f), 5, "win streak"),
    },
    {
        id: "streak_10", category: "career", name: "Unstoppable",
        description: "Win 10 fights in a row.",
        condition: (f) => winStreak(f) >= 10,
        progress: (f) => prog(winStreak(f), 10, "win streak"),
    },
    {
        id: "streak_20", category: "career", name: "Untouchable",
        description: "Win 20 fights in a row.",
        condition: (f) => winStreak(f) >= 20,
        progress: (f) => prog(winStreak(f), 20, "win streak"),
    },
    {
        id: "division_dominator", category: "career", name: "Division Dominator",
        description: "Reach #1 in your division's rankings.",
        // ranking.rank is stored 1-based with 1 = champion slot; display shift makes
        // reaching display-#1 equal to DB rank 2. We accept either signal: a stored
        // rank of 1 (legacy / direct) or the display-shifted #1.
        condition: (f) => {
            const r = f && f.ranking && f.ranking.rank;
            return r === 1 || r === 2;
        },
    },
    {
        id: "long_game", category: "career", name: "The Long Game",
        description: "Compete in 50 career fights.",
        condition: (f) => totalFights(f) >= 50,
        progress: (f) => prog(totalFights(f), 50, "fights"),
    },
    {
        id: "veteran", category: "career", name: "Veteran",
        description: "Compete in 100 career fights.",
        condition: (f) => totalFights(f) >= 100,
        progress: (f) => prog(totalFights(f), 100, "fights"),
    },

    // ── championships (keyed by ctx.beltWonForTier at award time) ──
    {
        id: "champ_amateur", category: "championships", name: "Amateur Champion",
        description: "Win the Amateur title.",
        // Won live (ctx) OR proven by having advanced past the Amateur tier.
        condition: (f, ctx) => (ctx && ctx.beltWonForTier === "Amateur") || passedTier(f, "Amateur"),
    },
    {
        id: "champ_regional_pro", category: "championships", name: "Regional Pro Champion",
        description: "Win the Regional Pro title.",
        condition: (f, ctx) => (ctx && ctx.beltWonForTier === "Regional Pro") || passedTier(f, "Regional Pro"),
    },
    {
        id: "champ_national", category: "championships", name: "National Champion",
        description: "Win the National title.",
        condition: (f, ctx) => (ctx && ctx.beltWonForTier === "National") || passedTier(f, "National"),
    },
    {
        id: "champ_gcs_contender", category: "championships", name: "GCS Contender Champion",
        description: "The GCS Contender belt is not a winnable title.",
        // Non-winnable by design — never awardable.
        condition: () => false,
    },
    {
        id: "champ_gcs", category: "championships", name: "GCS Champion",
        description: "Win the GCS world title.",
        condition: (f, ctx) => ctx && ctx.beltWonForTier === "GCS",
    },

    // ── style ──
    {
        id: "finisher", category: "style", name: "Finisher",
        description: "Earn 10 finishes (KO/TKO + Submission).",
        condition: (f) => koWins(f) + subWins(f) >= 10,
        progress: (f) => prog(koWins(f) + subWins(f), 10, "finishes"),
    },
    {
        id: "ko_artist", category: "style", name: "KO Artist",
        description: "Win 10 fights by KO/TKO.",
        condition: (f) => koWins(f) >= 10,
        progress: (f) => prog(koWins(f), 10, "KO wins"),
    },
    {
        id: "sub_hunter", category: "style", name: "Submission Hunter",
        description: "Win 10 fights by submission.",
        condition: (f) => subWins(f) >= 10,
        progress: (f) => prog(subWins(f), 10, "sub wins"),
    },
    {
        id: "decision_machine", category: "style", name: "Decision Machine",
        description: "Win 10 fights by decision.",
        condition: (f) => decisionWins(f) >= 10,
        progress: (f) => prog(decisionWins(f), 10, "decision wins"),
    },
    {
        id: "iron_chin", category: "style", name: "Iron Chin",
        description: "Win a fight after being knocked down.",
        condition: (f, ctx) => !!(ctx && ctx.wasKnockedDown && ctx.isWin),
    },
    {
        id: "iron_will", category: "style", name: "Iron Will",
        description: "Win a fight with less than 30% health remaining.",
        condition: (f, ctx) => !!(ctx && ctx.isWin && num(ctx.endedHealthPct) < 30),
    },
    {
        id: "giant_killer", category: "style", name: "Giant Killer",
        description: "Beat an opponent rated 10+ overall above you.",
        condition: (f, ctx) => !!(ctx && ctx.isWin && (num(ctx.oppOvr) - num(f && f.overallRating)) >= 10),
    },
    {
        id: "comeback_kid", category: "style", name: "Comeback Kid",
        description: "Win a fight while in Comeback Mode.",
        condition: (f, ctx) => !!(ctx && ctx.isWin && ctx.wasComeback),
    },
    {
        id: "fight_of_night", category: "style", name: "Fight of the Night",
        description: "Win a back-and-forth decision (opponent under 50% health).",
        condition: (f, ctx) =>
            !!(ctx && ctx.isWin && isDecisionOutcome(ctx.outcome) && num(ctx.oppEndHealthPct) < 50),
    },
    {
        id: "perfect_camp", category: "style", name: "Perfect Camp",
        description: "Win a fight after a perfect (S-grade) training camp.",
        condition: (f, ctx) => !!(ctx && ctx.campGrade === "S"),
    },
    {
        id: "callout_win", category: "style", name: "Called It",
        description: "Win a fight against an opponent you called out.",
        condition: (f, ctx) => !!(ctx && ctx.isCalloutWin),
    },

    // ── style / rivalries subgroup ──
    {
        id: "nemesis_slayer", category: "style", subgroup: "rivalries", name: "Nemesis Slayer",
        description: "Avenge a loss by defeating your nemesis.",
        condition: (f, ctx) => !!(ctx && ctx.nemesisCleared),
    },
    {
        id: "beef_paid_off", category: "style", subgroup: "rivalries", name: "All Talk? Not You.",
        description: "Win a fight against an opponent you had beef with.",
        condition: (f, ctx) => !!(ctx && ctx.beefMatched && ctx.isWin),
    },
    {
        id: "serial_beefcake", category: "style", subgroup: "rivalries", name: "Serial Beefcake",
        description: "Have 3 active beefs at the same time.",
        condition: (f) => Array.isArray(f && f.beefFlags) && f.beefFlags.length >= 3,
    },

    // ── gym (Rank 4 at each gym) ──
    gymBadgeDef("boxer_rank4"),
    gymBadgeDef("kickboxing_rank4"),
    gymBadgeDef("muaythai_rank4"),
    gymBadgeDef("wrestling_rank4"),
    gymBadgeDef("bjj_rank4"),
    gymBadgeDef("submission_rank4"),
    gymBadgeDef("precision_rank4"),
    gymBadgeDef("titan_rank4"),
    gymBadgeDef("warroom_rank4"),
    gymBadgeDef("elite_rank4"),

    // ── gym (training-session milestones) ──
    {
        id: "sessions_50", category: "gym", name: "Gym Regular",
        description: "Complete 50 training sessions.",
        condition: (f) => num(f && f.careerTrainingSessions) >= 50,
        progress: (f) => prog(num(f && f.careerTrainingSessions), 50, "sessions"),
    },
    {
        id: "sessions_100", category: "gym", name: "Gym Rat",
        description: "Complete 100 training sessions.",
        condition: (f) => num(f && f.careerTrainingSessions) >= 100,
        progress: (f) => prog(num(f && f.careerTrainingSessions), 100, "sessions"),
    },
    {
        id: "sessions_250", category: "gym", name: "Tireless",
        description: "Complete 250 training sessions.",
        condition: (f) => num(f && f.careerTrainingSessions) >= 250,
        progress: (f) => prog(num(f && f.careerTrainingSessions), 250, "sessions"),
    },

    // ── media ──
    {
        id: "first_episode", category: "media", name: "On the Mic",
        description: "Record your first podcast episode.",
        condition: (f) => num(f && f.media && f.media.episodeCount) >= 1,
    },
    {
        id: "media_star", category: "media", name: "Media Star",
        description: "Record 20 podcast episodes.",
        condition: (f) => num(f && f.media && f.media.episodeCount) >= 20,
        progress: (f) => prog(num(f && f.media && f.media.episodeCount), 20, "episodes"),
    },
    {
        id: "documentary", category: "media", name: "The Documentary",
        description: "Release your career documentary.",
        condition: (f) => (f && f.media && f.media.documentaryStatus) === "recorded",
        progress: (f) => prog(notorietyScore(f), STAR_THRESHOLD, "fame"),
    },
    {
        id: "controversy", category: "media", name: "Controversy",
        description: "Start 10 beefs over your career.",
        condition: (f) => num(f && f.media && f.media.beefsStarted) >= 10,
        progress: (f) => prog(num(f && f.media && f.media.beefsStarted), 10, "beefs started"),
    },
    {
        id: "peoples_champion", category: "media", name: "People's Champion",
        description: "Reach Rising Star fame.",
        condition: (f) => peakTierRank(f) >= RISING_STAR_RANK,
    },
    {
        id: "star_power", category: "media", name: "Star Power",
        description: "Reach Star fame.",
        condition: (f) => peakTierRank(f) >= STAR_RANK,
        progress: (f) => prog(notorietyScore(f), STAR_THRESHOLD, "fame"),
    },
];

const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

function getBadge(id) {
    return BADGE_BY_ID.get(id) || null;
}

module.exports = {
    BADGES,
    BADGE_CATEGORIES,
    GYM_BADGE_SLUGS,
    // PHASE 2 — the Home Camp re-point (P2-D2 Option C)
    GYM_BADGE_TO_ARCHETYPE,
    campRank4For,
    STAR_THRESHOLD,
    getBadge,
};
