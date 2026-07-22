/**
 * Ground & Pound — PVP ladder bot roster (single source of truth).
 *
 * 25 hand-built bots. `dp` drives division (pvpConfig.divisionForDp):
 *   prospect <300 · contender 300-1199 · challenger 1200-2499.
 * `ovr` is kept inside each tier's band; record + total fights scale with tier;
 * `lastDays` is 0-4 ("active in the last few days") and only seeds the initial record.
 *
 * Tier mix (NO elite, NO champions — those divisions belong to real players):
 *   18 Prospect · 4 Contender · 3 Challenger
 *
 * ── LIVE IDENTITIES ─────────────────────────────────────────────────────────
 * The first 15 entries are ALREADY IN PRODUCTION with these exact names, nicknames,
 * styles, OVR and DP. They were moved here verbatim from scripts/seedPvpBots.js.
 * Do NOT rename/retune them — players have fight history against these fighters and
 * the seed's natural key is { isPvpBot, firstName, lastName }. Changing a name orphans
 * the existing Fighter and creates a duplicate.
 *
 * ── BANNERS ─────────────────────────────────────────────────────────────────
 * Every bot gets a DISTINCT banner (all 25 combinations are unique) so the ladder
 * doesn't show 25 identical default nameplates — the single most obvious "these are
 * bots" tell.
 *
 * Banner rule (enforced by tests/services/pvpBot.test.js):
 *   - A bot may only wear pieces gated by `always` / `notorietyTier` / `promotionTier`
 *     / `totalWins` at or BELOW its plausible tier:
 *       Prospect   → up to notorietyTier PROSPECT
 *       Contender  → up to notorietyTier RISING_STAR
 *       Challenger → up to notorietyTier CONTENDER
 *   - NEVER a piece gated by `badge:` or `beltsWon:` — a bot cannot earn badges (see
 *     pvpFightService: badge evaluation is skipped for isPvpBot) and cannot hold a belt
 *     (BOT_MAX_DP caps them below Elite). Wearing one would be an impossible flex and a
 *     dead giveaway.
 *   - badgeSlots is ALWAYS [] for the same reason.
 *
 * Field names mirror models/fighterModel.js `banner`: { backgroundId, frameId,
 * accentColor, badgeSlots }.
 */

// ── Prospect-tier banner vocabulary (always / PROSPECT gated) ────────────────
//   backgrounds: BG_SLATE(always) BG_CRIMSON(PROSPECT) BG_NAVY(PROSPECT)
//   frames:      LAYOUT_STACKED(always) LAYOUT_INLINE(PROSPECT)
//   accents:     ACC_RED/ACC_WHITE/ACC_BLUE(always) ACC_GOLD(PROSPECT)
// ── Contender adds (RISING_STAR): BG_CARBON BG_EMERALD LAYOUT_MARQUEE ACC_GREEN
// ── Challenger adds (CONTENDER):  BG_GOLD_MESH LAYOUT_BROADCAST ACC_PURPLE

/**
 * ── CAREER COHERENCE (derived, not stored) ──────────────────────────────────
 * A bot's read-only Career Profile is rendered from the SAME Fighter fields a real
 * player's is. Seeding only name/OVR/record left every bot self-contradicting: a 22-10
 * record with 0 KO / 0 sub / 0 decision wins, Fame "—" on a 32-fight veteran, and — the
 * loudest tell — eight IDENTICAL stat bars (ProfileStatsCard draws one bar per stat).
 *
 * Everything below is DERIVED from the roster entry above, so the roster stays the single
 * source of truth and the derivation is unit-testable with no DB (tests/services/pvpBot.test.js).
 * scripts/seedPvpBots.js consumes deriveBotProfile() for both the create and the
 * (strictly additive) convergence heal.
 */

const { STYLES } = require("./gameConstants");
const { calculateOverall } = require("../utils/overallRating");
const {
    BASE_FIGHT_NOTORIETY,
    calculateTierFromScore,
} = require("./notorietyConfig");
const { divisionForDp } = require("./pvpConfig");

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
/** STYLES[].start is keyed by STAT_NAMES (upper) — the Fighter doc is keyed lower. */
const STAT_NAME_TO_KEY = { STR: "str", SPD: "spd", LEG: "leg", WRE: "wre", GND: "gnd", SUB: "sub", CHN: "chn", FIQ: "fiq" };

/**
 * How each style finishes. Percentages of WINS and must total 100 per row.
 * Shapes the fighter's identity: a BJJ bot that won 60% by KO would read as fake as the
 * 0/0/0 split it replaces.
 */
const WIN_METHOD_BY_STYLE = {
    Boxer: { ko: 55, sub: 10, dec: 35 },
    "Muay Thai": { ko: 55, sub: 10, dec: 35 },
    Kickboxer: { ko: 50, sub: 10, dec: 40 },
    Capoeira: { ko: 45, sub: 15, dec: 40 },
    Wrestler: { ko: 15, sub: 25, dec: 60 },
    Judo: { ko: 25, sub: 38, dec: 37 },
    Sambo: { ko: 25, sub: 38, dec: 37 },
    "Brazilian Jiu-Jitsu": { ko: 10, sub: 60, dec: 30 },
};

/**
 * Style → home gym (resolved to a Gym._id by name at seed time). Sambo splits by division:
 * a Prospect trains at the free community gym, a Contender+ has earned a real lab.
 */
const STYLE_GYM = {
    Boxer: "Iron Fist Boxing",
    "Muay Thai": "Warrior Muay Thai",
    Kickboxer: "Dragon Kickboxing",
    Wrestler: "Apex Wrestling Academy",
    "Brazilian Jiu-Jitsu": "Gracie Ground Game",
    Judo: "Community MMA Center",
    Capoeira: "Community MMA Center",
};

/**
 * Split a win total across KO / submission / decision by style.
 * Decision absorbs the rounding remainder so the three ALWAYS sum to `wins` exactly —
 * the profile prints the split and the record on the same card.
 * @param {string} style
 * @param {number} wins
 * @returns {{ koWins: number, subWins: number, decisionWins: number }}
 */
function winMethodSplit(style, wins) {
    const w = Math.max(0, Math.floor(Number(wins) || 0));
    const mix = WIN_METHOD_BY_STYLE[style];
    if (!mix) throw new Error(`winMethodSplit: no win-method mix for style "${style}"`);
    const koWins = Math.round((w * mix.ko) / 100);
    const subWins = Math.round((w * mix.sub) / 100);
    const decisionWins = w - koWins - subWins;
    if (decisionWins < 0) {
        throw new Error(`winMethodSplit: negative decisionWins for ${style} @ ${w} wins`);
    }
    return { koWins, subWins, decisionWins };
}

/**
 * Promotion tier from OVR, per the PROMOTION_TIERS bands (GDD §5.1): Regional Pro opens at
 * OVR 30. Not a bot special case — it is the game's own rule, which is also why the
 * champ_amateur badge then self-heals correctly for the 3 Challengers.
 * @param {number} ovr
 */
function promotionTierForOvr(ovr) {
    return (Number(ovr) || 0) >= 30 ? "Regional Pro" : "Amateur";
}

/** Notoriety column for the only two tiers a bot can occupy. */
function notorietyColumnForPromotion(promotionTier) {
    return promotionTier === "Amateur" ? "AMATEUR" : "REGIONAL_PRO";
}

/**
 * Per-fight fame values, DERIVED from the live BASE_FIGHT_NOTORIETY table so a retune of
 * fame economy carries into the bots instead of silently drifting.
 *   DEC_BLEND  = 70% unanimous / 30% split (a career's decisions are mostly unanimous)
 *   LOSS_BLEND = 60% by decision / 40% by finish, as a POSITIVE magnitude (subtracted below)
 * @param {"AMATEUR"|"REGIONAL_PRO"} col
 */
function fameValuesForColumn(col) {
    return {
        ko: BASE_FIGHT_NOTORIETY.WIN_KO[col],
        sub: BASE_FIGHT_NOTORIETY.WIN_SUB[col],
        dec: 0.7 * BASE_FIGHT_NOTORIETY.WIN_DEC_UNAN[col] + 0.3 * BASE_FIGHT_NOTORIETY.WIN_DEC_SPLIT[col],
        loss: Math.abs(0.6 * BASE_FIGHT_NOTORIETY.LOSS_DEC[col] + 0.4 * BASE_FIGHT_NOTORIETY.LOSS_FINISH[col]),
    };
}

/**
 * Reconstruct the fame a career like this WOULD have accrued.
 *
 * peakTier is set EXPLICITLY and deliberately: notorietyService.ensureNotorietyShape only
 * backfills peakTier when it is falsy, but the schema default is the truthy string
 * "UNKNOWN" — so it never self-heals from score. The profile prints
 * notoriety.tierLabel, which derives from peakTier, NOT score. Setting score alone would
 * leave a 2600-fame veteran still labelled "Unknown".
 *
 * lastEventAt stays null on purpose: runNotorietyDecayBatch only walks fighters with a
 * non-null lastEventAt, so a seeded score never decays and never needs re-seeding.
 *
 * @param {{ promotionTier: string, koWins: number, subWins: number, decisionWins: number, losses: number }} args
 * @returns {{ score: number, peakTier: string, lastEventAt: null }}
 */
function botNotoriety({ promotionTier, koWins, subWins, decisionWins, losses }) {
    const v = fameValuesForColumn(notorietyColumnForPromotion(promotionTier));
    const raw =
        koWins * v.ko +
        subWins * v.sub +
        decisionWins * v.dec -
        Math.max(0, Number(losses) || 0) * v.loss;
    const score = Math.max(0, Math.round(raw));
    return { score, peakTier: calculateTierFromScore(score), lastEventAt: null };
}

/**
 * The 8 stats for a bot: the SAME per-style shape a real new player is dealt
 * (STYLES[style].start), scaled uniformly until calculateOverall() rounds to the bot's
 * stored OVR. The OVR itself is never recomputed — it is live identity and drives
 * matchmaking; only the shape underneath it is repaired.
 *
 * Solved numerically because calculateOverall is a rounded weighted mean: there is no
 * closed form once each stat is independently rounded and clamped.
 *
 * @param {string} style
 * @param {number} targetOvr
 * @returns {{ str:number, spd:number, leg:number, wre:number, gnd:number, sub:number, chn:number, fiq:number }}
 */
function botStatsFor(style, targetOvr) {
    const shape = STYLES[style] && STYLES[style].start;
    if (!shape) throw new Error(`botStatsFor: unknown style "${style}"`);
    const target = Math.round(Number(targetOvr) || 0);

    const build = (scale) => {
        const stats = {};
        for (const [name, key] of Object.entries(STAT_NAME_TO_KEY)) {
            stats[key] = Math.max(1, Math.min(99, Math.round(shape[name] * scale)));
        }
        return stats;
    };
    const ovrOf = (stats) => calculateOverall({ ...stats, style });

    // Binary search the uniform scale. calculateOverall is monotonic non-decreasing in
    // scale, so this converges on the smallest scale reaching the target.
    let lo = 0.01;
    let hi = 20;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (ovrOf(build(mid)) < target) lo = mid;
        else hi = mid;
    }
    for (const cand of [hi, lo]) {
        const stats = build(cand);
        if (ovrOf(stats) === target) return stats;
    }

    // Fallback: independent rounding can make a scale step skip an integer OVR. Nudge
    // stats one point at a time (cycling, so the style shape is preserved) until exact.
    // All 25 current bots solve on the scale alone; this keeps a future roster entry from
    // throwing at seed time.
    const stats = build(hi);
    for (let guard = 0, i = 0; ovrOf(stats) !== target && guard < 2000; guard++, i++) {
        const key = STAT_KEYS[i % STAT_KEYS.length];
        const dir = ovrOf(stats) < target ? 1 : -1;
        const next = Math.max(1, Math.min(99, stats[key] + dir));
        if (next === stats[key]) continue;
        stats[key] = next;
    }
    if (ovrOf(stats) !== target) {
        throw new Error(`botStatsFor: cannot hit OVR ${target} for style "${style}"`);
    }
    return stats;
}

/**
 * Home gym NAME for a bot (the seed resolves the name → Gym._id; an unknown name warns and
 * leaves gymId null rather than crashing the seed).
 * @param {string} style
 * @param {number} dp — division is derived from DP, same as the ladder
 * @returns {string}
 */
function gymNameForBot(style, dp) {
    if (style === "Sambo") {
        return divisionForDp(dp) === "prospect" ? "Community MMA Center" : "Precision MMA Lab";
    }
    const name = STYLE_GYM[style];
    if (!name) throw new Error(`gymNameForBot: no gym mapping for style "${style}"`);
    return name;
}

/**
 * Full derived coherence payload for one roster entry.
 *
 * STRICTLY ADDITIVE by construction: this returns ONLY fields the seed is allowed to heal.
 * It deliberately does NOT include record.wins / record.losses / overallRating (live
 * identity — a player may have fought this bot yesterday) or badgesEarned
 * (fighterController.getCareerProfile re-evaluates and saves badges on every profile view,
 * so once these fields are right the correct badges self-heal for free).
 *
 * @param {object} b — a ROSTER entry
 */
function deriveBotProfile(b) {
    const split = winMethodSplit(b.style, b.w);
    const promotionTier = promotionTierForOvr(b.ovr);
    const notoriety = botNotoriety({ promotionTier, ...split, losses: b.l });
    return {
        ...split,
        promotionTier,
        notoriety,
        stats: botStatsFor(b.style, b.ovr),
        gymName: gymNameForBot(b.style, b.dp),
        // Bots never train, so nothing writes this and nothing reads it FOR a bot at
        // runtime (gazetteService's training lines only run for the acting player). It
        // exists so the profile's session count matches a career of this length, and so
        // the gym-session badges (badgeCatalog: 50/100/250) self-heal coherently.
        careerTrainingSessions: (b.w + b.l) * 4,
    };
}

const ROSTER = [
    // ══ 18 Prospects (dp 0-299, ovr 10-20) ═══════════════════════════════════
    // ── The original 8 (LIVE — verbatim) ──
    {
        first: "Jesse", last: "Hooker", nick: "The Kid",
        wc: "Featherweight", style: "Boxer", story: "Street Fighter",
        ovr: 12, dp: 60, w: 1, l: 1, lastDays: 1,
        banner: { backgroundId: "BG_SLATE", frameId: "LAYOUT_STACKED", accentColor: "ACC_RED", badgeSlots: [] },
    },
    {
        first: "Dani", last: "Reyes", nick: "Pocket Rocket",
        wc: "Featherweight", style: "Muay Thai", story: "Late Bloomer",
        ovr: 14, dp: 110, w: 2, l: 1, lastDays: 0,
        banner: { backgroundId: "BG_CRIMSON", frameId: "LAYOUT_INLINE", accentColor: "ACC_GOLD", badgeSlots: [] },
    },
    {
        first: "Tyrell", last: "Banks", nick: "Fresh",
        wc: "Lightweight", style: "Kickboxer", story: "MMA Prodigy",
        ovr: 13, dp: 90, w: 2, l: 2, lastDays: 3,
        banner: { backgroundId: "BG_NAVY", frameId: "LAYOUT_STACKED", accentColor: "ACC_BLUE", badgeSlots: [] },
    },
    {
        first: "Cole", last: "Whitaker", nick: "Greenhorn",
        wc: "Middleweight", style: "Wrestler", story: "College Wrestler",
        ovr: 16, dp: 180, w: 3, l: 2, lastDays: 2,
        banner: { backgroundId: "BG_SLATE", frameId: "LAYOUT_INLINE", accentColor: "ACC_WHITE", badgeSlots: [] },
    },
    {
        first: "Sami", last: "Okafor", nick: "Spark",
        wc: "Lightweight", style: "Capoeira", story: "Street Fighter",
        ovr: 11, dp: 40, w: 0, l: 2, lastDays: 4,
        banner: { backgroundId: "BG_CRIMSON", frameId: "LAYOUT_STACKED", accentColor: "ACC_RED", badgeSlots: [] },
    },
    {
        first: "Andre", last: "Boateng", nick: "Iron Lungs",
        wc: "Heavyweight", style: "Judo", story: "Army Veteran",
        ovr: 18, dp: 240, w: 4, l: 3, lastDays: 1,
        banner: { backgroundId: "BG_NAVY", frameId: "LAYOUT_INLINE", accentColor: "ACC_GOLD", badgeSlots: [] },
    },
    {
        first: "Marco", last: "Bellini", nick: "Stone Hands",
        wc: "Middleweight", style: "Boxer", story: "Kickboxing Champion",
        ovr: 15, dp: 150, w: 3, l: 3, lastDays: 3,
        banner: { backgroundId: "BG_SLATE", frameId: "LAYOUT_STACKED", accentColor: "ACC_BLUE", badgeSlots: [] },
    },
    {
        first: "Jin", last: "Park", nick: "Lightning",
        wc: "Featherweight", style: "Kickboxer", story: "MMA Prodigy",
        ovr: 17, dp: 200, w: 3, l: 1, lastDays: 0,
        banner: { backgroundId: "BG_CRIMSON", frameId: "LAYOUT_INLINE", accentColor: "ACC_WHITE", badgeSlots: [] },
    },

    // ── 10 new Prospects (bottom-heavy fill — a new player's first opponents) ──
    {
        first: "Ricky", last: "Salvatore", nick: "Bad Habit",
        wc: "Lightweight", style: "Boxer", story: "Street Fighter",
        ovr: 12, dp: 55, w: 1, l: 2, lastDays: 2,
        banner: { backgroundId: "BG_NAVY", frameId: "LAYOUT_STACKED", accentColor: "ACC_RED", badgeSlots: [] },
    },
    {
        first: "Emeka", last: "Nwosu", nick: "Thunder Cat",
        wc: "Heavyweight", style: "Kickboxer", story: "Late Bloomer",
        ovr: 17, dp: 210, w: 3, l: 2, lastDays: 1,
        banner: { backgroundId: "BG_SLATE", frameId: "LAYOUT_INLINE", accentColor: "ACC_GOLD", badgeSlots: [] },
    },
    {
        first: "Tomas", last: "Varga", nick: "The Broom",
        wc: "Middleweight", style: "Sambo", story: "Army Veteran",
        ovr: 15, dp: 140, w: 2, l: 2, lastDays: 3,
        banner: { backgroundId: "BG_CRIMSON", frameId: "LAYOUT_STACKED", accentColor: "ACC_BLUE", badgeSlots: [] },
    },
    {
        first: "Junior", last: "Batista", nick: "Sandman",
        wc: "Featherweight", style: "Brazilian Jiu-Jitsu", story: "MMA Prodigy",
        ovr: 13, dp: 85, w: 2, l: 1, lastDays: 0,
        banner: { backgroundId: "BG_NAVY", frameId: "LAYOUT_INLINE", accentColor: "ACC_WHITE", badgeSlots: [] },
    },
    {
        first: "Wes", last: "Corrigan", nick: "Barstool",
        wc: "Middleweight", style: "Boxer", story: "Street Fighter",
        ovr: 11, dp: 45, w: 0, l: 3, lastDays: 4,
        banner: { backgroundId: "BG_SLATE", frameId: "LAYOUT_STACKED", accentColor: "ACC_GOLD", badgeSlots: [] },
    },
    {
        first: "Kenji", last: "Sato", nick: "Paper Cut",
        wc: "Featherweight", style: "Muay Thai", story: "Kickboxing Champion",
        ovr: 16, dp: 165, w: 3, l: 2, lastDays: 1,
        banner: { backgroundId: "BG_CRIMSON", frameId: "LAYOUT_INLINE", accentColor: "ACC_RED", badgeSlots: [] },
    },
    {
        first: "Diego", last: "Ferreira", nick: "Little Monster",
        wc: "Lightweight", style: "Capoeira", story: "Late Bloomer",
        ovr: 14, dp: 105, w: 2, l: 3, lastDays: 2,
        banner: { backgroundId: "BG_NAVY", frameId: "LAYOUT_STACKED", accentColor: "ACC_WHITE", badgeSlots: [] },
    },
    {
        first: "Owen", last: "Blackwood", nick: "The Ledger",
        wc: "Heavyweight", style: "Wrestler", story: "College Wrestler",
        ovr: 18, dp: 235, w: 4, l: 2, lastDays: 0,
        banner: { backgroundId: "BG_SLATE", frameId: "LAYOUT_INLINE", accentColor: "ACC_BLUE", badgeSlots: [] },
    },
    {
        first: "Pavel", last: "Kucera", nick: "Cold Front",
        wc: "Middleweight", style: "Judo", story: "Army Veteran",
        ovr: 14, dp: 120, w: 2, l: 2, lastDays: 3,
        banner: { backgroundId: "BG_CRIMSON", frameId: "LAYOUT_STACKED", accentColor: "ACC_GOLD", badgeSlots: [] },
    },
    {
        first: "Malachi", last: "Reed", nick: "Sunday Punch",
        wc: "Lightweight", style: "Kickboxer", story: "MMA Prodigy",
        ovr: 16, dp: 190, w: 3, l: 3, lastDays: 1,
        banner: { backgroundId: "BG_NAVY", frameId: "LAYOUT_INLINE", accentColor: "ACC_RED", badgeSlots: [] },
    },

    // ══ 4 Contenders (dp 300-1199, ovr 18-30) — LIVE, verbatim ═══════════════
    {
        first: "Rashad", last: "Vance", nick: "The Verdict",
        wc: "Lightweight", style: "Wrestler", story: "College Wrestler",
        ovr: 22, dp: 420, w: 6, l: 4, lastDays: 1,
        banner: { backgroundId: "BG_CARBON", frameId: "LAYOUT_MARQUEE", accentColor: "ACC_GREEN", badgeSlots: [] },
    },
    {
        first: "Bruno", last: "Mendez", nick: "El Toro",
        wc: "Middleweight", style: "Brazilian Jiu-Jitsu", story: "Late Bloomer",
        ovr: 25, dp: 680, w: 9, l: 5, lastDays: 2,
        banner: { backgroundId: "BG_EMERALD", frameId: "LAYOUT_MARQUEE", accentColor: "ACC_RED", badgeSlots: [] },
    },
    {
        first: "Sean", last: "Gallagher", nick: "Cinderella",
        wc: "Featherweight", style: "Boxer", story: "Late Bloomer",
        ovr: 27, dp: 920, w: 11, l: 6, lastDays: 0,
        banner: { backgroundId: "BG_CARBON", frameId: "LAYOUT_INLINE", accentColor: "ACC_GREEN", badgeSlots: [] },
    },
    {
        first: "Dmitri", last: "Sokolov", nick: "The Bear",
        wc: "Heavyweight", style: "Sambo", story: "Army Veteran",
        ovr: 29, dp: 1120, w: 13, l: 6, lastDays: 3,
        banner: { backgroundId: "BG_EMERALD", frameId: "LAYOUT_MARQUEE", accentColor: "ACC_BLUE", badgeSlots: [] },
    },

    // ══ 3 Challengers (dp 1200-2499, ovr 25-40) — LIVE, verbatim ═════════════
    {
        first: "Malik", last: "Johnson", nick: "Bad News",
        wc: "Middleweight", style: "Muay Thai", story: "Street Fighter",
        ovr: 31, dp: 1450, w: 16, l: 8, lastDays: 1,
        banner: { backgroundId: "BG_GOLD_MESH", frameId: "LAYOUT_BROADCAST", accentColor: "ACC_PURPLE", badgeSlots: [] },
    },
    {
        first: "Hiroshi", last: "Nakamura", nick: "The Surgeon",
        wc: "Lightweight", style: "Brazilian Jiu-Jitsu", story: "MMA Prodigy",
        ovr: 35, dp: 1900, w: 19, l: 9, lastDays: 0,
        banner: { backgroundId: "BG_CARBON", frameId: "LAYOUT_BROADCAST", accentColor: "ACC_WHITE", badgeSlots: [] },
    },
    {
        first: "Gunnar", last: "Olsen", nick: "The Viking",
        wc: "Heavyweight", style: "Wrestler", story: "Army Veteran",
        ovr: 38, dp: 2300, w: 22, l: 10, lastDays: 2,
        banner: { backgroundId: "BG_GOLD_MESH", frameId: "LAYOUT_MARQUEE", accentColor: "ACC_GOLD", badgeSlots: [] },
    },
];

module.exports = {
    ROSTER,
    STAT_KEYS,
    WIN_METHOD_BY_STYLE,
    STYLE_GYM,
    winMethodSplit,
    promotionTierForOvr,
    botNotoriety,
    botStatsFor,
    gymNameForBot,
    deriveBotProfile,
};
