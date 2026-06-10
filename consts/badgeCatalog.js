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

function gymBadgeDef(id) {
    const slug = GYM_BADGE_SLUGS[id];
    const meta = GYM_BADGE_NAMES[id];
    return {
        id,
        category: "gym",
        name: meta.name,
        description: meta.description,
        slug,
        condition: (f) => gymRankFor(f, slug) >= 4,
        progress: (f) => prog(gymRankFor(f, slug), 4, "rank"),
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
    STAR_THRESHOLD,
    getBadge,
};
