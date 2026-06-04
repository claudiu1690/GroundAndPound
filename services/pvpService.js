/**
 * PvP System v1 (Beta) — service layer.
 *
 * Behaviour reference: docs/PvP_System_Spec_v1_revised.md.
 * Binding contract: docs/PvP_v1_implementation_contract.md (§4, §5).
 *
 * Design notes:
 *  - Fully parallel to PvE. Never touches PvE record/ranking/tier/title-shot.
 *  - The defender is simulated from persisted stats/OVR/current health. No defensive
 *    camp in v1 (single-sided resolveFight). Defender HP is applied via a method table;
 *    defender injuries roll via the same rollForFightInjury used in PvE.
 *  - All multi-doc saves go through saveWithVersionRetry to survive concurrent mutual
 *    attacks + lazy reposition.
 *  - Validation errors throw an Error carrying a `.code` so the controller can return
 *    the { message, code } envelope. Internal failures bubble as plain errors → 500.
 */
const Fighter = require("../models/fighterModel");
const PvpFight = require("../models/pvpFightModel");
const Rivalry = require("../models/rivalryModel");
const Bounty = require("../models/bountyModel");
const PvpSeason = require("../models/pvpSeasonModel");
const fighterService = require("./fighterService");
const campService = require("./campService");
const rankingService = require("./rankingService");
const notorietyService = require("./notorietyService");
const { resolveFight } = require("../utils/fightResolution");
const {
    rollForFightInjury,
    buildInjury,
    applyInjuryToFighter,
    isFightBlocked,
    injuryGraceActive,
} = require("../utils/injuryUtils");
const saveWithVersionRetry = require("../utils/saveWithVersionRetry");
const { PROMOTION_TIERS } = require("../consts/gameConstants");
const {
    BASE_FIGHT_NOTORIETY,
    promotionColumn,
} = require("../consts/notorietyConfig");
const {
    PVP_DAILY_CAP_FREE,
    PVP_DAILY_CAP_PREMIUM,
    PVP_OVR_BRACKET,
    PVP_ONBOARDING_FIGHTS,
    PVP_GAP_DIVISOR,
    PVP_COOLDOWN_HOURS,
    PVP_HP_BANDS,
    PVP_IRON_WIN_FRAC,
    PVP_IRON_DRAW_FRAC,
    PVP_IRON_LOSS_FRAC,
    PVP_FAME_WIN_FRAC,
    PVP_BELT_DEFENSE_FRAC,
    PVP_BELT_FLOOR_DEFAULT,
    PVP_BELT_FLOOR_WIDENED,
    PVP_BELT_DECAY_WIDEN_DAYS,
    PVP_BELT_DECAY_INTERIM_DAYS,
    PVP_LADDER_LIMIT_DEFAULT,
    PVP_LADDER_LIMIT_MAX,
    PVP_HISTORY_LIMIT_DEFAULT,
    PVP_HISTORY_LIMIT_MAX,
    PVP_REVENGE_FAME_MULT,
    PVP_REVENGE_WINDOW_HOURS,
    PVP_GRUDGE_HEAT,
    PVP_NEMESIS_DEFICIT,
    PVP_RIVALRY_HEAT_DECAY_DAYS,
    PVP_STREAK_MILESTONES,
    PVP_STREAK_FAME,
    PVP_TITLE_FAME,
    PVP_TITLES,
    PVP_CONTRACT_POOL,
    PVP_CONTRACT_FAME,
    PVP_DAILY_FAME_CAP,
    PVP_HEADTOHEAD_DIMINISH,
    // The Circuit v1.2
    PVP_DIVISION_BANDS,
    PVP_DIVISION_CHAMPIONS_RANK,
    PVP_SEASON_LENGTH_DAYS,
    PVP_SEASON_SOFT_RESET,
    PVP_SEASON_FAME,
    PVP_SEASON_IRON,
    PVP_BOUNTY_MIN,
    PVP_BOUNTY_POST_BURN,
    PVP_BOUNTY_ESCROW,
    PVP_BOUNTY_EXPIRY_DAYS,
    PVP_BOUNTY_REFUND_FRAC,
    PVP_BOUNTY_TRIANGLE_DAYS,
    PVP_BOUNTY_DIMINISH,
} = require("../consts/pvpConfig");
const { makeGazetteRng } = require("../utils/gazetteRng");

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ── Small helpers ─────────────────────────────────────────────────────────────

function pvpError(message, code) {
    const err = new Error(message);
    err.code = code;
    err.isPvpValidation = true;
    return err;
}

function clamp01(n) {
    return Math.max(0, Math.min(1, n));
}

/** Default pvp subdoc — defends against legacy docs that pre-date the field. */
function defaultPvp() {
    return {
        wins: 0, losses: 0, draws: 0, total_fights: 0,
        rank_points: 0, ladder_rank: null, is_champion: false,
        attackable_after: null, last_pvp_fight_at: null,
        attacks_today: 0, attack_day_key: null,
        belt_defenses: 0, belt_won_at: null, belt_lost_at: null,
        belt_challenge_floor: PVP_BELT_FLOOR_DEFAULT, interim_booked: false,
        // ── The Circuit v1.1 ── (mirrored in fighterModel.pvp + the snapshot helpers)
        current_streak: 0, best_streak: 0,
        titles: [], active_title: null,
        attack_wins: 0, giant_slayer_wins: 0, top10_defenses: 0,
        former_champion: false, nemesis_pvp: null,
        fame_today: 0, fame_day_key: null, fame_lifetime: 0,
        contracts: { daily_key: null, weekly_key: null, daily: [], weekly: [] },
        // ── The Circuit v1.2 ── (mirrored in fighterModel.pvp + the snapshot helpers — Risk 1/10)
        division: null, season_start_points: 0, season_titles: [],
        season_number_seen: 0, bounties_collected: 0,
    };
}

/** Ensure the v1.1 contracts sub-object + new scalar fields exist on a legacy pvp subdoc. */
function ensureCircuitShape(fighter) {
    const pvp = ensurePvpShape(fighter);
    if (pvp.current_streak == null) pvp.current_streak = 0;
    if (pvp.best_streak == null) pvp.best_streak = 0;
    if (!Array.isArray(pvp.titles)) pvp.titles = [];
    if (pvp.active_title === undefined) pvp.active_title = null;
    if (pvp.attack_wins == null) pvp.attack_wins = 0;
    if (pvp.giant_slayer_wins == null) pvp.giant_slayer_wins = 0;
    if (pvp.top10_defenses == null) pvp.top10_defenses = 0;
    if (pvp.former_champion == null) pvp.former_champion = false;
    if (pvp.nemesis_pvp === undefined) pvp.nemesis_pvp = null;
    if (pvp.fame_today == null) pvp.fame_today = 0;
    if (pvp.fame_day_key === undefined) pvp.fame_day_key = null;
    if (pvp.fame_lifetime == null) pvp.fame_lifetime = 0;
    if (!pvp.contracts || typeof pvp.contracts !== "object") {
        pvp.contracts = { daily_key: null, weekly_key: null, daily: [], weekly: [] };
    }
    if (!Array.isArray(pvp.contracts.daily)) pvp.contracts.daily = [];
    if (!Array.isArray(pvp.contracts.weekly)) pvp.contracts.weekly = [];
    // ── The Circuit v1.2 ──
    if (pvp.division === undefined) pvp.division = null;
    if (pvp.season_start_points == null) pvp.season_start_points = 0;
    if (!Array.isArray(pvp.season_titles)) pvp.season_titles = [];
    if (pvp.season_number_seen == null) pvp.season_number_seen = 0;
    if (pvp.bounties_collected == null) pvp.bounties_collected = 0;
    return pvp;
}

function ensurePvpShape(fighter) {
    if (!fighter.pvp) fighter.pvp = defaultPvp();
    return fighter.pvp;
}

function winPct(pvp) {
    const total = Math.max(1, pvp.total_fights || 0);
    return (pvp.wins || 0) / total;
}

function recordString(pvp) {
    return `${pvp.wins || 0}-${pvp.losses || 0}-${pvp.draws || 0}`;
}

/** True if a defender is currently inside a post-loss cooldown. */
function isRecovering(pvp, now = new Date()) {
    return !!(pvp.attackable_after && new Date(pvp.attackable_after) > now);
}

/**
 * §4.1 gapFactor — applied to iron AND fame (NOT rank points).
 * ovrDiff = attackerOvr - defenderOvr. Punching down decays toward 0.
 */
function gapFactor(ovrDiff) {
    return clamp01(1 - Math.max(0, ovrDiff) / PVP_GAP_DIVISOR);
}

/** §4.7 — premium flag. Returns false in v1 (uniform cap = 5). Extension point. */
function isPremium(_fighter) {
    return false;
}

function dailyCapFor(fighter) {
    return isPremium(fighter) ? PVP_DAILY_CAP_PREMIUM : PVP_DAILY_CAP_FREE;
}

/**
 * §4.2 — reset the daily attack counter on a new calendar day (server-local
 * toDateString idiom, mirroring fightService.ensureDailyFightTierState). Mutates in place.
 */
function ensurePvpDailyState(fighter) {
    const pvp = ensurePvpShape(fighter);
    const today = new Date().toDateString();
    if (pvp.attack_day_key !== today) {
        pvp.attacks_today = 0;
        pvp.attack_day_key = today;
    }
}

// ── The Circuit v1.1 — shared helpers ─────────────────────────────────────────

/** Sorted unordered pair key so (A,B) === (B,A). fighter_a = smaller id, fighter_b = larger. */
function pairKeyFor(idA, idB) {
    const a = String(idA);
    const b = String(idB);
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}
function pairFirstId(idA, idB) {
    const a = String(idA);
    const b = String(idB);
    return a < b ? a : b;
}

/** ISO-8601 week key (e.g. "2026-W23"), server-local, consistent with the daily toDateString idiom. */
function isoWeekKey(date = new Date()) {
    // Copy to a UTC-anchored date to avoid DST drift in the week-number math.
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;          // Mon=1..Sun=7
    d.setUTCDate(d.getUTCDate() + 4 - day);   // shift to the Thursday of this week
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Risk 8 — reset the SHARED daily fame budget on a new calendar day (toDateString idiom,
 * same as ensurePvpDailyState). Revenge bonus + streak milestone + contract claim all draw
 * from pvp.fame_today against PVP_DAILY_FAME_CAP, so one win can't farm the cap.
 */
function ensurePvpFameDayState(fighter) {
    const pvp = ensureCircuitShape(fighter);
    const today = new Date().toDateString();
    if (pvp.fame_day_key !== today) {
        pvp.fame_today = 0;
        pvp.fame_day_key = today;
    }
    return pvp;
}

/** Remaining shared daily-fame headroom (≥0). */
function fameHeadroom(fighter) {
    const pvp = ensurePvpFameDayState(fighter);
    return Math.max(0, PVP_DAILY_FAME_CAP - (pvp.fame_today || 0));
}

/**
 * Award capped PvP fame through applyNotorietyDelta, charging the shared daily cap and the
 * lifetime tally (Risk 3). Returns the fame actually applied (post-cap, ≥0). Never awards
 * negative or partial-below-zero. The caller has already shaped notoriety.
 */
function awardCappedPvpFame(fighter, amount, { code, reason, meta } = {}) {
    if (!(amount > 0)) return 0;
    const headroom = fameHeadroom(fighter);
    const grant = Math.min(Math.round(amount), headroom);
    if (grant <= 0) return 0;
    notorietyService.applyNotorietyDelta(fighter, grant, { code, reason, meta });
    const pvp = ensureCircuitShape(fighter);
    pvp.fame_today = (pvp.fame_today || 0) + grant;
    pvp.fame_lifetime = (pvp.fame_lifetime || 0) + grant;
    return grant;
}

/** Risk 2 — O(1) incremental streak from the PRIOR current_streak. */
function nextStreak(prev, { win, loss, draw }) {
    if (draw) return 0;
    if (win) return prev >= 0 ? prev + 1 : 1;
    if (loss) return prev <= 0 ? prev - 1 : -1;
    return prev;
}

/**
 * D — evaluate which cosmetic titles are now satisfied and append any NEW unlocks to
 * pvp.titles (idempotent — only the transition fires). Returns the array of newly unlocked
 * title keys so the caller can pay the one-time fame + emit a Gazette story.
 */
function evaluateTitles(pvp) {
    if (!Array.isArray(pvp.titles)) pvp.titles = [];
    const owned = new Set(pvp.titles);
    const newlyUnlocked = [];
    for (const [key, def] of Object.entries(PVP_TITLES)) {
        if (owned.has(key)) continue;
        try {
            if (def.unlock(pvp)) {
                pvp.titles.push(key);
                owned.add(key);
                newlyUnlocked.push(key);
            }
        } catch (_) { /* a malformed unlock rule must never break fight resolution */ }
    }
    return newlyUnlocked;
}

/**
 * Head-to-head diminishing factor (Risk 8) keyed on how many times this exact pair has
 * already fought TODAY before this fight. Clamps to the last entry of PVP_HEADTOHEAD_DIMINISH.
 */
function headToHeadDiminish(priorSamePairToday) {
    const arr = PVP_HEADTOHEAD_DIMINISH;
    const idx = Math.min(Math.max(0, priorSamePairToday), arr.length - 1);
    return arr[idx];
}

/** Seeded RNG-pick `count` distinct entries from `pool` deterministically for `seed`. */
function seededPick(pool, count, seed) {
    const rng = makeGazetteRng(seed, "pvp-contracts");
    const items = pool.slice();
    const out = [];
    for (let i = 0; i < count && items.length > 0; i++) {
        const idx = Math.floor(rng.next() * items.length);
        out.push(items[idx]);
        items.splice(idx, 1);
    }
    return out;
}

/**
 * F — lazy contract rotation (mirrors ensurePvpDailyState). On a new day key, reroll 2 daily
 * contracts; on a new ISO-week key, reroll 1 weekly contract. Seeded per
 * `${fighterId}:${dayKey}` / `${fighterId}:${weekKey}` so the same fighter sees a stable set.
 * Mutates pvp.contracts in place. Call in initiatePvpAttack + hub read.
 */
function ensureContractsState(fighter) {
    const pvp = ensureCircuitShape(fighter);
    const fid = String(fighter._id || "anon");
    const dayKey = new Date().toDateString();
    const weekKey = isoWeekKey();

    if (pvp.contracts.daily_key !== dayKey) {
        const picks = seededPick(PVP_CONTRACT_POOL.daily, 2, `${fid}:${dayKey}`);
        pvp.contracts.daily = picks.map((d) => ({ id: d.id, goal: d.goal, progress: 0, claimed: false }));
        pvp.contracts.daily_key = dayKey;
    }
    if (pvp.contracts.weekly_key !== weekKey) {
        const picks = seededPick(PVP_CONTRACT_POOL.weekly, 1, `${fid}:${weekKey}`);
        pvp.contracts.weekly = picks.map((d) => ({ id: d.id, goal: d.goal, progress: 0, claimed: false }));
        pvp.contracts.weekly_key = weekKey;
    }
    return pvp;
}

/** Advance a contract objective (clamped to goal). `which` is "daily"|"weekly". */
function bumpContract(pvp, which, id, amount = 1) {
    const list = pvp.contracts?.[which];
    if (!Array.isArray(list)) return;
    for (const c of list) {
        if (c.id === id && !c.claimed) {
            c.progress = Math.min(c.goal, (c.progress || 0) + amount);
        }
    }
}

/** Wall-clock end of the current local calendar day (next-day boundary) for resets_at. */
function endOfTodayIso() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.toISOString();
}
/** Wall-clock end of the current ISO week (next Monday 00:00 local). */
function endOfIsoWeekIso() {
    const d = new Date();
    const day = d.getDay() || 7;       // Mon=1..Sun=7
    d.setDate(d.getDate() + (8 - day)); // next Monday
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

/** PvE-style "KO|SUB|DEC" → PvP method label. */
function normalizeMethod(outcome) {
    if (outcome === "Draw") return "Draw";
    const r = rankingService.buildFightResultFromOutcome(outcome);
    if (r.method === "KO") return "KO";
    if (r.method === "SUB") return "Submission";
    return "Decision";
}

/** Base PvE fight notoriety for a (tier, method) — column lookup, never negative for wins. */
function baseFightNotoriety(tier, method) {
    const col = promotionColumn(tier);
    let key = "WIN_DEC_UNAN";
    if (method === "KO") key = "WIN_KO";
    else if (method === "Submission") key = "WIN_SUB";
    else if (method === "Decision") key = "WIN_DEC_UNAN";
    const row = BASE_FIGHT_NOTORIETY[key];
    return (row && row[col]) || 0;
}

/** Apply a method-banded HP loss (percent of current HP) to a fighter doc in place. */
function applyHpLoss(fighter, method, perspective) {
    const bands = PVP_HP_BANDS[method] || PVP_HP_BANDS.Decision;
    const [min, max] = bands[perspective] || bands.loser;
    const pct = min + Math.random() * (max - min);
    const current = typeof fighter.health === "number" ? fighter.health : 100;
    const next = Math.max(0, Math.round(current * (1 - pct / 100)));
    fighter.health = next;
    fighter.healthLastRegenAt = new Date();
}

/** Roll + apply a fight injury for one fighter (honours new-fighter grace). */
function rollAndApplyInjury(fighter, tier, isFinishLoser) {
    const tierConfig = PROMOTION_TIERS[tier] || PROMOTION_TIERS.Amateur;
    const grace = injuryGraceActive(fighter);
    const applied = [];

    // Mirrors PvE (fightService post-fight injury block, GDD 8.9): a KO/Sub LOSS adds a
    // Concussion outside the new-fighter grace window — this is the loser's ONLY injury
    // source (PvE uses if/else, so the finish-loser does NOT also roll rollForFightInjury).
    // Everyone else (finish-winner, decision/draw participants) takes only the probabilistic
    // roll below. This keeps a PvP KO/Sub loss exactly as punitive as the PvE equivalent —
    // one injury source, never two.
    if (isFinishLoser) {
        if (!grace) {
            const concussion = buildInjury("concussion");
            if (concussion) {
                applyInjuryToFighter(fighter, concussion);
                fighter.injuries = [...(fighter.injuries || []), concussion];
                applied.push(concussion.label);
            }
        }
        return applied;
    }

    const injuryType = rollForFightInjury(fighter.fiq || 10, tierConfig.injuryRiskMult || 1);
    if (injuryType) {
        const inj = buildInjury(injuryType);
        if (inj && !(grace && inj.cannotFight)) {
            applyInjuryToFighter(fighter, inj);
            fighter.injuries = [...(fighter.injuries || []), inj];
            applied.push(inj.label);
        }
    }
    return applied;
}

// ── §4.3 initiatePvpAttack ────────────────────────────────────────────────────

/**
 * Run the full attack: validate (§3.3 order), deduct energy LAST, resolve the engine,
 * apply consequences via processPvpResult, and return the §3.3 payload.
 *
 * @param {string} attackerId  trusted from req.user.fighterId
 * @param {string} defenderId
 * @param {string[]} offensiveCampSessions
 */
async function initiatePvpAttack(attackerId, defenderId, offensiveCampSessions) {
    const now = new Date();

    // 1. Self-attack (cheapest, no DB needed beyond ids).
    if (String(attackerId) === String(defenderId)) {
        throw pvpError("You cannot attack yourself.", "cannot_attack_self");
    }

    const attacker = await Fighter.findById(attackerId);
    if (!attacker) throw pvpError("Fighter not found", "fighter_not_found");
    const defender = await Fighter.findById(defenderId);
    if (!defender) throw pvpError("Fighter not found", "fighter_not_found");

    ensurePvpShape(attacker);
    ensurePvpShape(defender);
    notorietyService.ensureNotorietyShape(attacker);
    notorietyService.ensureNotorietyShape(defender);

    // 2. Onboarding shield.
    if ((defender.pvp.total_fights || 0) < PVP_ONBOARDING_FIGHTS) {
        throw pvpError("This fighter isn't on the PvP ladder yet.", "target_not_attackable");
    }

    // 3. Target cooldown.
    if (isRecovering(defender.pvp, now)) {
        throw pvpError("This fighter is recovering.", "target_recovering");
    }

    // 4. Attacker injured (fight-blocking injury).
    if (isFightBlocked(attacker)) {
        throw pvpError("You can't fight with an unresolved injury.", "attacker_injured");
    }

    // 5. OVR bracket.
    const attackerOvr = attacker.overallRating || 0;
    const defenderOvr = defender.overallRating || 0;
    const ovrDiff = attackerOvr - defenderOvr;
    if (Math.abs(ovrDiff) > PVP_OVR_BRACKET) {
        throw pvpError(`Outside your matchmaking range (±${PVP_OVR_BRACKET} OVR).`, "out_of_bracket");
    }

    // 6. Daily cap (after resetting the day key).
    ensurePvpDailyState(attacker);
    const cap = dailyCapFor(attacker);
    if ((attacker.pvp.attacks_today || 0) >= cap) {
        throw pvpError(`Daily PvP attack cap reached (${cap}/day).`, "daily_pvp_cap_reached");
    }

    // 7. Camp size (attacker-tier normal slots; empty allowed).
    const tier = attacker.promotionTier || "Amateur";
    const slotCfg = (require("../consts/campConfig").CAMP_SLOT_CONFIG[tier])
        || require("../consts/campConfig").CAMP_SLOT_CONFIG.Amateur;
    const maxSlots = slotCfg.normalSlots;
    const camp = Array.isArray(offensiveCampSessions) ? offensiveCampSessions : [];
    if (camp.length > maxSlots) {
        throw pvpError(`Too many camp sessions (max ${maxSlots}).`, "invalid_camp");
    }

    // 8. Energy LAST. The fighterService wrapper keeps the energy snapshot consistent.
    const energyCost = (PROMOTION_TIERS[tier] || PROMOTION_TIERS.Amateur).fightEnergyCost || 10;
    try {
        await fighterService.deductEnergy(String(attackerId), energyCost);
    } catch (err) {
        if (/not enough energy/i.test(err.message || "")) {
            throw pvpError("Not enough energy.", "insufficient_energy");
        }
        throw err;
    }

    // Reload attacker so its in-memory copy reflects the energy spend the wrapper persisted,
    // then re-establish pvp/notoriety shape on the fresh doc.
    const freshAttacker = await Fighter.findById(attackerId);
    ensurePvpShape(freshAttacker);
    ensurePvpDailyState(freshAttacker);
    ensureContractsState(freshAttacker);   // F — lazy contract rotation on attack
    notorietyService.ensureNotorietyShape(freshAttacker);

    // Fight Night captures (BEFORE processPvpResult mutates the ladder rank / runs the engine).
    const attackerLadderRankBefore = freshAttacker.pvp.ladder_rank ?? null;
    const attackerHealthBefore = typeof freshAttacker.health === "number" ? freshAttacker.health : 100;
    const defenderHealthBefore = typeof defender.health === "number" ? defender.health : 100;

    // Build the engine inputs. Attacker = player, defender = opponent (single-sided).
    const sessionBonuses = campService.buildOffensiveBonuses(camp, freshAttacker.style, defender.style);

    // Fight Night — offensive camp GRADE (shared PvE formula via gradeOffensiveCamp).
    const campGrade = campService.gradeOffensiveCamp(camp, defender.style, maxSlots).grade;

    const attackerStats = { ...freshAttacker.toObject() };
    attackerStats.stamina = attackerStats.maxStamina ?? 100;
    const defenderStats = { ...defender.toObject() };
    defenderStats.stamina = defenderStats.maxStamina ?? 100;
    defenderStats.health = typeof defender.health === "number" ? defender.health : 100;

    const playerName = freshAttacker.nickname
        ? `${freshAttacker.firstName} "${freshAttacker.nickname}" ${freshAttacker.lastName}`
        : `${freshAttacker.firstName} ${freshAttacker.lastName}`;
    const opponentName = defender.nickname
        ? `${defender.firstName} "${defender.nickname}" ${defender.lastName}`
        : `${defender.firstName} ${defender.lastName}`;

    const result = resolveFight(attackerStats, defenderStats, {
        playerStrategy: undefined,
        sessionBonuses,
        wildcard: null,
        playerName,
        opponentName,
        ctx: {
            playerStyle: freshAttacker.style,
            opponentStyle: defender.style,
            tier,
            playerOvr: attackerOvr,
            opponentOvr: defenderOvr,
        },
    });

    const gf = gapFactor(ovrDiff);
    const applied = await processPvpResult(freshAttacker, defender, result, gf, camp);

    // Fight Night — attacker streak AFTER this fight. v1.1 (Risk 2): use the INCREMENTAL
    // current_streak processPvpResult just persisted, instead of re-walking the fight history.
    const attackerStreak = applied.attacker_current_streak;
    const streakMilestone = applied.attacker_streak_milestone;

    // ── Build §3.3 payload ────────────────────────────────────────────────────
    const winnerMap = { player: "attacker", opponent: "defender", draw: "draw" };
    const method = applied.method;
    const round = applied.round;

    // The energy spent on this attack lives in Redis (the authoritative source); the
    // in-memory freshAttacker still carries the pre-attack snapshot. Reload through
    // getFighterById, which reconciles Redis→Mongo energy (and health/injury timers)
    // and returns a public fighter, so the response's `energy` + `fighter` are live.
    // The PvP record/rank/iron we just persisted are already in Mongo and are read back.
    const publicAttacker = await fighterService.getFighterById(String(attackerId));

    // Fight Night — campBreakdown. sessions/wildcard come straight from the engine output
    // (resolveFight mutated sessionBonuses with triggered/triggerCount); mapped EXACTLY like
    // PvE fightService:1209-1216. wildcard is always null in PvP v1 (attack passes wildcard:null
    // to resolveFight) — wired anyway so the frontend's null-guard path is fed.
    const campBreakdown = {
        rating: campGrade,
        sessions: (result.sessionBonuses || []).map((b) => ({
            label: b.label,
            sessionType: b.sessionType,
            matchStatus: b.matchStatus,
            triggered: b.triggered,
            triggerCount: b.triggerCount || 0,
            description: b.description,
        })),
        wildcard: result.wildcard
            ? {
                  description: result.wildcard.description,
                  wasCountered: result.wildcard.countered ?? false,
              }
            : null,
    };

    // Attacker HP after = engine result clamped ≤100 (same value processPvpResult persisted).
    const attackerHealthAfter = Math.min(100, result.playerHealthAfter ?? attackerHealthBefore);

    return {
        result: {
            outcome: result.outcome,
            winner: winnerMap[result.winner] || "draw",
            method,
            round,
            rounds: result.rounds || [],
            commentary: result.commentary || [],
        },
        belt: { changed: applied.belt_changed, newChampion: applied.attacker_became_champion },
        rank: {
            attacker_points_delta: applied.attacker_points_delta,
            attacker_rank_points_after: publicAttacker.pvp?.rank_points ?? freshAttacker.pvp.rank_points,
            attacker_ladder_rank_after: publicAttacker.pvp?.ladder_rank ?? freshAttacker.pvp.ladder_rank,
            attacker_ladder_rank_before: attackerLadderRankBefore,
        },
        rewards: {
            iron_earned: applied.attacker_iron_earned,
            notoriety_earned: applied.attacker_notoriety_earned,
            gap_factor: gf,
        },
        energy: {
            current: publicAttacker.energy?.current ?? 0,
            max: publicAttacker.energy?.max ?? 100,
        },
        // Fight Night — defender block (captured AFTER mutation inside processPvpResult).
        defender: applied.defender,
        // Fight Night — HP before/after for both fighters (Aftermath panel).
        health: {
            attacker: { before: attackerHealthBefore, after: attackerHealthAfter },
            defender: { before: defenderHealthBefore, after: applied.defender_health_after },
        },
        campBreakdown,
        // Fight Night — attacker streak (post-fight) + milestone for the "streak!" notice.
        streak: { attacker_current: attackerStreak, milestone: streakMilestone },
        // The Circuit v1.2 — bounty collection summary ({count,total_iron,items}) for the camp
        // "bounty collected" line + division denormalized this fight.
        bounty_collected: applied.bounty_collected || { count: 0, total_iron: 0, items: [] },
        division: applied.attacker_division ?? null,
        // Fight Night — post-loss cooldowns set this fight (loser only; winner/draw → null).
        cooldowns: {
            attacker: applied.attacker_cooldown_after,
            defender: applied.defender_cooldown_after,
        },
        defenderConsequencesApplied: true,
        fighter: publicAttacker,
        pvpFightId: String(applied.pvpFightId),
    };
}

// ── §4.4 processPvpResult ─────────────────────────────────────────────────────

/**
 * Apply all consequences of a resolved attack to BOTH fighters and persist a PvpFight.
 * Mutates and saves attacker + defender. Returns the audit fields the caller serialises.
 */
async function processPvpResult(attacker, defender, result, gf, attackerCamp) {
    const now = new Date();
    ensureCircuitShape(attacker);
    ensureCircuitShape(defender);
    notorietyService.ensureNotorietyShape(attacker);
    notorietyService.ensureNotorietyShape(defender);

    // Defender HP BEFORE any mutation (applyHpLoss below overwrites defender.health).
    const defenderHealthBefore = typeof defender.health === "number" ? defender.health : 100;

    // The Circuit v1.1 — capture pre-fight state needed by streak/title/revenge hooks BEFORE
    // any mutation. Ladder ranks aren't repositioned until step 12, but several title counters
    // read the at-fight ranks, so snapshot them here for clarity.
    const attackerStreakBefore = attacker.pvp.current_streak || 0;
    const defenderStreakBefore = defender.pvp.current_streak || 0;
    const attackerRankAtFight = attacker.pvp.ladder_rank ?? null;
    const defenderRankAtFight = defender.pvp.ladder_rank ?? null;
    // Revenge + head-to-head diminishing context (one query, before the PvpFight is created).
    const revengeCtx = await loadRevengeContext(attacker._id, defender._id, now);

    // 1. Outcome perspective.
    const attackerWon = result.winner === "player";
    const isDraw = result.winner === "draw";
    const defenderWon = result.winner === "opponent";

    // 2. Method + finish round.
    const method = normalizeMethod(result.outcome);
    const isFinish = method === "KO" || method === "Submission";
    const round = isFinish ? (result.rounds?.length ?? null) : null;

    const tier = attacker.promotionTier || "Amateur";
    const attackerOvr = attacker.overallRating || 0;
    const defenderOvr = defender.overallRating || 0;

    // 3. Records.
    attacker.pvp.total_fights = (attacker.pvp.total_fights || 0) + 1;
    defender.pvp.total_fights = (defender.pvp.total_fights || 0) + 1;
    attacker.pvp.last_pvp_fight_at = now;
    defender.pvp.last_pvp_fight_at = now;
    if (isDraw) {
        attacker.pvp.draws = (attacker.pvp.draws || 0) + 1;
        defender.pvp.draws = (defender.pvp.draws || 0) + 1;
    } else if (attackerWon) {
        attacker.pvp.wins = (attacker.pvp.wins || 0) + 1;
        defender.pvp.losses = (defender.pvp.losses || 0) + 1;
    } else {
        attacker.pvp.losses = (attacker.pvp.losses || 0) + 1;
        defender.pvp.wins = (defender.pvp.wins || 0) + 1;
    }

    // 4. Rank points — reuse calcDelta verbatim; add delta directly; floor at 0.
    const rankMethod = method === "Submission" ? "SUB" : method === "KO" ? "KO" : "DEC";
    const aRes = { isWin: attackerWon, isLoss: defenderWon, isDraw, method: rankMethod };
    const dRes = { isWin: defenderWon, isLoss: attackerWon, isDraw, method: rankMethod };
    const aDelta = rankingService.calcDelta(aRes, attacker.pvp.ladder_rank, defender.pvp.ladder_rank);
    const dDelta = rankingService.calcDelta(dRes, defender.pvp.ladder_rank, attacker.pvp.ladder_rank);
    attacker.pvp.rank_points = Math.max(0, (attacker.pvp.rank_points || 0) + aDelta);
    defender.pvp.rank_points = Math.max(0, (defender.pvp.rank_points || 0) + dDelta);

    // 5. Loss cooldown on the loser only (draws → none).
    if (!isDraw) {
        const loser = attackerWon ? defender : attacker;
        const hours = PVP_COOLDOWN_HOURS[method] ?? PVP_COOLDOWN_HOURS.Decision;
        loser.pvp.attackable_after = new Date(now.getTime() + hours * HOUR_MS);
    }

    // PvP bots never log in, so the passive HP-regen path (fighterService.reconcileHealth)
    // never runs for them. If we persisted HP loss + injuries to a bot defender, its health
    // would only ever drop and injuries accumulate until it became an unfightable target —
    // breaking the cold-start ladder it exists to provide. So a bot DEFENDER keeps full
    // health and stays uninjured (record/rank_points/cooldown still applied above/below, so
    // the ladder still shifts as players beat them). Attacker-side consequences are unchanged.
    const defenderIsBot = !!defender.isPvpBot;

    // 6. HP — attacker from engine, defender via method band (skipped for bot defenders).
    attacker.health = Math.min(100, result.playerHealthAfter ?? attacker.health ?? 100);
    attacker.healthLastRegenAt = now;
    if (!defenderIsBot) {
        if (isDraw) {
            // Draw: treat both as "winner" band (lightest) — symmetric, no decisive damage.
            applyHpLoss(defender, method === "Draw" ? "Decision" : method, "winner");
        } else {
            applyHpLoss(defender, method, defenderWon ? "winner" : "loser");
        }
    }

    // 7. Injuries — both fighters (defender skipped if it's a bot, to keep it fresh).
    const attackerIsFinishLoser = defenderWon && isFinish;
    const defenderIsFinishLoser = attackerWon && isFinish;
    rollAndApplyInjury(attacker, tier, attackerIsFinishLoser);
    if (!defenderIsBot) {
        rollAndApplyInjury(defender, tier, defenderIsFinishLoser);
    }

    // 8. Rewards (shared pools, down-weighted).
    const base = (PROMOTION_TIERS[tier] || PROMOTION_TIERS.Amateur).signingFee || 0;
    let attackerIron = 0;
    let defenderIron = 0;
    if (isDraw) {
        attackerIron = Math.round(base * PVP_IRON_DRAW_FRAC);
        defenderIron = Math.round(base * PVP_IRON_DRAW_FRAC);
    } else if (attackerWon) {
        attackerIron = Math.round(base * PVP_IRON_WIN_FRAC * gf);
        defenderIron = Math.round(base * PVP_IRON_LOSS_FRAC);
    } else {
        attackerIron = Math.round(base * PVP_IRON_LOSS_FRAC);
        // Defender's win reward scales by THEIR gap (defenderOvr - attackerOvr).
        defenderIron = Math.round(base * PVP_IRON_WIN_FRAC * gapFactor(defenderOvr - attackerOvr));
    }
    attacker.iron = (attacker.iron || 0) + attackerIron;
    defender.iron = (defender.iron || 0) + defenderIron;

    // Notoriety — wins only (losses fame-neutral). Defender perspective uses its own gap.
    let attackerFame = 0;
    let defenderFame = 0;
    let revengeWasApplied = false;
    if (attackerWon) {
        const baseWinFame = Math.round(baseFightNotoriety(tier, method) * PVP_FAME_WIN_FRAC * gf);
        // Revenge (§2.A): if the attacker LOST the prior fight in this pair within 72h and just
        // WON, the +15% bonus rides on top — folded into the same PVP_WIN award, still ×gapFactor.
        // ONLY the bonus portion counts the shared daily fame cap (Risk 8) + head-to-head diminish
        // (Risk 8 anti-farm). The base v1 win fame is unchanged/uncapped (existing economy).
        let revengeBonus = 0;
        if (revengeCtx.revengeAvailable && baseWinFame > 0) {
            const diminish = headToHeadDiminish(revengeCtx.priorSamePairToday);
            const raw = baseWinFame * (PVP_REVENGE_FAME_MULT - 1) * diminish;
            // awardCappedPvpFame applies the bonus through applyNotorietyDelta itself (capped),
            // so award the BASE separately and let the helper handle the bonus + cap accounting.
            revengeBonus = Math.round(raw);
        }
        if (baseWinFame !== 0) {
            notorietyService.applyNotorietyDelta(attacker, baseWinFame, {
                code: "PVP_WIN",
                reason: `PvP win vs ${defender.firstName} ${defender.lastName}`,
                meta: { defenderId: defender._id },
            });
        }
        let revengeApplied = 0;
        if (revengeBonus > 0) {
            revengeApplied = awardCappedPvpFame(attacker, revengeBonus, {
                code: "PVP_REVENGE_WIN",
                reason: `Revenge win vs ${defender.firstName} ${defender.lastName}`,
                meta: { defenderId: defender._id },
            });
        }
        attackerFame = baseWinFame + revengeApplied;
        revengeWasApplied = revengeApplied > 0;
    } else if (defenderWon) {
        defenderFame = Math.round(
            baseFightNotoriety(tier, method) * PVP_FAME_WIN_FRAC * gapFactor(defenderOvr - attackerOvr)
        );
        if (defenderFame !== 0) {
            notorietyService.applyNotorietyDelta(defender, defenderFame, {
                code: "PVP_WIN",
                reason: `PvP defence vs ${attacker.firstName} ${attacker.lastName}`,
                meta: { attackerId: attacker._id },
            });
        }
    }

    // 9. Belt.
    const isBeltFight =
        !!defender.pvp.is_champion &&
        attacker.pvp.ladder_rank != null &&
        attacker.pvp.ladder_rank <= (defender.pvp.belt_challenge_floor || PVP_BELT_FLOOR_DEFAULT);
    let beltChanged = false;
    let attackerBecameChampion = false;

    if (isBeltFight && attackerWon) {
        attacker.pvp.is_champion = true;
        attacker.pvp.belt_won_at = now;
        attacker.pvp.belt_challenge_floor = PVP_BELT_FLOOR_DEFAULT;
        attacker.pvp.interim_booked = false;
        defender.pvp.is_champion = false;
        defender.pvp.belt_lost_at = now;
        defender.pvp.former_champion = true;   // D — old_money title trigger (first belt loss)
        beltChanged = true;
        attackerBecameChampion = true;
    } else if (isBeltFight && (defenderWon || isDraw)) {
        // Champion retained — defended (a draw keeps the belt). Pay defense bonus on a real defence.
        if (defenderWon) {
            defender.pvp.belt_defenses = (defender.pvp.belt_defenses || 0) + 1;
            const defIron = Math.round(base * PVP_IRON_WIN_FRAC * PVP_BELT_DEFENSE_FRAC);
            const defFame = Math.round(baseFightNotoriety(tier, method) * PVP_FAME_WIN_FRAC * PVP_BELT_DEFENSE_FRAC);
            defender.iron = (defender.iron || 0) + defIron;
            defenderIron += defIron;
            if (defFame !== 0) {
                notorietyService.applyNotorietyDelta(defender, defFame, {
                    code: "PVP_BELT_DEFENCE",
                    reason: `Belt defence vs ${attacker.firstName} ${attacker.lastName}`,
                    meta: { attackerId: attacker._id },
                });
                defenderFame += defFame;
            }
        }
    }

    // ── The Circuit v1.1 — streaks / titles / contracts (before PvpFight.create) ──
    // D — incremental O(1) streaks for BOTH fighters (Risk 2: derive from the prior
    // current_streak, never re-query computeCurrentStreak per fight).
    attacker.pvp.current_streak = nextStreak(attackerStreakBefore, { win: attackerWon, loss: defenderWon, draw: isDraw });
    defender.pvp.current_streak = nextStreak(defenderStreakBefore, { win: defenderWon, loss: attackerWon, draw: isDraw });
    attacker.pvp.best_streak = Math.max(attacker.pvp.best_streak || 0, attacker.pvp.current_streak);
    defender.pvp.best_streak = Math.max(defender.pvp.best_streak || 0, defender.pvp.current_streak);

    // D — streak milestone fame on a positive streak that JUST hit a threshold (capped, diminished).
    let attackerStreakMilestone = null;
    if (attackerWon && PVP_STREAK_MILESTONES.includes(attacker.pvp.current_streak)) {
        attackerStreakMilestone = attacker.pvp.current_streak;
        const baseFame = PVP_STREAK_FAME[attacker.pvp.current_streak] || 0;
        const diminish = headToHeadDiminish(revengeCtx.priorSamePairToday);
        awardCappedPvpFame(attacker, Math.round(baseFame * diminish), {
            code: "PVP_STREAK",
            reason: `${attacker.pvp.current_streak}-fight PvP win streak`,
            meta: { streak: attacker.pvp.current_streak },
        });
    }

    // D — title counters (attacker/defender perspectives), using the at-fight ranks.
    if (attackerWon) {
        attacker.pvp.attack_wins = (attacker.pvp.attack_wins || 0) + 1;
        // giant_slayer: beat a HIGHER-ranked opponent (smaller ladder_rank number = higher).
        if (defenderRankAtFight != null && attackerRankAtFight != null && defenderRankAtFight < attackerRankAtFight) {
            attacker.pvp.giant_slayer_wins = (attacker.pvp.giant_slayer_wins || 0) + 1;
        }
    }
    if (defenderWon) {
        // gatekeeper: defender win while ranked top-10.
        if (defenderRankAtFight != null && defenderRankAtFight <= PVP_BELT_FLOOR_DEFAULT) {
            defender.pvp.top10_defenses = (defender.pvp.top10_defenses || 0) + 1;
        }
    }

    // D — title unlocks (idempotent) + one-time fame each (capped). former_champion already set
    // in step 9, best_streak above, counters above — so evaluate both fighters now.
    const attackerNewTitles = evaluateTitles(attacker.pvp);
    const defenderNewTitles = evaluateTitles(defender.pvp);
    for (const key of attackerNewTitles) {
        awardCappedPvpFame(attacker, PVP_TITLE_FAME, {
            code: "PVP_TITLE_UNLOCK",
            reason: `Unlocked title: ${PVP_TITLES[key]?.label || key}`,
            meta: { title: key },
        });
    }
    for (const key of defenderNewTitles) {
        awardCappedPvpFame(defender, PVP_TITLE_FAME, {
            code: "PVP_TITLE_UNLOCK",
            reason: `Unlocked title: ${PVP_TITLES[key]?.label || key}`,
            meta: { title: key },
        });
    }

    // F — contract progress, ATTACKER ONLY. Make sure the attacker's contracts are rotated to
    // today first (the read path also rotates lazily, but a fight can be the first touch of a day).
    ensureContractsState(attacker);
    if (attackerWon) {
        bumpContract(attacker.pvp, "daily", "win_1", 1);
        bumpContract(attacker.pvp, "weekly", "weekly_win_4", 1);
        if (isFinish) bumpContract(attacker.pvp, "daily", "finish_someone", 1);
        if (defenderRankAtFight != null && attackerRankAtFight != null && defenderRankAtFight < attackerRankAtFight) {
            bumpContract(attacker.pvp, "daily", "beat_higher_ranked", 1);
        }
    }

    // 10. Persist PvpFight.
    const winnerId = isDraw ? null : (attackerWon ? attacker._id : defender._id);
    const pvpFight = await PvpFight.create({
        attacker_id: attacker._id,
        defender_id: defender._id,
        attacker_camp: Array.isArray(attackerCamp) ? attackerCamp : [],
        defender_camp: [],
        result: { winner_id: winnerId, method, round },
        belt_changed: beltChanged,
        attacker_points_delta: aDelta,
        defender_points_delta: dDelta,
        attacker_iron_earned: attackerIron,
        defender_iron_earned: defenderIron,
        attacker_notoriety_earned: attackerFame,
        defender_notoriety_earned: defenderFame,
        attacker_ovr_at_fight: attackerOvr,
        defender_ovr_at_fight: defenderOvr,
        gap_factor: gf,
        fought_at: now,
        seen_by_attacker: true,
        seen_by_defender: false,
    });

    // A — Rivalry upsert (separate collection → atomic findOneAndUpdate, NOT saveWithVersionRetry).
    // Runs AFTER PvpFight.create. The nemesis flags it writes back live on pvp.*, so this must run
    // BEFORE captureFighterPvpSnapshot (step 13) or they'd be dropped on a save retry (Risk 1).
    try {
        await applyRivalryUpsert({
            attacker, defender, winnerId, isDraw, method, now,
        });
    } catch (err) {
        // A rivalry failure must never void a resolved fight. Log + continue (heat just lags).
        console.error("[pvp] rivalry upsert failed:", err.message);
    }

    // 11. Daily counter (only on successful resolution).
    attacker.pvp.attacks_today = (attacker.pvp.attacks_today || 0) + 1;

    // 12. Lazy reposition on the ladder for any newly/still-ranked fighter.
    await repositionTwoOnLadder(attacker, defender);

    // ── The Circuit v1.2 — bounty collection (Risk 6) ─────────────────────────
    // Only an attacker WIN can collect. tryCollectBounties does atomic compare-and-set on each
    // open bounty's status; the iron credit lands on the IN-MEMORY attacker.iron HERE, BEFORE the
    // snapshot is captured below — so a VersionError retry re-applies the same (already-credited)
    // iron value and never pays twice. It returns a summary for the §3.3 payload + bumps the
    // attacker's bounties_collected / weekly_collect_bounty contract.
    let bountyCollected = { count: 0, total_iron: 0, items: [] };
    if (attackerWon) {
        try {
            bountyCollected = await tryCollectBounties({
                attacker, defender, method, pvpFightId: pvpFight._id, now,
            });
        } catch (err) {
            // A bounty failure must never void a resolved fight (the fight + escrow stay intact).
            console.error("[pvp] bounty collection failed:", err.message);
        }
    }

    // ── The Circuit v1.2 — denormalize division on each fight (cheap in-memory write). ─────────
    attacker.pvp.division = divisionFor(attacker.pvp);
    defender.pvp.division = divisionFor(defender.pvp);

    // 13. Save both with version-retry. The fight is already resolved, so snapshot the
    // absolute final state and re-apply it onto a FRESH load each attempt (the util's
    // contract: loadFn loads fresh, mutateFn re-applies idempotently). applyFighterPvpSnapshot
    // sets absolute values, so it's safe to re-run against the race winner's persisted doc.
    const attackerSnapshot = captureFighterPvpSnapshot(attacker);
    const defenderSnapshot = captureFighterPvpSnapshot(defender);

    await saveWithVersionRetry(
        () => Fighter.findById(attacker._id),
        (fresh) => applyFighterPvpSnapshot(fresh, attackerSnapshot),
    );
    await saveWithVersionRetry(
        () => Fighter.findById(defender._id),
        (fresh) => applyFighterPvpSnapshot(fresh, defenderSnapshot),
    );

    // Defender HP AFTER applyHpLoss. GUARD: a bot defender skips applyHpLoss, so its
    // health is unchanged — for a bot this correctly reads the same value it started at
    // (defenders that are bots are pinned at 100, so before === after === 100).
    const defenderHealthAfter = typeof defender.health === "number" ? defender.health : defenderHealthBefore;

    // Attacker HP AFTER the engine (clamped ≤100 above). before is captured pre-engine by
    // the caller (initiatePvpAttack) and merged into the §3.3 health block there.
    const attackerHealthAfter = attacker.health;

    return {
        method,
        round,
        belt_changed: beltChanged,
        attacker_became_champion: attackerBecameChampion,
        attacker_points_delta: aDelta,
        attacker_iron_earned: attackerIron,
        attacker_notoriety_earned: attackerFame,
        pvpFightId: pvpFight._id,
        // Fight Night — defender block, captured AFTER all mutation at the §1 read points.
        defender: {
            name: ladderRowName(defender),
            nickname: defender.nickname || null,
            ovr: defenderOvr,
            style: defender.style,
            record_after: recordString(defender.pvp),
            ladder_rank_after: defender.pvp.ladder_rank ?? null,
            is_champion_after: !!defender.pvp.is_champion,
            rank_points_after: defender.pvp.rank_points || 0,
        },
        // Fight Night — HP after-values (attacker.before / defender.before merged by caller).
        attacker_health_after: attackerHealthAfter,
        defender_health_before: defenderHealthBefore,
        defender_health_after: defenderHealthAfter,
        // Fight Night — post-loss cooldown set THIS fight (step 5). Only the loser of a
        // decisive result gets one; the winner and both draw participants stay null. Gated on
        // outcome (not the persisted field) so a stale cooldown from a PRIOR loss isn't surfaced.
        attacker_cooldown_after: (!isDraw && defenderWon) ? (attacker.pvp.attackable_after ?? null) : null,
        defender_cooldown_after: (!isDraw && attackerWon) ? (defender.pvp.attackable_after ?? null) : null,
        // The Circuit v1.1 — incremental streak (Risk 2: no per-fight re-query) + flair flags.
        attacker_current_streak: attacker.pvp.current_streak || 0,
        attacker_streak_milestone: attackerStreakMilestone,
        revenge_applied: revengeWasApplied,
        attacker_new_titles: attackerNewTitles,
        // The Circuit v1.2 — bounty collection summary for the §3.3 attack payload.
        bounty_collected: bountyCollected,
        attacker_division: attacker.pvp.division ?? null,
    };
}

// ── The Circuit v1.1 — rivalry + revenge internals ────────────────────────────

/**
 * Read the revenge/head-to-head context for a pair BEFORE the current fight is recorded.
 * Returns:
 *   - revengeAvailable: the OTHER fighter (defender) won the most-recent prior fight in this
 *     pair within the 72h window → if the attacker now wins, the revenge bonus fires.
 *   - priorSamePairToday: how many fights this exact pair has already had today (for the
 *     head-to-head diminishing anti-farm multiplier).
 */
async function loadRevengeContext(attackerId, defenderId, now) {
    const me = String(attackerId);
    const opp = String(defenderId);
    const windowStart = new Date(now.getTime() - PVP_REVENGE_WINDOW_HOURS * HOUR_MS);

    const prior = await PvpFight.findOne({
        $or: [
            { attacker_id: attackerId, defender_id: defenderId },
            { attacker_id: defenderId, defender_id: attackerId },
        ],
    })
        .sort({ fought_at: -1 })
        .select("result.winner_id fought_at")
        .lean();

    let revengeAvailable = false;
    if (prior && prior.fought_at && new Date(prior.fought_at) >= windowStart) {
        const w = prior.result?.winner_id;
        revengeAvailable = w != null && String(w) === opp; // the defender beat me last, in-window
    }

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const priorSamePairToday = await PvpFight.countDocuments({
        fought_at: { $gte: dayStart },
        $or: [
            { attacker_id: attackerId, defender_id: defenderId },
            { attacker_id: defenderId, defender_id: attackerId },
        ],
    });

    return { revengeAvailable, priorSamePairToday };
}

/**
 * A — atomic rivalry upsert + nemesis maintenance. Separate collection, so the upsert itself
 * is the concurrency guard (NOT saveWithVersionRetry). Recomputes leader_id, bumps heat (+1,
 * +1 more if the leader flipped), and sets/clears each fighter's pvp.nemesis_pvp in place
 * (the caller snapshots pvp AFTER this returns).
 */
async function applyRivalryUpsert({ attacker, defender, winnerId, isDraw, method, now }) {
    const aId = attacker._id;
    const dId = defender._id;
    const key = pairKeyFor(aId, dId);
    const firstId = pairFirstId(aId, dId);
    const attackerIsA = String(aId) === firstId;

    // Build the per-fight increment in (a,b) terms.
    const inc = { total_fights: 1, a_wins: 0, b_wins: 0, draws: 0 };
    if (isDraw) {
        inc.draws = 1;
    } else if (String(winnerId) === String(aId)) {
        if (attackerIsA) inc.a_wins = 1; else inc.b_wins = 1;
    } else {
        if (attackerIsA) inc.b_wins = 1; else inc.a_wins = 1;
    }

    const existing = await Rivalry.findOne({ pair_key: key }).lean();
    const prevLeader = existing?.leader_id ? String(existing.leader_id) : null;

    const aWinsAfter = (existing?.a_wins || 0) + inc.a_wins;
    const bWinsAfter = (existing?.b_wins || 0) + inc.b_wins;
    const fighterAId = existing?.fighter_a || (attackerIsA ? aId : dId);
    const fighterBId = existing?.fighter_b || (attackerIsA ? dId : aId);

    let leaderAfter = null;
    if (aWinsAfter > bWinsAfter) leaderAfter = String(fighterAId);
    else if (bWinsAfter > aWinsAfter) leaderAfter = String(fighterBId);
    // tied → null

    const leaderFlipped = prevLeader !== leaderAfter && (prevLeader !== null || leaderAfter !== null);
    const heatBump = 1 + (leaderFlipped ? 1 : 0);

    await Rivalry.findOneAndUpdate(
        { pair_key: key },
        {
            $setOnInsert: {
                pair_key: key,
                fighter_a: attackerIsA ? aId : dId,
                fighter_b: attackerIsA ? dId : aId,
                heat_last_decay_at: now,
            },
            $inc: { ...inc, heat: heatBump },
            $set: {
                leader_id: leaderAfter ? leaderAfter : null,
                last_fought_at: now,
                last_winner_id: isDraw ? null : winnerId,
                last_method: method,
            },
        },
        { upsert: true, new: true }
    );

    // Nemesis (§2.A): if the OTHER fighter leads head-to-head by ≥ deficit, the trailing fighter
    // gains them as nemesis_pvp; clear when the deficit is ≤ 0. Written on BOTH fighters' pvp.
    const aLead = aWinsAfter - bWinsAfter; // >0 → A leads
    // Attacker perspective
    const attackerLead = attackerIsA ? aLead : -aLead;
    const defenderLead = -attackerLead;
    setNemesis(attacker.pvp, defender._id, attackerLead);
    setNemesis(defender.pvp, attacker._id, defenderLead);
}

/** Set/clear a fighter's nemesis_pvp given how far they lead the head-to-head (negative = trailing). */
function setNemesis(pvp, opponentId, myLead) {
    if (myLead <= -PVP_NEMESIS_DEFICIT) {
        pvp.nemesis_pvp = opponentId;
    } else if (pvp.nemesis_pvp && String(pvp.nemesis_pvp) === String(opponentId) && myLead > -PVP_NEMESIS_DEFICIT) {
        pvp.nemesis_pvp = null;
    }
}

/**
 * Capture the post-fight absolute values we must preserve across a version-conflict reload.
 * The fight outcome is already decided, so these are the authoritative end-state values.
 */
function captureFighterPvpSnapshot(fighter) {
    // Make sure the v1.1 + v1.2 fields exist before the deep clone so none are dropped. The whole
    // pvp subdoc is cloned wholesale, so every v1.1 field (current_streak, best_streak,
    // titles, active_title, attack_wins, giant_slayer_wins, top10_defenses, former_champion,
    // nemesis_pvp, fame_today, fame_day_key, fame_lifetime, contracts) AND every v1.2 field
    // (division, season_start_points, season_titles, season_number_seen, bounties_collected)
    // rides along — but the clone stringifies ObjectIds, so nemesis_pvp is preserved as a string
    // and re-cast on apply. The bounty-collect iron credit also rides via snap.iron (Risk 6:
    // it is applied to attacker.iron BEFORE this capture runs in processPvpResult).
    ensureCircuitShape(fighter);
    return {
        pvp: JSON.parse(JSON.stringify(fighter.pvp)),
        health: fighter.health,
        healthLastRegenAt: fighter.healthLastRegenAt,
        iron: fighter.iron,
        injuries: (fighter.injuries || []).map((i) => (i.toObject ? i.toObject() : i)),
        notorietyScore: fighter.notoriety?.score,
        // stat penalties from injuries are baked into the stat fields already
        stats: STAT_KEYS.reduce((acc, k) => { acc[k] = fighter[k]; return acc; }, {}),
        maxStamina: fighter.maxStamina,
    };
}

function applyFighterPvpSnapshot(fresh, snap) {
    fresh.pvp = snap.pvp;
    fresh.health = snap.health;
    fresh.healthLastRegenAt = snap.healthLastRegenAt;
    fresh.iron = snap.iron;
    fresh.injuries = snap.injuries;
    if (snap.notorietyScore != null && fresh.notoriety) fresh.notoriety.score = snap.notorietyScore;
    for (const k of STAT_KEYS) if (snap.stats[k] != null) fresh[k] = snap.stats[k];
    if (snap.maxStamina != null) fresh.maxStamina = snap.maxStamina;
    fresh.markModified("pvp");
    fresh.markModified("injuries");
}

// ── §4.5 repositionTwoOnLadder ────────────────────────────────────────────────

/**
 * O(small)-write lazy reposition: recompute ladder_rank for each fighter that has ≥3
 * PvP fights as (count of ranked fighters with strictly more rank points) + 1. The nightly
 * recalc is authoritative; this just keeps the two participants roughly correct between runs.
 */
async function repositionTwoOnLadder(...fighters) {
    for (const f of fighters) {
        ensurePvpShape(f);
        if ((f.pvp.total_fights || 0) < PVP_ONBOARDING_FIGHTS) {
            f.pvp.ladder_rank = null;
            continue;
        }
        const ahead = await Fighter.countDocuments({
            _id: { $ne: f._id },
            "pvp.total_fights": { $gte: PVP_ONBOARDING_FIGHTS },
            "pvp.rank_points": { $gt: f.pvp.rank_points || 0 },
        });
        f.pvp.ladder_rank = ahead + 1;
    }
}

// ── §4.6 Query helpers ────────────────────────────────────────────────────────

function blockReasonFor(viewer, row, now) {
    if (String(viewer._id) === String(row._id)) return "self";
    if (Math.abs((viewer.overallRating || 0) - (row.overallRating || 0)) > PVP_OVR_BRACKET) {
        return "out_of_bracket";
    }
    if (isRecovering(row.pvp || {}, now)) return "target_recovering";
    return null;
}

function ladderRowName(f) {
    if (f.nickname) return `${f.firstName} "${f.nickname}" ${f.lastName}`;
    return `${f.firstName} ${f.lastName}`;
}

/**
 * §3.1 — paginated ladder for ranked fighters (total_fights ≥ 3).
 * Sort: rank_points desc → win% desc → last_pvp_fight_at desc.
 */
async function getLadder({ page = 1, limit = PVP_LADDER_LIMIT_DEFAULT, search = "", viewerId } = {}) {
    const now = new Date();
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    let safeLimit = parseInt(limit, 10) || PVP_LADDER_LIMIT_DEFAULT;
    safeLimit = Math.max(1, Math.min(PVP_LADDER_LIMIT_MAX, safeLimit));

    const viewer = await Fighter.findById(viewerId);
    if (!viewer) throw pvpError("Fighter not found", "fighter_not_found");
    ensurePvpShape(viewer);
    ensurePvpDailyState(viewer);

    const match = { "pvp.total_fights": { $gte: PVP_ONBOARDING_FIGHTS } };
    if (search && typeof search === "string" && search.trim()) {
        const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60);
        const rx = new RegExp(safe, "i");
        match.$or = [{ firstName: rx }, { lastName: rx }, { nickname: rx }];
    }

    const pipeline = [
        { $match: match },
        { $addFields: { _winPct: { $divide: [{ $ifNull: ["$pvp.wins", 0] }, { $max: [1, { $ifNull: ["$pvp.total_fights", 0] }] }] } } },
        { $sort: { "pvp.rank_points": -1, _winPct: -1, "pvp.last_pvp_fight_at": -1, _id: 1 } },
    ];

    const totalArr = await Fighter.aggregate([...pipeline, { $count: "n" }]);
    const total = totalArr[0]?.n || 0;

    const rowsRaw = await Fighter.aggregate([
        ...pipeline,
        { $skip: (safePage - 1) * safeLimit },
        { $limit: safeLimit },
        {
            $project: {
                firstName: 1, lastName: 1, nickname: 1, style: 1,
                overallRating: 1, promotionTier: 1, pvp: 1,
            },
        },
    ]);

    const rows = rowsRaw.map((f) => {
        const pvp = f.pvp || {};
        const block = blockReasonFor(viewer, f, now);
        return {
            fighterId: String(f._id),
            ladder_rank: pvp.ladder_rank ?? null,
            name: ladderRowName(f),
            ovr: f.overallRating || 0,
            style: f.style,
            record: recordString(pvp),
            rank_points: pvp.rank_points || 0,
            is_champion: !!pvp.is_champion,
            is_me: String(viewer._id) === String(f._id),
            in_challenge_zone: pvp.ladder_rank != null && pvp.ladder_rank <= PVP_BELT_FLOOR_DEFAULT,
            attackable: block === null,
            block_reason: block,
        };
    });

    // Champion (separately, may be outside the current page).
    const champDoc = await Fighter.findOne({ "pvp.is_champion": true })
        .select("firstName lastName nickname style overallRating pvp").lean();
    let champion = null;
    if (champDoc) {
        const cp = champDoc.pvp || {};
        champion = {
            fighterId: String(champDoc._id),
            name: ladderRowName(champDoc),
            ladder_rank: cp.ladder_rank ?? 1,
            ovr: champDoc.overallRating || 0,
            style: champDoc.style,
            record: recordString(cp),
            rank_points: cp.rank_points || 0,
        };
    }

    const isRanked = (viewer.pvp.total_fights || 0) >= PVP_ONBOARDING_FIGHTS;
    const me = {
        fighterId: String(viewer._id),
        ladder_rank: viewer.pvp.ladder_rank ?? null,
        ovr: viewer.overallRating || 0,
        rank_points: viewer.pvp.rank_points || 0,
        attacks_today: viewer.pvp.attacks_today || 0,
        attack_cap: dailyCapFor(viewer),
        is_ranked: isRanked,
    };

    return { page: safePage, limit: safeLimit, total, champion, me, rows };
}

/**
 * Signed current PvP streak for a fighter (Fight Night).
 *
 * Newest-20 fights (uses the existing attacker_id / defender_id / fought_at indexes);
 * walk from newest counting the LEADING run: win → +, loss → −, a draw (winner_id null)
 * breaks the run → 0. +N wins / −N losses / 0 none.
 */
async function computeCurrentStreak(fighterId) {
    const me = String(fighterId);
    const fights = await PvpFight.find({
        $or: [{ attacker_id: fighterId }, { defender_id: fighterId }],
    })
        .sort({ fought_at: -1 })
        .limit(20)
        .select("attacker_id defender_id result.winner_id")
        .lean();

    let streak = 0;
    let dir = 0; // +1 winning run, -1 losing run, 0 undecided
    for (const fgt of fights) {
        const winnerId = fgt.result?.winner_id;
        if (winnerId == null) break;           // draw breaks the run
        const isWin = String(winnerId) === me; // else it's a loss for me
        const step = isWin ? 1 : -1;
        if (dir === 0) {
            dir = step;
            streak = step;
        } else if (step === dir) {
            streak += step;
        } else {
            break; // run ended
        }
    }
    return streak;
}

/**
 * §3.2 — public PvP profile. HP + injuries NEVER returned.
 *
 * @param {string} fighterId  the profile target
 * @param {string} [viewerId] the requesting fighter (controller passes req.user.fighterId);
 *                            powers rank_points_preview. Omitted in callers that don't need it.
 */
async function getPvpProfile(fighterId, viewerId = null) {
    const f = await Fighter.findById(fighterId)
        .select("firstName lastName nickname style overallRating promotionTier pvp").lean();
    if (!f) throw pvpError("Fighter not found", "fighter_not_found");
    const pvp = f.pvp || defaultPvp();
    const now = new Date();

    // Prefer the persisted incremental streak (v1.1); fall back to a history walk for legacy
    // docs that predate current_streak.
    const current_streak = (pvp.current_streak != null)
        ? pvp.current_streak
        : await computeCurrentStreak(fighterId);

    // rank_points_preview — what the VIEWER would gain/lose attacking this target.
    // calcDelta does NOT throw on a null viewer (self) rank, but it MISBEHAVES: its
    // `opponentRank > playerRank` / `< playerRank` comparisons coerce null→0, so an
    // unranked viewer's on_loss always reads as an upset loss (−2) and on_win drops its
    // upset bonus silently. Both are wrong/misleading, so per the contract we fall back
    // to nulls (frontend renders "—") whenever the viewer has no ladder rank yet.
    let rank_points_preview = { on_win: null, on_loss: null };
    // §3.6 additive — viewer-perspective head-to-head from the rivalry doc + revenge availability.
    let head_to_head = null;
    if (viewerId && String(viewerId) !== String(fighterId)) {
        const viewer = await Fighter.findById(viewerId).select("pvp").lean();
        const viewerRank = viewer?.pvp?.ladder_rank ?? null;
        const targetRank = pvp.ladder_rank ?? null;
        if (viewerRank != null) {
            rank_points_preview = {
                on_win: rankingService.calcDelta({ isWin: true, method: "DEC" }, viewerRank, targetRank),
                on_loss: rankingService.calcDelta({ isLoss: true, method: "DEC" }, viewerRank, targetRank),
            };
        }
        head_to_head = await buildHeadToHead(viewerId, fighterId, now);
    }

    return {
        fighterId: String(f._id),
        name: ladderRowName(f),
        nickname: f.nickname || null,
        ovr: f.overallRating || 0,
        style: f.style,
        promotionTier: f.promotionTier,
        rank_points_preview,
        // §3.6 additive — titles + active title (cosmetic) + viewer head-to-head.
        head_to_head,
        pvp: {
            wins: pvp.wins || 0,
            losses: pvp.losses || 0,
            draws: pvp.draws || 0,
            total_fights: pvp.total_fights || 0,
            rank_points: pvp.rank_points || 0,
            ladder_rank: pvp.ladder_rank ?? null,
            is_champion: !!pvp.is_champion,
            belt_defenses: pvp.belt_defenses || 0,
            belt_challenge_floor: pvp.belt_challenge_floor ?? PVP_BELT_FLOOR_DEFAULT,
            current_streak,
            best_streak: pvp.best_streak || 0,
            titles: Array.isArray(pvp.titles) ? pvp.titles : [],
            active_title: pvp.active_title ?? null,
            // v1.2 additive — band-based division (display-only).
            division: divisionFor(pvp),
            is_attackable_now: !isRecovering(pvp, now) && (pvp.total_fights || 0) >= PVP_ONBOARDING_FIGHTS,
            attackable_after: pvp.attackable_after ?? null,
        },
    };
}

/**
 * Viewer-perspective head-to-head + revenge availability against a target, read from the
 * rivalry doc. Returns null if no rivalry exists yet. `revenge_available` = the target won
 * the most recent fight within 72h AND the target is currently attackable by the viewer.
 */
async function buildHeadToHead(viewerId, targetId, now = new Date()) {
    const key = pairKeyFor(viewerId, targetId);
    const riv = await Rivalry.findOne({ pair_key: key }).lean();
    if (!riv) return null;
    const viewerIsA = pairFirstId(viewerId, targetId) === String(viewerId);
    const myWins = viewerIsA ? (riv.a_wins || 0) : (riv.b_wins || 0);
    const theirWins = viewerIsA ? (riv.b_wins || 0) : (riv.a_wins || 0);

    let leader = "tied";
    if (riv.leader_id) leader = String(riv.leader_id) === String(viewerId) ? "me" : "them";

    const windowStart = new Date(now.getTime() - PVP_REVENGE_WINDOW_HOURS * HOUR_MS);
    const targetWonLast = riv.last_winner_id && String(riv.last_winner_id) === String(targetId);
    const inWindow = riv.last_fought_at && new Date(riv.last_fought_at) >= windowStart;
    const revenge_available = !!(targetWonLast && inWindow);

    return {
        my_wins: myWins,
        their_wins: theirWins,
        draws: riv.draws || 0,
        total_fights: riv.total_fights || 0,
        leader,
        heat: riv.heat || 0,
        is_grudge: (riv.heat || 0) >= PVP_GRUDGE_HEAT,
        is_nemesis: false, // filled by callers that hold the viewer's pvp.nemesis_pvp
        last_method: riv.last_method || null,
        last_fought_at: riv.last_fought_at || null,
        revenge_available,
    };
}

/** §3.4 — paginated history for the caller (attacker OR defender). */
async function getHistory({ page = 1, limit = PVP_HISTORY_LIMIT_DEFAULT, fighterId } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    let safeLimit = parseInt(limit, 10) || PVP_HISTORY_LIMIT_DEFAULT;
    safeLimit = Math.max(1, Math.min(PVP_HISTORY_LIMIT_MAX, safeLimit));

    const me = String(fighterId);
    const filter = { $or: [{ attacker_id: fighterId }, { defender_id: fighterId }] };
    const total = await PvpFight.countDocuments(filter);
    const fights = await PvpFight.find(filter)
        .sort({ fought_at: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean();

    const otherIds = new Set();
    for (const fgt of fights) {
        otherIds.add(String(fgt.attacker_id) === me ? String(fgt.defender_id) : String(fgt.attacker_id));
    }
    const others = await Fighter.find({ _id: { $in: [...otherIds] } })
        .select("firstName lastName nickname").lean();
    const nameById = new Map(others.map((o) => [String(o._id), ladderRowName(o)]));

    // §3.6 additive — per-row tags. Batch-load the rivalry doc for each opponent on this page
    // (one query) for rivalry_heat. revenge/streak are derived from the page's own ordering.
    const pairKeys = [...otherIds].map((oid) => pairKeyFor(me, oid));
    const rivs = pairKeys.length
        ? await Rivalry.find({ pair_key: { $in: pairKeys } }).select("pair_key heat").lean()
        : [];
    const heatByPair = new Map(rivs.map((r) => [r.pair_key, r.heat || 0]));

    // Walk OLDEST→NEWEST to derive a per-row signed streak + revenge flag without a full
    // history re-query. `fights` is newest-first, so reverse a shallow copy for the walk.
    const chrono = fights.slice().reverse();
    const tagById = new Map();
    let runStreak = 0;
    const lastLossAtByOpp = new Map(); // opponentId → Date of my most recent loss to them
    for (const fgt of chrono) {
        const otherId = String(fgt.attacker_id) === me ? String(fgt.defender_id) : String(fgt.attacker_id);
        let outcome;
        if (fgt.result.method === "Draw" || !fgt.result.winner_id) outcome = "draw";
        else outcome = String(fgt.result.winner_id) === me ? "win" : "loss";

        if (outcome === "win") runStreak = runStreak >= 0 ? runStreak + 1 : 1;
        else if (outcome === "loss") runStreak = runStreak <= 0 ? runStreak - 1 : -1;
        else runStreak = 0;

        let revenge = false;
        if (outcome === "win") {
            const lastLossAt = lastLossAtByOpp.get(otherId);
            if (lastLossAt && fgt.fought_at &&
                (new Date(fgt.fought_at) - new Date(lastLossAt)) <= PVP_REVENGE_WINDOW_HOURS * HOUR_MS) {
                revenge = true;
            }
        }
        if (outcome === "loss") lastLossAtByOpp.set(otherId, fgt.fought_at);

        tagById.set(String(fgt._id), {
            revenge,
            streak: outcome === "win" && runStreak >= 3 ? runStreak : null,
            rivalry_heat: heatByPair.get(pairKeyFor(me, otherId)) || 0,
        });
    }

    const rows = fights.map((fgt) => {
        const role = String(fgt.attacker_id) === me ? "attacker" : "defender";
        const otherId = role === "attacker" ? String(fgt.defender_id) : String(fgt.attacker_id);
        let outcome;
        if (fgt.result.method === "Draw" || !fgt.result.winner_id) outcome = "draw";
        else outcome = String(fgt.result.winner_id) === me ? "win" : "loss";
        const rankDelta = role === "attacker" ? fgt.attacker_points_delta : fgt.defender_points_delta;
        const iron = role === "attacker" ? fgt.attacker_iron_earned : fgt.defender_iron_earned;
        const fame = role === "attacker" ? fgt.attacker_notoriety_earned : fgt.defender_notoriety_earned;
        return {
            pvpFightId: String(fgt._id),
            role,
            opponent: { fighterId: otherId, name: nameById.get(otherId) || "Unknown" },
            outcome,
            method: fgt.result.method,
            round: fgt.result.round ?? null,
            rank_points_delta: rankDelta || 0,
            iron_earned: iron || 0,
            notoriety_earned: fame || 0,
            belt_changed: !!fgt.belt_changed,
            fought_at: fgt.fought_at,
            tags: tagById.get(String(fgt._id)) || { revenge: false, streak: null, rivalry_heat: 0 },
        };
    });

    return { page: safePage, limit: safeLimit, total, rows };
}

/** §3.5 — unseen results where the caller was the defender. Read-only (does NOT mark seen). */
async function getPending(fighterId) {
    const me = String(fighterId);
    const fights = await PvpFight.find({ defender_id: fighterId, seen_by_defender: false })
        .sort({ fought_at: -1 })
        .lean();

    const attackerIds = [...new Set(fights.map((f) => String(f.attacker_id)))];
    const attackers = await Fighter.find({ _id: { $in: attackerIds } })
        .select("firstName lastName nickname").lean();
    const nameById = new Map(attackers.map((a) => [String(a._id), ladderRowName(a)]));

    const rows = fights.map((fgt) => {
        let outcome;
        if (fgt.result.method === "Draw" || !fgt.result.winner_id) outcome = "draw";
        else outcome = String(fgt.result.winner_id) === me ? "win" : "loss";
        return {
            pvpFightId: String(fgt._id),
            attacker: {
                fighterId: String(fgt.attacker_id),
                name: nameById.get(String(fgt.attacker_id)) || "Unknown",
            },
            outcome,
            method: fgt.result.method,
            belt_changed: !!fgt.belt_changed,
            fought_at: fgt.fought_at,
        };
    });

    return { count: rows.length, rows };
}

/** Mark all of the defender's pending results seen. Called from gazetteService.dismissGazette. */
async function markPendingSeen(defenderId) {
    const res = await PvpFight.updateMany(
        { defender_id: defenderId, seen_by_defender: false },
        { $set: { seen_by_defender: true } }
    );
    return res.modifiedCount || 0;
}

// ── The Circuit v1.1 — read/write endpoints ───────────────────────────────────

/** Map a contract def (id) → static pool entry (label/goal). */
function contractDef(which, id) {
    const pool = PVP_CONTRACT_POOL[which] || [];
    return pool.find((c) => c.id === id) || null;
}

/** Serialize a fighter's contracts (rotation-applied) into the §3.1 payload shape. */
function serializeContracts(pvp) {
    const mapRow = (which) => (c) => {
        const def = contractDef(which, c.id);
        const complete = (c.progress || 0) >= (c.goal || 0);
        return {
            id: c.id,
            label: def?.label || c.id,
            goal: c.goal || 0,
            progress: c.progress || 0,
            claimed: !!c.claimed,
            claimable: complete && !c.claimed,
            reward: { fame: PVP_CONTRACT_FAME[c.id] || 0 },
        };
    };
    return {
        daily: (pvp.contracts?.daily || []).map(mapRow("daily")),
        weekly: (pvp.contracts?.weekly || []).map(mapRow("weekly")),
        daily_resets_at: endOfTodayIso(),
        weekly_resets_at: endOfIsoWeekIso(),
    };
}

/**
 * §3.2 — viewer's rivalries, sorted heat desc. Each row carries viewer-perspective head-to-head,
 * grudge/nemesis flags, last method, and revenge/attackability (reuses blockReasonFor).
 */
async function getRivalries(viewerId, { limit = 25 } = {}) {
    const now = new Date();
    let safeLimit = parseInt(limit, 10) || 25;
    safeLimit = Math.max(1, Math.min(100, safeLimit));

    const viewer = await Fighter.findById(viewerId)
        .select("overallRating pvp").lean();
    if (!viewer) throw pvpError("Fighter not found", "fighter_not_found");
    const nemesisId = viewer.pvp?.nemesis_pvp ? String(viewer.pvp.nemesis_pvp) : null;

    const rivs = await Rivalry.find({
        $or: [{ fighter_a: viewerId }, { fighter_b: viewerId }],
    })
        .sort({ heat: -1, last_fought_at: -1 })
        .limit(safeLimit)
        .lean();

    const oppIds = rivs.map((r) =>
        String(r.fighter_a) === String(viewerId) ? String(r.fighter_b) : String(r.fighter_a));
    const opps = await Fighter.find({ _id: { $in: oppIds } })
        .select("firstName lastName nickname style overallRating pvp").lean();
    const oppById = new Map(opps.map((o) => [String(o._id), o]));

    const rows = rivs.map((riv) => {
        const oppId = String(riv.fighter_a) === String(viewerId) ? String(riv.fighter_b) : String(riv.fighter_a);
        const opp = oppById.get(oppId);
        const viewerIsA = String(riv.fighter_a) === String(viewerId);
        const myWins = viewerIsA ? (riv.a_wins || 0) : (riv.b_wins || 0);
        const theirWins = viewerIsA ? (riv.b_wins || 0) : (riv.a_wins || 0);
        let leader = "tied";
        if (riv.leader_id) leader = String(riv.leader_id) === String(viewerId) ? "me" : "them";

        const block = opp ? blockReasonFor(viewer, opp, now) : "fighter_not_found";
        const windowStart = new Date(now.getTime() - PVP_REVENGE_WINDOW_HOURS * HOUR_MS);
        const targetWonLast = riv.last_winner_id && String(riv.last_winner_id) === oppId;
        const inWindow = riv.last_fought_at && new Date(riv.last_fought_at) >= windowStart;
        const revenge_available = !!(targetWonLast && inWindow && block === null);

        return {
            fighterId: oppId,
            name: opp ? ladderRowName(opp) : "Unknown",
            ovr: opp?.overallRating || 0,
            style: opp?.style || null,
            head_to_head: { my_wins: myWins, their_wins: theirWins, draws: riv.draws || 0 },
            leader,
            heat: riv.heat || 0,
            is_grudge: (riv.heat || 0) >= PVP_GRUDGE_HEAT,
            is_nemesis: nemesisId === oppId,
            last_method: riv.last_method || null,
            last_fought_at: riv.last_fought_at || null,
            revenge_available,
            attackable: block === null,
            block_reason: block,
        };
    });

    return { rows };
}

/**
 * E — read-only ticker. Newest PvpFights where the viewer participates OR a rival/nemesis is
 * involved OR belt_changed. Mapped to {id,kind,text,fought_at,actor,action}. kinds in v1.1:
 * you_attacked / you_were_attacked / rival_fight / belt_change.
 */
async function getTicker(viewerId, { limit = 20 } = {}) {
    const me = String(viewerId);
    let safeLimit = parseInt(limit, 10) || 20;
    safeLimit = Math.max(1, Math.min(50, safeLimit));

    // Rival opponent ids (one query) so we can surface rival-only fights too.
    const rivs = await Rivalry.find({ $or: [{ fighter_a: viewerId }, { fighter_b: viewerId }] })
        .sort({ heat: -1 })
        .limit(50)
        .select("fighter_a fighter_b").lean();
    const rivalIds = new Set();
    for (const r of rivs) {
        rivalIds.add(String(r.fighter_a) === me ? String(r.fighter_b) : String(r.fighter_a));
    }
    const rivalIdArr = [...rivalIds];

    const orClauses = [
        { attacker_id: viewerId },
        { defender_id: viewerId },
        { belt_changed: true },
    ];
    if (rivalIdArr.length) {
        orClauses.push({ attacker_id: { $in: rivalIdArr } });
        orClauses.push({ defender_id: { $in: rivalIdArr } });
    }

    const fights = await PvpFight.find({ $or: orClauses })
        .sort({ fought_at: -1 })
        .limit(safeLimit)
        .lean();

    const nameIds = new Set();
    for (const f of fights) { nameIds.add(String(f.attacker_id)); nameIds.add(String(f.defender_id)); }
    const people = await Fighter.find({ _id: { $in: [...nameIds] } })
        .select("firstName lastName nickname").lean();
    const nameById = new Map(people.map((p) => [String(p._id), ladderRowName(p)]));

    const items = fights.map((f) => {
        const aId = String(f.attacker_id);
        const dId = String(f.defender_id);
        const aName = nameById.get(aId) || "A fighter";
        const dName = nameById.get(dId) || "a fighter";
        const winnerId = f.result?.winner_id ? String(f.result.winner_id) : null;
        const method = f.result?.method || "Decision";
        const verb = method === "Draw" ? "drew with" : (winnerId === aId ? "beat" : "lost to");

        let kind, text, actor;
        if (f.belt_changed) {
            kind = "belt_change";
            const champId = winnerId || aId;
            actor = { fighterId: champId, name: nameById.get(champId) || aName };
            text = `${actor.name} captured the PvP belt.`;
        } else if (aId === me) {
            kind = "you_attacked";
            actor = { fighterId: dId, name: dName };
            text = `You ${verb === "beat" ? "beat" : verb} ${dName} by ${method}.`;
        } else if (dId === me) {
            kind = "you_were_attacked";
            actor = { fighterId: aId, name: aName };
            text = `${aName} ${winnerId === aId ? "beat you" : "came at you"} by ${method}.`;
        } else {
            kind = "rival_fight";
            const rivalSideId = rivalIds.has(aId) ? aId : dId;
            actor = { fighterId: rivalSideId, name: nameById.get(rivalSideId) || aName };
            text = `${aName} ${verb} ${dName} by ${method}.`;
        }

        // action: a one-tap challenge target for the frontend (defenderId to open the flow).
        const action = (actor && actor.fighterId && actor.fighterId !== me)
            ? { type: "challenge", defenderId: actor.fighterId }
            : null;

        return { id: String(f._id), kind, text, fought_at: f.fought_at, actor, action };
    });

    return items;
}

/**
 * §3.1 — the Yard hub feed. identity + revenge_cards + ticker + contracts in one read.
 */
async function getPvpHub(viewerId) {
    const now = new Date();
    const viewer = await Fighter.findById(viewerId);
    if (!viewer) throw pvpError("Fighter not found", "fighter_not_found");
    ensureCircuitShape(viewer);
    ensurePvpDailyState(viewer);
    ensureContractsState(viewer); // F — rotate contracts lazily on hub read

    // Persist any contract rotation that just happened (best-effort; never block the read).
    try {
        await saveWithVersionRetry(
            () => Fighter.findById(viewer._id),
            (fresh) => {
                ensureCircuitShape(fresh);
                ensureContractsState(fresh);
                fresh.markModified("pvp");
            },
        );
    } catch (err) {
        console.error("[pvp] hub contract rotation persist failed:", err.message);
    }

    const pvp = viewer.pvp;
    const total = Math.max(1, pvp.total_fights || 0);
    const win_pct = (pvp.wins || 0) / total;

    // KO / finish rate from this fighter's PvP win methods.
    const winFights = await PvpFight.find({
        "result.winner_id": viewer._id,
    }).select("result.method").lean();
    const koWins = winFights.filter((f) => f.result?.method === "KO").length;
    const finishWins = winFights.filter((f) => f.result?.method === "KO" || f.result?.method === "Submission").length;
    const totalWins = Math.max(1, winFights.length);
    const ko_rate = koWins / totalWins;
    const finish_rate = finishWins / totalWins;

    const rivals_active = await Rivalry.countDocuments({
        $or: [{ fighter_a: viewer._id }, { fighter_b: viewer._id }],
        heat: { $gt: 0 },
    });

    const ranks_from_challenge_zone = (pvp.ladder_rank != null)
        ? Math.max(0, pvp.ladder_rank - PVP_BELT_FLOOR_DEFAULT)
        : null;

    // v1.2 — division (band-based) + total open bounty escrow on the viewer's head.
    const division = divisionFor(pvp);
    let bounty_on_head = 0;
    try {
        const onMe = await Bounty.find({ target_id: viewer._id, status: "open" }).select("escrow_amount").lean();
        bounty_on_head = onMe.reduce((sum, b) => sum + (b.escrow_amount || 0), 0);
    } catch (err) {
        console.error("[pvp] hub bounty_on_head read failed:", err.message);
    }

    const identity = {
        fighterId: String(viewer._id),
        name: ladderRowName(viewer),
        active_title: pvp.active_title ?? null,
        division, // v1.2 — band-based
        division_label: divisionLabel(division),
        record: recordString(pvp),
        win_pct,
        ladder_rank: pvp.ladder_rank ?? null,
        rank_points: pvp.rank_points || 0,
        is_champion: !!pvp.is_champion,
        belt_defenses: pvp.belt_defenses || 0,
        ranks_from_challenge_zone,
        current_streak: pvp.current_streak || 0,
        best_streak: pvp.best_streak || 0,
        ko_rate,
        finish_rate,
        pvp_fame_lifetime: pvp.fame_lifetime || 0,
        bounty_on_head, // v1.2 — total open escrow on the viewer's head
        rivals_active,
    };

    // Revenge cards: ≤3 rivalries where the opp won last <72h ago AND is currently attackable.
    const rivResult = await getRivalries(viewerId, { limit: 50 });
    const revenge_cards = rivResult.rows
        .filter((r) => r.revenge_available)
        .slice(0, 3)
        .map((r) => ({
            fighterId: r.fighterId,
            name: r.name,
            ovr: r.ovr,
            style: r.style,
            last_method: r.last_method,
            last_fought_at: r.last_fought_at,
            attackable: r.attackable,
            block_reason: r.block_reason,
        }));

    const ticker = await getTicker(viewerId, { limit: 20 });
    const contracts = serializeContracts(pvp);

    return { identity, revenge_cards, ticker, contracts };
}

/**
 * §3.3 — claim a completed, unclaimed contract. Pays fame (counts the shared daily cap).
 * Atomic on the fighter doc via saveWithVersionRetry; re-validates on the fresh load to avoid
 * double-claim under a race.
 */
async function claimContract(fighterId, contractId) {
    if (!contractId || typeof contractId !== "string") {
        throw pvpError("Unknown contract.", "contract_not_found");
    }

    let outcome = null; // { fame, fame_after }
    await saveWithVersionRetry(
        () => Fighter.findById(fighterId),
        (fresh) => {
            if (!fresh) throw pvpError("Fighter not found", "fighter_not_found");
            ensureCircuitShape(fresh);
            ensureContractsState(fresh); // make sure a stale day's contract isn't claimed
            const pvp = fresh.pvp;

            let entry = null;
            let which = null;
            for (const w of ["daily", "weekly"]) {
                const found = (pvp.contracts?.[w] || []).find((c) => c.id === contractId);
                if (found) { entry = found; which = w; break; }
            }
            if (!entry) throw pvpError("Contract not found.", "contract_not_found");
            if (entry.claimed) throw pvpError("Contract already claimed.", "contract_already_claimed");
            if ((entry.progress || 0) < (entry.goal || 0)) throw pvpError("Contract not complete.", "contract_incomplete");

            const reward = PVP_CONTRACT_FAME[contractId] || 0;
            const headroom = fameHeadroom(fresh);
            if (reward > 0 && headroom <= 0) {
                throw pvpError("Daily PvP fame cap reached.", "contract_cap_reached");
            }
            notorietyService.ensureNotorietyShape(fresh);
            const granted = awardCappedPvpFame(fresh, reward, {
                code: "PVP_CONTRACT",
                reason: `Contract claimed: ${contractDef(which, contractId)?.label || contractId}`,
                meta: { contractId, which },
            });
            entry.claimed = true;
            fresh.markModified("pvp");
            outcome = { fame: granted, fame_after: fresh.notoriety.score };
        },
    );

    return {
        contractId,
        claimed: true,
        reward: { fame: outcome?.fame ?? 0 },
        fame_after: outcome?.fame_after ?? 0,
    };
}

/**
 * §3.4 — set the active cosmetic title (must be one the fighter has unlocked) or null to clear.
 */
async function setActiveTitle(fighterId, title) {
    if (title !== null && (typeof title !== "string" || !PVP_TITLES[title])) {
        throw pvpError("Invalid title.", "invalid_title");
    }

    let active = null;
    await saveWithVersionRetry(
        () => Fighter.findById(fighterId),
        (fresh) => {
            if (!fresh) throw pvpError("Fighter not found", "fighter_not_found");
            ensureCircuitShape(fresh);
            const owned = Array.isArray(fresh.pvp.titles) ? fresh.pvp.titles : [];
            if (title !== null && !owned.includes(title)) {
                throw pvpError("Invalid title.", "invalid_title");
            }
            fresh.pvp.active_title = title;
            fresh.markModified("pvp");
            active = title;
        },
    );

    return { active_title: active };
}

// ── §5 Batch bodies (driven by inline BullMQ jobs in modules/scheduler.js) ─────

/**
 * §5.1 — authoritative nightly ladder recompute. Sort all ranked fighters and rewrite
 * ladder_rank via bulkWrite (avoids a save storm). Set the #1 fighter as champion ONLY
 * if no champion currently exists — never silently reassign an existing belt.
 */
async function runLadderRecalcBatch() {
    const ranked = await Fighter.aggregate([
        { $match: { "pvp.total_fights": { $gte: PVP_ONBOARDING_FIGHTS } } },
        { $addFields: { _winPct: { $divide: [{ $ifNull: ["$pvp.wins", 0] }, { $max: [1, { $ifNull: ["$pvp.total_fights", 0] }] }] } } },
        { $sort: { "pvp.rank_points": -1, _winPct: -1, "pvp.last_pvp_fight_at": -1, _id: 1 } },
        { $project: { _id: 1 } },
    ]);

    if (ranked.length === 0) return { ranked: 0, championSeeded: false };

    const ops = ranked.map((row, i) => ({
        updateOne: {
            filter: { _id: row._id },
            update: { $set: { "pvp.ladder_rank": i + 1 } },
        },
    }));

    // Seed a champion only if the belt is currently vacant.
    const existingChampion = await Fighter.countDocuments({ "pvp.is_champion": true });
    let championSeeded = false;
    if (existingChampion === 0) {
        ops[0].updateOne.update.$set["pvp.is_champion"] = true;
        ops[0].updateOne.update.$set["pvp.belt_won_at"] = new Date();
        championSeeded = true;
    }

    // Chunk bulkWrite for safety on large ladders.
    const CHUNK = 500;
    for (let i = 0; i < ops.length; i += CHUNK) {
        try {
            await Fighter.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
        } catch (err) {
            console.error("[pvp-ladder-recalc] bulkWrite chunk failed:", err.message);
        }
    }

    return { ranked: ranked.length, championSeeded };
}

/**
 * §5.2 — nightly belt-decay/interim. Inactivity proxy = max(last_pvp_fight_at, updatedAt)
 * since there's no lastLogin. ≥21d → floor 20 + interim; ≥14d → floor 20; else floor 10.
 */
async function runBeltDecayBatch() {
    const champions = await Fighter.find({ "pvp.is_champion": true });
    let processed = 0;
    for (const champ of champions) {
        try {
            ensurePvpShape(champ);
            const activity = Math.max(
                champ.pvp.last_pvp_fight_at ? new Date(champ.pvp.last_pvp_fight_at).getTime() : 0,
                champ.updatedAt ? new Date(champ.updatedAt).getTime() : 0
            );
            const inactiveDays = activity > 0 ? Math.floor((Date.now() - activity) / DAY_MS) : 0;

            let floor = PVP_BELT_FLOOR_DEFAULT;
            let interim = false;
            if (inactiveDays >= PVP_BELT_DECAY_INTERIM_DAYS) {
                floor = PVP_BELT_FLOOR_WIDENED;
                interim = true;
            } else if (inactiveDays >= PVP_BELT_DECAY_WIDEN_DAYS) {
                floor = PVP_BELT_FLOOR_WIDENED;
                interim = false;
            }

            if (champ.pvp.belt_challenge_floor !== floor || champ.pvp.interim_booked !== interim) {
                // Re-apply ONLY the two computed decay fields onto a FRESH load each attempt so a
                // concurrent fight touching this champion (VersionError) doesn't get clobbered — and
                // so the retry can succeed. (util contract: loadFn loads fresh, mutateFn re-applies.)
                await saveWithVersionRetry(
                    () => Fighter.findById(champ._id),
                    (fresh) => {
                        ensurePvpShape(fresh);
                        fresh.pvp.belt_challenge_floor = floor;
                        fresh.pvp.interim_booked = interim;
                        fresh.markModified("pvp");
                    },
                );
            }
            processed += 1;
        } catch (err) {
            console.error("[pvp-belt-decay] champion failed:", String(champ._id), err.message);
        }
    }
    return { processed };
}

/**
 * §4 (v1.1) — nightly rivalry heat decay. Rivalries with heat>0 whose heat_last_decay_at is
 * older than the decay interval lose 1 heat per FULL elapsed week (floored at 0), and their
 * decay anchor is advanced. Chunked bulkWrite with a per-record try/catch so one bad row can't
 * sink the batch.
 */
async function runRivalryHeatDecayBatch() {
    const now = Date.now();
    const cutoff = new Date(now - PVP_RIVALRY_HEAT_DECAY_DAYS * DAY_MS);
    const weekMs = PVP_RIVALRY_HEAT_DECAY_DAYS * DAY_MS;

    const due = await Rivalry.find({
        heat: { $gt: 0 },
        $or: [
            { heat_last_decay_at: { $lte: cutoff } },
            { heat_last_decay_at: null },
        ],
    }).select("heat heat_last_decay_at last_fought_at createdAt").lean();

    if (due.length === 0) return { decayed: 0 };

    const ops = [];
    for (const riv of due) {
        try {
            const anchorRaw = riv.heat_last_decay_at || riv.last_fought_at || riv.createdAt;
            const anchor = anchorRaw ? new Date(anchorRaw).getTime() : now;
            const weeks = Math.floor((now - anchor) / weekMs);
            if (weeks <= 0) continue;
            const newHeat = Math.max(0, (riv.heat || 0) - weeks);
            // Advance the anchor by the consumed whole weeks so partial-week remainder is kept.
            const newAnchor = new Date(anchor + weeks * weekMs);
            ops.push({
                updateOne: {
                    filter: { _id: riv._id },
                    update: { $set: { heat: newHeat, heat_last_decay_at: newAnchor } },
                },
            });
        } catch (err) {
            console.error("[pvp-rivalry-heat-decay] row failed:", String(riv._id), err.message);
        }
    }

    let decayed = 0;
    const CHUNK = 500;
    for (let i = 0; i < ops.length; i += CHUNK) {
        try {
            const res = await Rivalry.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
            decayed += res.modifiedCount || 0;
        } catch (err) {
            console.error("[pvp-rivalry-heat-decay] bulkWrite chunk failed:", err.message);
        }
    }

    return { decayed };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The Circuit v1.2 — Seasons & Divisions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * §6.3 — band-based division for a pvp subdoc (contract Risk 4: NOT percentile/quota, so this is
 * O(1) and the rollover is a single bulkWrite). Champion's Circle is granted to anyone in the
 * top-`PVP_DIVISION_CHAMPIONS_RANK` ladder positions OR with rank_points ≥ its band min. Below
 * that, the highest band whose `min` the points clear wins. Unranked/empty → lowest band.
 */
function divisionFor(pvp) {
    const rp = pvp?.rank_points || 0;
    const rank = pvp?.ladder_rank;
    if (rank != null && rank <= PVP_DIVISION_CHAMPIONS_RANK) return "champions_circle";
    for (const band of PVP_DIVISION_BANDS) {
        if (rp >= band.min) return band.key;
    }
    return PVP_DIVISION_BANDS[PVP_DIVISION_BANDS.length - 1].key;
}

/** Label for a division key (for read payloads). */
function divisionLabel(key) {
    const band = PVP_DIVISION_BANDS.find((b) => b.key === key);
    return band ? band.label : null;
}

/**
 * Get the current `active` season, creating an initial one if none exists (defensive — app.js
 * also seeds on boot). Returns the lean season doc.
 */
async function getActiveSeason() {
    let season = await PvpSeason.findOne({ status: "active" }).sort({ season_number: -1 }).lean();
    if (!season) {
        season = await ensureSeasonSeeded();
    }
    return season;
}

/**
 * Seed an initial `active` season if the collection has none. Idempotent — a unique index on
 * season_number + the status filter mean a concurrent boot can't double-seed (the loser hits a
 * duplicate-key error which we swallow and re-read).
 */
async function ensureSeasonSeeded() {
    const existing = await PvpSeason.findOne({ status: "active" }).sort({ season_number: -1 }).lean();
    if (existing) return existing;
    const last = await PvpSeason.findOne({}).sort({ season_number: -1 }).lean();
    const nextNumber = (last?.season_number || 0) + 1;
    const starts = new Date();
    const ends = new Date(starts.getTime() + PVP_SEASON_LENGTH_DAYS * DAY_MS);
    try {
        const created = await PvpSeason.create({
            season_number: nextNumber,
            status: "active",
            starts_at: starts,
            ends_at: ends,
        });
        return created.toObject();
    } catch (err) {
        // Duplicate-key on a race — another boot won. Re-read the winner.
        const winner = await PvpSeason.findOne({ status: "active" }).sort({ season_number: -1 }).lean();
        if (winner) return winner;
        throw err;
    }
}

/**
 * §6.4 — nightly season rollover. NO-OP until `now >= active.ends_at`. When due:
 *   1. Capture the LIVE belt holder as champion_id + grant a `season_${n}_champion` flair title
 *      (the belt itself does NOT reset — it stays live fight-only).
 *   2. Soft-reset every ranked fighter: rank_points = floor(old × 0.6), season_start_points = new,
 *      recompute division — in ONE chunked `ordered:false` bulkWrite (Risk 5, scale-safe).
 *   3. Grant down-weighted, capped, DIVISION-GATED rewards (fame via applyNotorietyDelta +
 *      iron ≤Diamond) per-doc via saveWithVersionRetry. BOTS EXCLUDED from all grants.
 *   4. End the old season, create the next `active` season.
 * Idempotent: gated on the season-status flip (a re-run finds no `active` season due → no-op).
 */
async function runSeasonRolloverBatch(now = new Date()) {
    const active = await PvpSeason.findOne({ status: "active" }).sort({ season_number: -1 });
    if (!active) {
        // No active season — seed one and stop (nothing to roll over yet).
        await ensureSeasonSeeded();
        return { rolledOver: false, reason: "no_active_season_seeded" };
    }
    if (new Date(active.ends_at).getTime() > now.getTime()) {
        return { rolledOver: false, reason: "not_due" };
    }

    const seasonNumber = active.season_number;

    // 1. Capture the live champion (belt does NOT reset).
    const champion = await Fighter.findOne({ "pvp.is_champion": true }).select("_id isPvpBot").lean();
    const championId = champion ? champion._id : null;

    // 2. Soft-reset + division recompute for every ranked fighter via one chunked bulkWrite.
    const ranked = await Fighter.find({ "pvp.total_fights": { $gte: PVP_ONBOARDING_FIGHTS } })
        .select("pvp.rank_points pvp.ladder_rank isPvpBot").lean();

    const ops = [];
    // Reward bookkeeping (per-doc saveWithVersionRetry runs AFTER the bulkWrite). Bots excluded.
    const rewardTargets = [];
    for (const f of ranked) {
        const oldPoints = f.pvp?.rank_points || 0;
        const newPoints = Math.floor(oldPoints * PVP_SEASON_SOFT_RESET);
        // Division for the reward grant is computed on the PRE-reset standing (where they FINISHED
        // the season), so a finisher in Diamond is rewarded for Diamond even though the soft reset
        // may push their points into a lower band for next season.
        const finishDivision = divisionFor(f.pvp || {});
        const nextDivision = divisionFor({ rank_points: newPoints, ladder_rank: f.pvp?.ladder_rank });
        ops.push({
            updateOne: {
                filter: { _id: f._id },
                update: {
                    $set: {
                        "pvp.rank_points": newPoints,
                        "pvp.season_start_points": newPoints,
                        "pvp.division": nextDivision,
                    },
                },
            },
        });
        if (!f.isPvpBot) {
            rewardTargets.push({ id: f._id, division: finishDivision });
        }
    }

    const CHUNK = 500;
    for (let i = 0; i < ops.length; i += CHUNK) {
        try {
            await Fighter.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
        } catch (err) {
            console.error("[pvp-season-rollover] bulkWrite chunk failed:", err.message);
        }
    }

    // 3. Champion cosmetic + reward grants, per-doc (need a loaded doc for applyNotorietyDelta /
    //    iron credit). Idempotent on the season title — re-adding a held title is a no-op.
    const championTitle = `season_${seasonNumber}_champion`;
    if (championId && !(champion && champion.isPvpBot)) {
        try {
            await saveWithVersionRetry(
                () => Fighter.findById(championId),
                (fresh) => {
                    if (!fresh) return;
                    ensureCircuitShape(fresh);
                    if (!Array.isArray(fresh.pvp.season_titles)) fresh.pvp.season_titles = [];
                    if (!fresh.pvp.season_titles.includes(championTitle)) {
                        fresh.pvp.season_titles.push(championTitle);
                    }
                    fresh.markModified("pvp");
                },
            );
        } catch (err) {
            console.error("[pvp-season-rollover] champion title grant failed:", err.message);
        }
    }

    let rewarded = 0;
    for (const t of rewardTargets) {
        const fameAmt = PVP_SEASON_FAME[t.division] || 0;
        const ironAmt = PVP_SEASON_IRON[t.division] || 0;
        const flair = `season_${seasonNumber}_${t.division}`;
        if (fameAmt <= 0 && ironAmt <= 0) {
            // Bronze (or empty band) — flair title only, still record it.
        }
        try {
            await saveWithVersionRetry(
                () => Fighter.findById(t.id),
                (fresh) => {
                    if (!fresh) return;
                    ensureCircuitShape(fresh);
                    notorietyService.ensureNotorietyShape(fresh);
                    // Fame — down-weighted, charged against the shared daily cap (awardCappedPvpFame),
                    // so a rollover can't blow past the day's fame budget.
                    if (fameAmt > 0) {
                        awardCappedPvpFame(fresh, fameAmt, {
                            code: "PVP_SEASON_REWARD",
                            reason: `Season ${seasonNumber} ${divisionLabel(t.division)} finish`,
                            meta: { season: seasonNumber, division: t.division },
                        });
                    }
                    // Iron — small flat honorarium (≤ Diamond), capped by config. Net-new iron here is
                    // the ONLY season iron source; it's a tightly-capped ladder reward, not a sink.
                    if (ironAmt > 0) {
                        fresh.iron = (fresh.iron || 0) + ironAmt;
                    }
                    if (!Array.isArray(fresh.pvp.season_titles)) fresh.pvp.season_titles = [];
                    if (!fresh.pvp.season_titles.includes(flair)) {
                        fresh.pvp.season_titles.push(flair);
                    }
                    fresh.markModified("pvp");
                },
            );
            rewarded += 1;
        } catch (err) {
            console.error("[pvp-season-rollover] reward grant failed for", String(t.id), err.message);
        }
    }

    // 4. End old season + create next. The status flip is the idempotency gate.
    active.status = "ended";
    active.champion_id = championId;
    active.rolled_over_at = now;
    await active.save();

    const nextStarts = now;
    const nextEnds = new Date(nextStarts.getTime() + PVP_SEASON_LENGTH_DAYS * DAY_MS);
    let nextSeason;
    try {
        nextSeason = await PvpSeason.create({
            season_number: seasonNumber + 1,
            status: "active",
            starts_at: nextStarts,
            ends_at: nextEnds,
        });
    } catch (err) {
        // If a concurrent run already created the next season, swallow the duplicate-key.
        console.error("[pvp-season-rollover] next-season create failed (may already exist):", err.message);
        nextSeason = await PvpSeason.findOne({ status: "active" }).sort({ season_number: -1 });
    }

    return {
        rolledOver: true,
        season: seasonNumber,
        nextSeason: nextSeason?.season_number ?? seasonNumber + 1,
        championId: championId ? String(championId) : null,
        ranked: ranked.length,
        rewarded,
    };
}

/**
 * §6.5 — the viewer's season panel. Returns the active season, the viewer's current division, the
 * captured champion (from the MOST RECENT ended season), and — only the FIRST time after a
 * rollover (season_number_seen < that ended season's number) — the viewer's ended-season results.
 * Reading does NOT mark seen; the explicit POST /pvp/season/seen does (so the modal fires once).
 */
async function getSeason(viewerId) {
    const active = await getActiveSeason();
    const viewer = await Fighter.findById(viewerId).select("pvp firstName lastName nickname isPvpBot").lean();
    if (!viewer) throw pvpError("Fighter not found", "fighter_not_found");
    const pvp = viewer.pvp || {};
    const my_division = divisionFor(pvp);

    // Most recent ended season → its champion + the viewer's ended_results (once).
    const lastEnded = await PvpSeason.findOne({ status: "ended" }).sort({ season_number: -1 }).lean();
    let champion = null;
    let ended_results = null;
    if (lastEnded) {
        if (lastEnded.champion_id) {
            const champDoc = await Fighter.findById(lastEnded.champion_id)
                .select("firstName lastName nickname").lean();
            if (champDoc) {
                champion = { fighterId: String(champDoc._id), name: ladderRowName(champDoc) };
            }
        }
        const seen = pvp.season_number_seen || 0;
        if (seen < lastEnded.season_number) {
            // The viewer's season title for that season (flair/champion), used to read back rewards.
            const titles = Array.isArray(pvp.season_titles) ? pvp.season_titles : [];
            const championTitle = `season_${lastEnded.season_number}_champion`;
            const placement = titles.includes(championTitle) ? "champion" : null;
            // Reconstruct the awarded division from the flair title for that season, if present.
            let resultDivision = null;
            const prefix = `season_${lastEnded.season_number}_`;
            for (const t of titles) {
                if (t.startsWith(prefix) && t !== championTitle) {
                    resultDivision = t.slice(prefix.length);
                    break;
                }
            }
            ended_results = {
                division: resultDivision,
                rewards: {
                    fame: PVP_SEASON_FAME[resultDivision] || 0,
                    iron: PVP_SEASON_IRON[resultDivision] || 0,
                },
                placement,
            };
        }
    }

    return {
        season_number: active.season_number,
        ends_at: active.ends_at,
        starts_at: active.starts_at,
        my_division,
        my_division_label: divisionLabel(my_division),
        champion,
        ended_results,
    };
}

/**
 * §6.5 — mark the viewer as having seen the most-recent ended season's results so the
 * one-time results modal doesn't re-fire. Sets season_number_seen to the latest ended season
 * number (or the active season number − 1 if none ended yet, so it stays monotonic).
 */
async function markSeasonSeen(viewerId) {
    const lastEnded = await PvpSeason.findOne({ status: "ended" }).sort({ season_number: -1 }).lean();
    const target = lastEnded ? lastEnded.season_number : 0;
    let seen = 0;
    await saveWithVersionRetry(
        () => Fighter.findById(viewerId),
        (fresh) => {
            if (!fresh) throw pvpError("Fighter not found", "fighter_not_found");
            ensureCircuitShape(fresh);
            if ((fresh.pvp.season_number_seen || 0) < target) {
                fresh.pvp.season_number_seen = target;
                fresh.markModified("pvp");
            }
            seen = fresh.pvp.season_number_seen || 0;
        },
    );
    return { season_number_seen: seen };
}

// ═══════════════════════════════════════════════════════════════════════════════
// The Circuit v1.2 — Bounties (mirror mainEventService stake→debit→settle; NET IRON SINK)
// ═══════════════════════════════════════════════════════════════════════════════

/** Tier-based bounty ceiling = 1× the TARGET's promotion-tier signingFee (§7.2). */
function bountyMaxFor(targetFighter) {
    const tier = targetFighter.promotionTier || "Amateur";
    return (PROMOTION_TIERS[tier] || PROMOTION_TIERS.Amateur).signingFee || 0;
}

/**
 * §7.2 — post a bounty. Mirrors mainEventService.submitPrediction's stake→debit→save pattern:
 * validate, debit poster.iron in-memory, save once. The post burns 10% (sink) and escrows 90%
 * (the collectable payout). All validation throws a coded pvpError for the {message,code} envelope.
 *
 * @param {string} posterId   trusted from req.user.fighterId
 * @param {string} targetId
 * @param {number} amount     gross iron to stake
 * @param {string} methodRequired  "any" | "KO" | "Submission" | "Decision"
 */
async function postBounty(posterId, targetId, amount, methodRequired) {
    // 1. Self-bounty (cheapest).
    if (String(posterId) === String(targetId)) {
        throw pvpError("You cannot put a bounty on yourself.", "bounty_self");
    }

    // 2. Validate method.
    const method = methodRequired == null ? "any" : String(methodRequired);
    if (!["any", "KO", "Submission", "Decision"].includes(method)) {
        throw pvpError("Invalid bounty method.", "bounty_invalid_method");
    }

    // 3. Validate amount (hostile input — must be a positive integer).
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || !Number.isInteger(amt)) {
        throw pvpError("Bounty amount must be a positive integer.", "bounty_invalid_amount");
    }
    if (amt < PVP_BOUNTY_MIN) {
        throw pvpError(`Minimum bounty is ${PVP_BOUNTY_MIN} iron.`, "bounty_below_min");
    }

    const poster = await Fighter.findById(posterId);
    if (!poster) throw pvpError("Fighter not found", "fighter_not_found");
    const target = await Fighter.findById(targetId);
    if (!target) throw pvpError("Fighter not found", "fighter_not_found");

    ensureCircuitShape(poster);
    ensureCircuitShape(target);

    // 4. Posters must be real players (bots never post — Assumption 3).
    if (poster.isPvpBot) {
        throw pvpError("Bots cannot post bounties.", "bounty_forbidden");
    }

    // 5. Target must be on the ladder + currently attackable by SOMEONE (onboarding shield + the
    //    bracket/recovering reasons via blockReasonFor, but bracket is poster-vs-target here).
    if ((target.pvp?.total_fights || 0) < PVP_ONBOARDING_FIGHTS) {
        throw pvpError("This fighter isn't on the PvP ladder yet.", "target_not_attackable");
    }

    // 6. Tier-capped ceiling (§7.2: ≤ 1× target-tier signingFee).
    const maxAllowed = bountyMaxFor(target);
    if (amt > maxAllowed) {
        throw pvpError(`Maximum bounty on this fighter is ${maxAllowed} iron.`, "bounty_above_max");
    }

    // 7. One OPEN bounty per (poster, target) — duplicate guard.
    const dup = await Bounty.findOne({ poster_id: posterId, target_id: targetId, status: "open" }).lean();
    if (dup) {
        throw pvpError("You already have an open bounty on this fighter.", "bounty_duplicate");
    }

    // 8. Funds check + debit (mirror the mainEventService debit-then-save).
    const currentIron = poster.iron || 0;
    if (amt > currentIron) {
        throw pvpError("Not enough iron.", "insufficient_iron");
    }

    const escrow = Math.round(amt * PVP_BOUNTY_ESCROW);
    // The 10% burn = amt - escrow (rounding-safe — the difference is what's NOT escrowed).
    const expiresAt = new Date(Date.now() + PVP_BOUNTY_EXPIRY_DAYS * DAY_MS);

    poster.iron = currentIron - amt;
    await poster.save();

    let bounty;
    try {
        bounty = await Bounty.create({
            target_id: targetId,
            poster_id: posterId,
            amount_posted: amt,
            escrow_amount: escrow,
            method_required: method,
            status: "open",
            expires_at: expiresAt,
            posted_at: new Date(),
        });
    } catch (err) {
        // Create failed AFTER the debit — refund the poster so iron isn't lost to a DB error.
        try {
            await saveWithVersionRetry(
                () => Fighter.findById(posterId),
                (fresh) => { if (fresh) fresh.iron = (fresh.iron || 0) + amt; },
            );
        } catch (refundErr) {
            console.error("[pvp] bounty post refund failed:", refundErr.message);
        }
        throw err;
    }

    return {
        bountyId: String(bounty._id),
        target_id: String(targetId),
        amount_posted: amt,
        escrow_amount: escrow,
        burned: amt - escrow,
        expires_at: expiresAt,
        method_required: method,
        iron_after: poster.iron,
    };
}

/**
 * §7.3 — collect open bounties on the defender after an attacker WIN. Called from
 * processPvpResult BEFORE the snapshot capture (Risk 6: the iron credit lands on the in-memory
 * attacker.iron here, so a VersionError snapshot-retry re-applies the same value, never double-pays).
 *
 * For each open bounty on the defender whose method matches:
 *   - skip if poster === collector (can't collect your own bounty — §7.5);
 *   - apply anti-abuse §7.5: (poster,target,collector) triangle ≤ once / N days, and the
 *     diminishing multiplier on repeat head-to-head collection (remainder burned);
 *   - flip status open→collected via ATOMIC compare-and-set findOneAndUpdate; ONLY credit iron
 *     if the update flipped a doc (returns non-null);
 *   - credit attacker.iron += round(escrow × diminish); the burned remainder is simply not paid.
 *
 * Bumps attacker.pvp.bounties_collected + the weekly_collect_bounty contract on any successful
 * collect. Returns { count, total_iron, items:[{bountyId,poster_id,amount,method_required}] }.
 */
async function tryCollectBounties({ attacker, defender, method, pvpFightId, now }) {
    const collectorId = String(attacker._id);
    const targetId = String(defender._id);

    // Open bounties on this defender whose required method matches this fight's method.
    const open = await Bounty.find({
        target_id: defender._id,
        status: "open",
        $or: [{ method_required: "any" }, { method_required: method }],
    }).lean();

    if (!open.length) return { count: 0, total_iron: 0, items: [] };

    const triangleCutoff = new Date(now.getTime() - PVP_BOUNTY_TRIANGLE_DAYS * DAY_MS);
    let totalIron = 0;
    const items = [];

    for (const b of open) {
        const posterId = String(b.poster_id);
        // §7.5 — can't collect your own bounty.
        if (posterId === collectorId) continue;

        // §7.5 — (poster, target, collector) triangle: this exact trio may resolve ≤ once / N days.
        const recentTriangle = await Bounty.countDocuments({
            poster_id: b.poster_id,
            target_id: defender._id,
            collected_by: attacker._id,
            status: "collected",
            resolved_at: { $gte: triangleCutoff },
        });
        if (recentTriangle > 0) {
            // Triangle throttle hit — flip to collected with ZERO payout (escrow fully burned) so
            // the bounty doesn't linger for farming, but the collector gets nothing.
            await Bounty.findOneAndUpdate(
                { _id: b._id, status: "open" },
                { $set: { status: "collected", collected_by: attacker._id, collected_fight_id: pvpFightId, resolved_at: now } },
            );
            continue;
        }

        // §7.5 — diminishing multiplier on repeat head-to-head collection (how many times THIS
        // collector has already collected on THIS target before, within the window). Remainder burns.
        const priorHeadToHead = await Bounty.countDocuments({
            target_id: defender._id,
            collected_by: attacker._id,
            status: "collected",
            resolved_at: { $gte: triangleCutoff },
        });
        const dimIdx = Math.min(Math.max(0, priorHeadToHead), PVP_BOUNTY_DIMINISH.length - 1);
        const diminish = PVP_BOUNTY_DIMINISH[dimIdx];
        const payout = Math.round((b.escrow_amount || 0) * diminish);

        // ATOMIC compare-and-set: only ONE concurrent resolution can flip open→collected (Risk 6).
        const flipped = await Bounty.findOneAndUpdate(
            { _id: b._id, status: "open" },
            { $set: { status: "collected", collected_by: attacker._id, collected_fight_id: pvpFightId, resolved_at: now } },
            { new: true }
        );
        if (!flipped) continue; // lost the race — another resolution already collected it.

        // Credit ONLY on a successful flip, to the IN-MEMORY attacker.iron BEFORE snapshot capture.
        if (payout > 0) {
            attacker.iron = (attacker.iron || 0) + payout;
            totalIron += payout;
        }
        items.push({
            bountyId: String(b._id),
            poster_id: posterId,
            amount: payout,
            method_required: b.method_required,
        });
    }

    if (items.length > 0) {
        attacker.pvp.bounties_collected = (attacker.pvp.bounties_collected || 0) + items.length;
        // weekly_collect_bounty contract progress (attacker is the collector).
        ensureContractsState(attacker);
        bumpContract(attacker.pvp, "weekly", "weekly_collect_bounty", items.length);
        // iron_collector title may now unlock — evaluateTitles is idempotent (run by the caller's
        // title pass earlier this fight, but bounties_collected changed AFTER that pass, so re-run).
        const newTitles = evaluateTitles(attacker.pvp);
        for (const key of newTitles) {
            awardCappedPvpFame(attacker, PVP_TITLE_FAME, {
                code: "PVP_TITLE_UNLOCK",
                reason: `Unlocked title: ${PVP_TITLES[key]?.label || key}`,
                meta: { title: key },
            });
        }
    }

    return { count: items.length, total_iron: totalIron, items };
}

/**
 * §7.4 — nightly bounty expiry. Open bounties past expires_at are refunded 80% of escrow to the
 * poster (20% burned), status→refunded. The poster credit goes through saveWithVersionRetry (a
 * concurrent fight could be touching the poster doc). Per-bounty try/catch so one bad row can't
 * sink the batch. Each bounty is flipped via atomic compare-and-set so a concurrent collection
 * can't be double-resolved.
 */
async function runBountyExpiryBatch(now = new Date()) {
    const due = await Bounty.find({ status: "open", expires_at: { $lte: now } }).lean();
    if (!due.length) return { expired: 0, refunded_iron: 0 };

    let expired = 0;
    let refundedIron = 0;
    for (const b of due) {
        try {
            const refund = Math.round((b.escrow_amount || 0) * PVP_BOUNTY_REFUND_FRAC);
            // Flip open→refunded atomically; if it was already collected, skip the refund entirely.
            const flipped = await Bounty.findOneAndUpdate(
                { _id: b._id, status: "open" },
                { $set: { status: "refunded", resolved_at: now } },
                { new: true }
            );
            if (!flipped) continue;
            if (refund > 0) {
                await saveWithVersionRetry(
                    () => Fighter.findById(b.poster_id),
                    (fresh) => { if (fresh) fresh.iron = (fresh.iron || 0) + refund; },
                );
                refundedIron += refund;
            }
            expired += 1;
        } catch (err) {
            console.error("[pvp-bounty-expiry] row failed:", String(b._id), err.message);
        }
    }

    return { expired, refunded_iron: refundedIron };
}

/**
 * §7.6 — read bounties for a viewer. scope:
 *   - "collectable": open bounties on OTHER fighters the viewer can attack (filtered by
 *     blockReasonFor), excluding the viewer's own posts;
 *   - "posted": the viewer's posted bounties (any status), newest first;
 *   - "on_me": open bounties on the VIEWER's head.
 */
async function getBounties(viewerId, scope = "collectable") {
    const now = new Date();
    const safeScope = ["collectable", "posted", "on_me"].includes(scope) ? scope : "collectable";

    const viewer = await Fighter.findById(viewerId).select("overallRating pvp").lean();
    if (!viewer) throw pvpError("Fighter not found", "fighter_not_found");

    let bounties;
    if (safeScope === "posted") {
        bounties = await Bounty.find({ poster_id: viewerId }).sort({ posted_at: -1 }).limit(100).lean();
    } else if (safeScope === "on_me") {
        bounties = await Bounty.find({ target_id: viewerId, status: "open" }).sort({ posted_at: -1 }).limit(100).lean();
    } else {
        // collectable — open, not posted by the viewer, not on the viewer.
        bounties = await Bounty.find({
            status: "open",
            poster_id: { $ne: viewerId },
            target_id: { $ne: viewerId },
        }).sort({ posted_at: -1 }).limit(100).lean();
    }

    // Batch-resolve target + poster names (+ target standing for collectable attackability).
    const ids = new Set();
    for (const b of bounties) { ids.add(String(b.target_id)); ids.add(String(b.poster_id)); }
    const people = await Fighter.find({ _id: { $in: [...ids] } })
        .select("firstName lastName nickname style overallRating pvp").lean();
    const byId = new Map(people.map((p) => [String(p._id), p]));

    const rows = [];
    for (const b of bounties) {
        const target = byId.get(String(b.target_id));
        const poster = byId.get(String(b.poster_id));

        let block = null;
        if (safeScope === "collectable") {
            block = target ? blockReasonFor(viewer, target, now) : "fighter_not_found";
            // collectable rows are gated to attackable targets only.
            if (block !== null) continue;
        }

        rows.push({
            bountyId: String(b._id),
            target: target
                ? { fighterId: String(b.target_id), name: ladderRowName(target), ovr: target.overallRating || 0, style: target.style || null }
                : { fighterId: String(b.target_id), name: "Unknown", ovr: 0, style: null },
            poster: poster
                ? { fighterId: String(b.poster_id), name: ladderRowName(poster) }
                : { fighterId: String(b.poster_id), name: "Unknown" },
            amount_posted: b.amount_posted || 0,
            escrow_amount: b.escrow_amount || 0,
            method_required: b.method_required || "any",
            status: b.status,
            expires_at: b.expires_at || null,
            posted_at: b.posted_at || null,
            collected_by: b.collected_by ? String(b.collected_by) : null,
            attackable: safeScope === "collectable" ? (block === null) : undefined,
            block_reason: safeScope === "collectable" ? block : undefined,
        });
    }

    return { scope: safeScope, rows };
}

module.exports = {
    gapFactor,
    isPremium,
    defaultPvp,
    ensurePvpDailyState,
    ensureContractsState,
    initiatePvpAttack,
    processPvpResult,
    repositionTwoOnLadder,
    getLadder,
    getPvpProfile,
    getHistory,
    getPending,
    markPendingSeen,
    getRivalries,
    getTicker,
    getPvpHub,
    claimContract,
    setActiveTitle,
    evaluateTitles,
    runLadderRecalcBatch,
    runBeltDecayBatch,
    runRivalryHeatDecayBatch,
    // The Circuit v1.2 — Seasons & Divisions
    divisionFor,
    divisionLabel,
    getActiveSeason,
    ensureSeasonSeeded,
    runSeasonRolloverBatch,
    getSeason,
    markSeasonSeen,
    // The Circuit v1.2 — Bounties
    postBounty,
    tryCollectBounties,
    runBountyExpiryBatch,
    getBounties,
};
