/**
 * Home Camp ("My Camp") — camp lifecycle, gym→camp conversion, condition, state building.
 *
 * NAMING: `camp*` on the backend means the FIGHT camp (services/campService.js, GDD §9).
 * Everything here is the player's HOME camp and carries the `homeCamp` prefix.
 *
 * OWNS (single home — nothing below may be reimplemented elsewhere):
 *   ensureCamp · deriveInitialCampState · buildCampState · renameCamp · buildNeeds
 *   condition: conditionBand · applySessionConditionDelta · applyIdleNeglect · runConditionDecayBatch
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SHARED TYPES (contract §5.2). The frontend reads THESE — it must never import
 * consts/homeCampConfig.js. Every number the UI renders arrives in these shapes.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @typedef {Object} Drill
 * @property {string}   key
 * @property {string}   name
 * @property {boolean}  locked
 * @property {number}   unlockRank
 * @property {number}  [energy]        omitted when locked
 * @property {string[]}[stats]         omitted when locked
 * @property {number}  [injuryPct]     integer 0–100
 * @property {number}  [dropPct]       integer 0–100
 * @property {number}  [condDelta]     signed condition points per session
 * @property {boolean} [isFlagship]
 * @property {string}  [family]        "spar" | "bag" | "none" — presentation hint (card stripe)
 * @property {boolean} [canTrain]
 * @property {?string} [blockedReason] injury label + effect when canTrain is false
 *
 * @typedef {Object} Coach
 * @property {string}  coachId
 * @property {string}  name
 * @property {string}  initials
 * @property {"COMMON"|"UNCOMMON"|"RARE"|"LEGENDARY"} rarity
 * @property {"STRIKING"|"WRESTLING"|"BJJ"|"CONDITIONING"} archetype
 * @property {string}  archetypeLabel
 * @property {boolean} isStarter
 * @property {number}  wage
 * @property {string}  tenureLabel
 * @property {?Object} trait                     PHASE 1 — {key,name,desc,caution}
 * @property {number}  rank
 * @property {number}  maxRank
 * @property {{value:number,label:string,tone:string,note:string}} morale
 * @property {string[]} rankLabels               always 4 — Development Track captions, index 0 = rank 1.
 *                                               Describes what EACH rank grants THIS coach
 *                                               ("Joined your camp" / "Unlocks Grind-It-Out Rounds" /
 *                                               "+5% training XP · Unlocks Mat Return Repetition" /
 *                                               "Mat Returns perk"), not generic rank titles.
 * @property {?{rank:number,ready:boolean,reqsMet:boolean,reqs:Array<{key:string,label:string,cur:number,tgt:number}>,cost:number,costBase:number,canAfford:boolean,grants:string}} nextRank
 * @property {?{key:string,name:string,effect:string,held:boolean,claimable:boolean}} perk
 *                                               The archetype's rank-4 perk, or null when the
 *                                               archetype has none. `held` = already in
 *                                               fighter.gymPerks; `claimable` = rank 4 reached
 *                                               but not held yet (the gym→camp migration case)
 *                                               → POST /coaches/:coachId/claim-perk, free.
 *                                               At max rank `nextRank` is null, so this object
 *                                               is the ONLY truthful thing to render there.
 * @property {Array<{moveId:string,name:string,rarity:string,state:"taught"|"next"|"locked",rankReq:number}>} teaches
 * @property {Drill[]} drills                    always 4, kit order
 *
 * @typedef {Object} Need
 * @property {"COACH_PROMOTE_READY"|"CONDITION_LOW"|"COACH_MORALE_LOW"|"MARKET_RESET"} type
 * @property {"gold"|"amber"|"warn"|"blue"} tone
 * @property {"star"|"frown"|"warning"|"search"} icon
 * @property {string}  title
 * @property {string}  subtitle
 * @property {string}  ctaLabel
 * @property {?string} targetCoachId
 *
 * @typedef {Object} CampState
 * @property {{campId:string,name:string,tier:number,tierLabel:string,focusDomain:string,focusLabel:string,renovation:{available:boolean,nextTier:?number,cost:?number,requirements:Array,ready:boolean}}} camp
 * @property {{value:number,max:number,band:string,bandLabel:string,xpMultiplier:number,penaltyStartsAt:number,explainer:string}} condition
 * @property {{weeklyTotal:number,nextDebitAt:?string,nextDebitInDays:?number}} wages
 * @property {{unlocked:number,max:number,nextUnlocksAt:?string}} slots
 * @property {Coach[]} coaches
 * @property {Drill & {xpMultiplier:number}} fallbackSession
 * @property {{open:boolean,candidateCount:number,resetsAt:?string,reason:string}} market
 * @property {Need[]}  needs
 *
 * @typedef {Object} CampTrainResult
 * Superset of trainingService.doTraining's return (minus `rankUp` — camp promotions are
 * always explicit) plus: condition{before,after,delta,band,bandLabel,xpMultiplier},
 * coach{coachId,name,sessionsCompleted,rank,promoteReadyNow}, campXpMultiplier.
 */
const HomeCamp = require("../models/homeCampModel");
const Fighter = require("../models/fighterModel");
const coachService = require("./homeCampCoachService");
const personaService = require("./personaService");
const saveWithVersionRetry = require("../utils/saveWithVersionRetry");
const { assertCleanName } = require("../utils/profanity");
const { isSparringBlocked, isBagWorkBlocked } = require("../utils/injuryUtils");
const {
    CAMP_TIERS,
    MAX_CAMP_TIER,
    NEXT_SLOT_UNLOCK_TIER,
    effectiveTier,
    COACH_ARCHETYPES,
    CONDITION_MAX,
    CONDITION_PENALTY_STARTS_AT,
    CONDITION_EXPLAINER,
    CONDITION_NEED_THRESHOLD,
    CONDITION_DOUBLE_DECAY_BELOW,
    CONDITION_UNPAID_PER_WEEK,
    CONDITION_UNPAID_MAX_MULT,
    NEGLECT_PER_IDLE_DAY,
    NEGLECT_MAX_CATCHUP_DAYS,
    MAX_COACHES,
    STYLE_TO_DOMAIN,
    DEFAULT_DOMAIN,
    GYM_SLUG_TO_DOMAIN,
    COACH_RANKS,
    CAMP_NAME_MIN,
    CAMP_NAME_MAX,
    DEEP_CLEAN_COST,
    DEEP_CLEAN_GAIN,
    MARKET_CANDIDATES,
    MARKET_MIN_TIER,
    MAX_WEEKLY_CATCHUP,
    MORALE_MAX,
    MORALE_NEED_THRESHOLD,
    MORALE_QUIT_AT,
    MORALE_UNUSED_SESSIONS,
    MORALE_WAGE_UNPAID,
    MORALE_XP_HALVED_BELOW,
    RENOVATIONS,
    conditionBandFor,
    fallbackDrill,
    homeCampWeekIndex,
    homeCampWeekStart,
    homeCampWeekEnd,
    renovationFor,
    traitDef,
    utcDayKey,
} = require("../consts/homeCampConfig");

const { campError } = coachService;

// ── Condition — THE single home ───────────────────────────────────────────────

/** Band descriptor for a raw condition value. */
function conditionBand(value) {
    return conditionBandFor(value);
}

/** Whole UTC days between two "YYYY-MM-DD" keys (b - a). Returns 0 for bad input. */
function dayKeyDiff(aKey, bKey) {
    const a = Date.parse(`${aKey}T00:00:00.000Z`);
    const b = Date.parse(`${bKey}T00:00:00.000Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.round((b - a) / 86_400_000);
}

/** Shift a "YYYY-MM-DD" key by n days. */
function shiftDayKey(key, n) {
    const t = Date.parse(`${key}T00:00:00.000Z`);
    if (Number.isNaN(t)) return key;
    return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Apply neglect decay for every COMPLETED UTC day since the last tick.
 *
 * IDEMPOTENCY (the whole point): the processed window is
 *   [condition.lastNeglectDayKey, todayKey)   — inclusive start, EXCLUSIVE today
 * and the key is advanced to todayKey afterwards. So:
 *   · running this five times in one day applies the decay ONCE (window is empty after
 *     the first run), which is what makes the daily job + the lazy read tick safe to
 *     both exist;
 *   · today is never charged before it has ended;
 *   · no completed day is ever skipped or double-charged, because the window's start is
 *     exactly where the previous run stopped.
 * A day equal to `condition.lastSessionDayKey` is skipped — you trained that day.
 * The catch-up is capped at NEGLECT_MAX_CATCHUP_DAYS so a returning player isn't nuked.
 *
 * MUTATES the camp doc; the CALLER saves. Returns what happened.
 * @returns {{decayedDays:number, points:number, before:number, after:number, changed:boolean}}
 */
function applyIdleNeglect(camp, now = new Date()) {
    const before = Number(camp.condition?.value ?? CONDITION_MAX);
    const today = utcDayKey(now);
    const last = camp.condition?.lastNeglectDayKey;

    // First sight (new doc / legacy doc with no key): anchor to today, never retro-decay.
    if (!last) {
        camp.condition.lastNeglectDayKey = today;
        camp.condition.lastNeglectAt = now;
        return { decayedDays: 0, points: 0, before, after: before, changed: true };
    }

    const diff = dayKeyDiff(last, today);
    if (diff <= 0) {
        return { decayedDays: 0, points: 0, before, after: before, changed: false };
    }

    const windowDays = Math.min(diff, NEGLECT_MAX_CATCHUP_DAYS);
    const windowStart = shiftDayKey(today, -windowDays);   // inclusive
    const sessionKey = camp.condition?.lastSessionDayKey || null;
    const sessionInWindow = !!sessionKey && sessionKey >= windowStart && sessionKey < today;
    const idleDays = Math.max(0, windowDays - (sessionInWindow ? 1 : 0));
    const points = idleDays * NEGLECT_PER_IDLE_DAY;

    const after = Math.max(0, Math.min(CONDITION_MAX, before - points));
    camp.condition.value = after;
    camp.condition.lastNeglectDayKey = today;
    camp.condition.lastNeglectAt = now;
    return { decayedDays: idleDays, points, before, after, changed: true };
}

/**
 * Apply a training session's condition delta and stamp today as a session day (which
 * suppresses neglect for today). MUTATES; the CALLER saves.
 * @returns {{before:number, after:number, delta:number}}
 */
function applySessionConditionDelta(camp, delta, now = new Date()) {
    const before = Number(camp.condition?.value ?? CONDITION_MAX);
    const after = Math.max(0, Math.min(CONDITION_MAX, before + (Number(delta) || 0)));
    camp.condition.value = after;
    camp.condition.lastSessionDayKey = utcDayKey(now);
    return { before, after, delta: after - before };
}

// ── Migration (D2) — the conversion IS the constructor ───────────────────────

/** Own-property test — NEVER use `in` on a map keyed by untrusted strings. */
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const toInt = (v) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : 0;
};
const clampRank = (v) => Math.max(1, Math.min(MAX_CAMP_TIER, toInt(v) || 1));

/**
 * Derive a brand-new camp's full state from a fighter's EXISTING gym history.
 *
 * ⚠️ THIS FUNCTION WRITES NOTHING TO THE FIGHTER DOCUMENT. It only READS gymRanks /
 * activeGymId / style / lastName. That property is the entire safety story for rolling this
 * out to live players: the camp is purely additive, so `db.homecamps.drop()` is a total and
 * lossless rollback, and no badge evaluator or gym perk can be affected. If a later phase
 * ever writes back to the fighter here, that guarantee is VOID and must be called out.
 *
 * Never lowers anything: the max(...) floors below guarantee a migrated coach is never below
 * his own rank's requirements, and any future conversionVersion re-run may only RAISE values.
 *
 * @param {object} fighter Fighter document (read-only)
 * @param {object} [gymSlugById] optional {gymId: slug} map so an activeGymId can be matched
 * @returns {object} a plain object ready for HomeCamp.create()
 */
function deriveInitialCampState(fighter, gymSlugById = {}) {
    const now = new Date();

    // 1. Convertible gym history only: known slugs with a real domain.
    //    gymRanks is a Mixed field, so its keys are untrusted — `hasOwn` (never `in`) keeps
    //    "__proto__" / "constructor" / "toString" from resolving through Object.prototype
    //    and smuggling a non-archetype value into focusDomain.
    const entries = Object.entries(fighter.gymRanks || {})
        .filter(([slug]) => hasOwn(GYM_SLUG_TO_DOMAIN, slug) && GYM_SLUG_TO_DOMAIN[slug] !== null)
        .map(([slug, p]) => ({
            slug,
            domain: GYM_SLUG_TO_DOMAIN[slug],
            rank: clampRank(p && p.rank),
            sessions: Math.max(0, toInt(p && p.trainingSessions)),
            wins: Math.max(0, toInt(p && p.relevantWins)),
        }));

    // 2. Head coach — the active gym wins, else the highest rank (ties → most sessions).
    let head = null;
    const activeSlug = fighter.activeGymId ? gymSlugById[String(fighter.activeGymId)] : null;
    if (activeSlug) head = entries.find((e) => e.slug === activeSlug) || null;
    if (!head && entries.length > 0) {
        head = entries.slice().sort((a, b) => (b.rank - a.rank) || (b.sessions - a.sessions))[0];
    }

    // 3. Focus domain. A null-mapped gym (elite-fight-academy trains all 8 stats) never
    //    reaches here, so an all-rounder can't hand a BJJ specialist a striking coach.
    //    `fighter.style` is enum-constrained today, but the hasOwn guard + archetype check
    //    mean a legacy/unknown style can only ever fall back, never produce a junk domain.
    const styleDomain = hasOwn(STYLE_TO_DOMAIN, fighter.style) ? STYLE_TO_DOMAIN[fighter.style] : null;
    const candidate = head ? head.domain : styleDomain;
    const focusDomain = COACH_ARCHETYPES[candidate] ? candidate : DEFAULT_DOMAIN;

    // 4. Starter coach — floors guarantee he is never BELOW his own rank's requirements.
    const rank = head ? head.rank : 1;
    const rankDef = COACH_RANKS[rank] || null;
    const starter = coachService.createStarterCoach(focusDomain, {
        rank,
        sessionsCompleted: head ? Math.max(head.sessions, rankDef ? rankDef.sessions : 0) : 0,
        relevantWins: head ? Math.max(head.wins, rankDef ? rankDef.wins : 0) : 0,
    });

    // ⚠️ DO NOT "FIX" THIS: a coach migrated in at rank 4 is NOT granted the archetype's
    // rank-4 perk HERE, even though promoting a coach TO rank 4 does grant it
    // (homeCampCoachService.attemptPromotion). That asymmetry is deliberate — and it is no
    // longer a dead end:
    //
    // WHERE THE PERK IS DELIVERED: homeCampCoachService.claimCoachPerk, behind
    // POST /home-camp/:fighterId/coaches/:coachId/claim-perk. The camp payload marks the perk
    // `claimable` on any coach at rank 4 that doesn't hold it (Coach.perk), and the player
    // claims it in one explicit, free click. A migrated veteran therefore loses nothing; the
    // grant simply happens in a POST the player initiated, not in this constructor.
    //
    // WHY THIS FUNCTION STILL MUST NOT WRITE IT: granting means pushing onto
    // `fighter.gymPerks` — a WRITE TO THE FIGHTER DOCUMENT — and this function runs lazily
    // inside a normal GET (ensureCamp). Writing nothing to the fighter is the entire reason
    // the rollout is safe: the feature stays purely additive, `db.homecamps.drop()` is a total
    // and lossless rollback, and no badge evaluator or live gym perk can be affected (§6.3).
    // It also keeps §6.5.4 true — a camp read can never collide with a concurrent fighter
    // write and lose an update on `fighter.iron`. Add a fighter write here and both
    // guarantees are VOID.
    //
    // So: the perk is owed and IS delivered — just never by a read.

    // 5. Discipline familiarity — the "trainer-XP credit" half of the conversion. Every gym
    //    EXCEPT the head coach's banks its progress for a Phase-1 hire in that domain.
    const disciplineFamiliarity = {};
    for (const e of entries) {
        if (head && e.slug === head.slug) continue;
        if (!disciplineFamiliarity[e.domain]) disciplineFamiliarity[e.domain] = { bankedSessions: 0, bankedWins: 0 };
        disciplineFamiliarity[e.domain].bankedSessions += e.sessions;
        disciplineFamiliarity[e.domain].bankedWins += e.wins;
    }

    const lastName = String(fighter.lastName || "").trim() || "Fighter";
    const rawName = `${lastName} Camp`;
    const name = rawName.length > CAMP_NAME_MAX ? rawName.slice(0, CAMP_NAME_MAX).trim() : rawName;

    return {
        fighterId: fighter._id,
        name,
        focusDomain,
        tier: 1,                       // effectiveTier floors this by promotion tier immediately
        condition: {
            value: CONDITION_MAX,
            lastNeglectAt: now,
            // Migrated players are NOT retro-decayed for the days before their camp existed.
            lastNeglectDayKey: utcDayKey(now),
            lastSessionDayKey: null,
        },
        coaches: [starter],
        market: { weekIndex: -1, candidates: [], slotCooldownUntil: null },
        disciplineFamiliarity,
        lastWeeklyTickIndex: -1,
        nextWageDebitAt: null,
        origin: {
            source: head ? "GYM_MIGRATION" : "NEW",
            sourceGymSlug: head ? head.slug : null,
            convertedAt: now,
            conversionVersion: 1,
        },
    };
}

/** Lazily build {gymId: slug} so deriveInitialCampState can match fighter.activeGymId. */
async function loadGymSlugMap() {
    try {
        const Gym = require("../models/gymModel");
        const gyms = await Gym.find({}).select("_id slug").lean();
        const map = {};
        for (const g of gyms) map[String(g._id)] = g.slug;
        return map;
    } catch (e) {
        // A missing gym collection must not block camp creation — it only costs the
        // "active gym wins" tie-break, and the highest-rank fallback still applies.
        console.error("[homeCamp] gym slug map load failed:", e.message);
        return {};
    }
}

/**
 * Get (or lazily create) a fighter's camp, applying the idle-neglect tick on every read.
 *
 * The unique index on fighterId is the concurrency guard: two simultaneous first-reads race,
 * the loser gets E11000, catches, and re-reads. NEVER writes the fighter document.
 *
 * @param {object} fighter Fighter document
 * @returns {Promise<object>} HomeCamp document
 */
async function ensureCamp(fighter) {
    if (!fighter || !fighter._id) throw campError("fighter_not_found", "Fighter not found", 404);

    let camp = await HomeCamp.findOne({ fighterId: fighter._id });
    if (!camp) {
        const state = deriveInitialCampState(fighter, await loadGymSlugMap());
        try {
            camp = await HomeCamp.create(state);
        } catch (err) {
            if (err && err.code === 11000) {
                camp = await HomeCamp.findOne({ fighterId: fighter._id });
            }
            if (!camp) throw err;
        }
    }

    const tick = applyIdleNeglect(camp);
    if (tick.changed) await camp.save();
    return camp;
}

// ── Rename (§3.2) ────────────────────────────────────────────────────────────

// Control characters (incl. DEL) — rejected outright rather than stripped so a name of
// pure control chars can't slip past the length check as an empty string.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Validate + apply a camp rename. Assumes HOSTILE input: type-checked, trimmed,
 * length-bounded, control-char rejected, profanity-gated. No uniqueness, no cooldown.
 * @returns {Promise<{camp:{campId:string,name:string}}>}
 */
async function renameCamp(fighterId, rawName) {
    if (typeof rawName !== "string") throw campError("name_required", "Camp name is required", 400);
    const name = rawName.trim();
    if (name.length === 0) throw campError("name_required", "Camp name is required", 400);
    if (CONTROL_CHARS.test(name)) {
        throw campError("name_length", `Camp name must be ${CAMP_NAME_MIN}–${CAMP_NAME_MAX} characters`, 400);
    }
    if (name.length < CAMP_NAME_MIN || name.length > CAMP_NAME_MAX) {
        throw campError("name_length", `Camp name must be ${CAMP_NAME_MIN}–${CAMP_NAME_MAX} characters`, 400);
    }
    try {
        assertCleanName(name, "Camp name");
    } catch (e) {
        throw campError("name_profanity", e.message, 400);
    }

    const camp = await HomeCamp.findOne({ fighterId });
    if (!camp) throw campError("camp_not_found", "Camp not found", 404);
    camp.name = name;
    await camp.save();
    return { camp: { campId: String(camp._id), name: camp.name } };
}

// ── Injury blocks — resolved ONCE per request ────────────────────────────────

/**
 * The injury-block answer for each drill family, resolved once and shared by every drill card
 * in the response (roster coaches, market candidates and the open mat). Resolving it per card
 * would ask the same question a dozen times and risk two cards disagreeing mid-request.
 * @returns {{spar:object|null, bag:object|null, none:null}}
 */
function resolveInjuryBlocks(fighter) {
    return { spar: isSparringBlocked(fighter), bag: isBagWorkBlocked(fighter), none: null };
}

// ── Renovation (§3.5) ────────────────────────────────────────────────────────

/**
 * Quote the camp's next renovation, or null when there is nothing to buy.
 *
 * AVAILABILITY RULE: only when the STORED tier equals the EFFECTIVE tier. A Regional Pro's
 * camp already runs at Tier 3 by promotion floor while `camp.tier` is still 1 — selling them a
 * "Tier 2 renovation" would take $2,000 for literally nothing.
 *
 * Cost is persona-adjusted through the SAME helper shape as promotionQuote, so the price on
 * the card is the price in the debit.
 *
 * @returns {{nextTier:number, cost:number, costBase:number, wins:number, grants:string}|null}
 */
function renovationQuote(camp, fighter) {
    const stored = Math.min(MAX_CAMP_TIER, Math.max(1, Number(camp.tier) || 1));
    if (stored !== effectiveTier(camp, fighter)) return null;
    const nextTier = stored + 1;
    const def = renovationFor(nextTier);
    if (!def) return null;
    const frac = personaService.getModifiers(fighter).gymRankCostFrac || 0;
    const cost = def.cost > 0 ? Math.round(def.cost * (1 + frac)) : def.cost;
    return { nextTier, cost, costBase: def.cost, wins: def.wins, grants: def.grants };
}

/** The renovation block of CampState. Always the same shape, available or not. */
function buildRenovationView(camp, fighter) {
    const quote = renovationQuote(camp, fighter);
    if (!quote) {
        return {
            available: false, nextTier: null, cost: null, costBase: null,
            requirements: [], reqsMet: false, canAfford: false, ready: false, grants: null,
        };
    }
    const wins = Number(fighter.record?.wins) || 0;
    const requirements = [{ key: "wins", label: "Career wins", cur: wins, tgt: quote.wins }];
    const reqsMet = wins >= quote.wins;
    const canAfford = (fighter.iron ?? 0) >= quote.cost;
    return {
        available: true,
        nextTier: quote.nextTier,
        cost: quote.cost,
        costBase: quote.costBase,
        requirements,
        reqsMet,
        canAfford,
        ready: reqsMet && canAfford,
        grants: quote.grants,
    };
}

/**
 * POST /renovate. Pays to raise the STORED tier by one.
 *
 * DOUBLE-CLICK SAFETY, same shape as attemptPromotion: the tier bump is a conditional
 * updateOne matched on the CURRENT tier (the mutex), and cash is only deducted after that
 * write wins. A failed payment rolls the tier back, so there is no free renovation.
 *
 * @returns {Promise<{renovation:object, fighter:object, camp:object}>}
 */
async function renovateCamp(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    const camp = await HomeCamp.findOne({ fighterId: fighter._id });
    if (!camp) throw campError("camp_not_found", "Camp not found", 404);

    const stored = Math.min(MAX_CAMP_TIER, Math.max(1, Number(camp.tier) || 1));
    if (stored >= MAX_CAMP_TIER || !renovationFor(stored + 1)) {
        throw campError("max_tier", "Your camp is already fully built out", 400);
    }
    if (stored !== effectiveTier(camp, fighter)) {
        // Their promotion tier already grants more than this renovation would.
        throw campError("renovation_unavailable", "Your camp already runs above this tier", 400);
    }

    const quote = renovationQuote(camp, fighter);
    if (!quote) throw campError("renovation_unavailable", "There is nothing to renovate right now", 400);

    const wins = Number(fighter.record?.wins) || 0;
    const reqs = [{ key: "wins", label: "Career wins", cur: wins, tgt: quote.wins }];
    if (wins < quote.wins) {
        throw campError("requirements_not_met", "Your camp isn't ready for this renovation yet", 400, { reqs });
    }

    const cost = quote.cost;
    const have = fighter.iron ?? 0;
    if (have < cost) throw campError("insufficient_cash", "Not enough cash for this renovation", 400, { cost, have });

    // ── Mutex: raise the tier only if it is still exactly `stored`. ──
    const res = await HomeCamp.updateOne(
        { _id: camp._id, tier: stored },
        { $set: { tier: quote.nextTier } }
    );
    if (res.modifiedCount !== 1) {
        throw campError("renovation_unavailable", "Your camp has already been renovated", 400);
    }

    let cashAfter = have - cost;
    try {
        const saved = await saveWithVersionRetry(
            () => Fighter.findById(fighterId),
            (doc) => {
                if ((doc.iron ?? 0) < cost) {
                    throw campError("insufficient_cash", "Not enough cash for this renovation", 400, {
                        cost, have: doc.iron ?? 0,
                    });
                }
                doc.iron = (doc.iron ?? 0) - cost;
            }
        );
        cashAfter = saved ? (saved.iron ?? 0) : cashAfter;
    } catch (err) {
        await HomeCamp.updateOne({ _id: camp._id, tier: quote.nextTier }, { $set: { tier: stored } })
            .catch((e) => console.error("[homeCamp] renovation rollback failed:", e.message));
        throw err;
    }

    const freshFighter = await Fighter.findById(fighterId);
    const freshCamp = await HomeCamp.findOne({ _id: camp._id });
    const unlocks = quote.nextTier === 2 ? ["2nd coach slot", "Trainer Market"] : [`Tier ${quote.nextTier} facilities`];

    return {
        renovation: {
            fromTier: stored,
            toTier: quote.nextTier,
            costPaid: cost,
            costBase: quote.costBase,
            cashAfter,
            unlocks,
            message: `Your camp is now ${(CAMP_TIERS[quote.nextTier] || {}).label || `Tier ${quote.nextTier}`}. ${quote.grants}.`,
        },
        fighter: freshFighter,
        camp: freshCamp,
    };
}

// ── Deep clean (§3.6) ────────────────────────────────────────────────────────

/**
 * POST /deep-clean. Buys camp condition back with cash instead of energy.
 *
 * ⚠️ A DEEP CLEAN IS NOT A SESSION. It deliberately does NOT stamp
 * `condition.lastSessionDayKey` — doing so would let $300 also cancel that day's neglect tick,
 * quietly turning a cleaning bill into a way to skip the upkeep loop entirely.
 *
 * REPEATABLE BY DESIGN, unlike a promotion or a hire: two clicks buy two cleans (+80 for $600)
 * because a camp at 10 condition genuinely needs more than one. What must never happen is a
 * charge that delivers nothing — and it can't, because every charge is tied to a compare-and-set
 * that actually raised the value.
 *
 * NOT persona-adjusted: this is a flat service, not a gym rank-up.
 *
 * @returns {Promise<{deepClean:object, fighter:object, camp:object}>}
 */
async function deepClean(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    const camp = await HomeCamp.findOne({ fighterId: fighter._id });
    if (!camp) throw campError("camp_not_found", "Camp not found", 404);

    const cost = DEEP_CLEAN_COST;
    const have = fighter.iron ?? 0;

    // MUTEX on the condition value itself. A double-click loses the compare-and-set and is
    // never charged twice. A benign race (a training session ticking condition between our
    // read and our write) is retried rather than reported as an error — the player did
    // nothing wrong, so a couple of attempts is fairer than a confusing 400.
    let before = Number(camp.condition?.value ?? CONDITION_MAX);
    let after = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (before >= CONDITION_MAX) throw campError("condition_full", "Your camp is already spotless", 400);
        if (have < cost) throw campError("insufficient_cash", "Not enough cash for a deep clean", 400, { cost, have });

        const target = Math.min(CONDITION_MAX, before + DEEP_CLEAN_GAIN);
        const res = await HomeCamp.updateOne(
            { _id: camp._id, "condition.value": before },
            { $set: { "condition.value": target } }
        );
        if (res.modifiedCount === 1) { after = target; break; }

        const fresh = await HomeCamp.findOne({ _id: camp._id }).select("condition.value");
        const now = Number(fresh?.condition?.value ?? CONDITION_MAX);
        if (now === before) break;   // no progress possible — bail out to the guard below
        before = now;
    }
    if (after === null) {
        throw campError("condition_full", "Your camp's condition just changed — take another look", 400);
    }

    let cashAfter = have - cost;
    try {
        const saved = await saveWithVersionRetry(
            () => Fighter.findById(fighterId),
            (doc) => {
                if ((doc.iron ?? 0) < cost) {
                    throw campError("insufficient_cash", "Not enough cash for a deep clean", 400, {
                        cost, have: doc.iron ?? 0,
                    });
                }
                doc.iron = (doc.iron ?? 0) - cost;
            }
        );
        cashAfter = saved ? (saved.iron ?? 0) : cashAfter;
    } catch (err) {
        await HomeCamp.updateOne({ _id: camp._id, "condition.value": after }, { $set: { "condition.value": before } })
            .catch((e) => console.error("[homeCamp] deep clean rollback failed:", e.message));
        throw err;
    }

    const freshFighter = await Fighter.findById(fighterId);
    const freshCamp = await HomeCamp.findOne({ _id: camp._id });

    return {
        deepClean: {
            cost,
            before,
            after,
            gained: after - before,
            cashAfter,
            message: `The camp got a deep clean. Condition ${before} → ${after}.`,
        },
        fighter: freshFighter,
        camp: freshCamp,
    };
}

// ── Needs feed ───────────────────────────────────────────────────────────────

/**
 * Why a given coach is unhappy, in priority order. The subtitle has to name the CAUSE, or the
 * player is told "morale 64" and left to guess which of three systems is responsible.
 */
function moraleReason(camp, coach) {
    const value = Number(coach.morale ?? MORALE_MAX);
    const lastDebit = camp.lastWageDebit;
    if (lastDebit && lastDebit.paid === false) return "Wages went unpaid last week";
    const last = coach.lastSessionAt ? new Date(coach.lastSessionAt).getTime() : null;
    const days = last ? Math.floor((Date.now() - last) / 86_400_000) : null;
    // Lower-case: these are rendered mid-sentence, after "Morale 64 — ".
    if (days !== null && days > 7) return `he hasn't run a session in ${days} days`;
    if (last === null && !coach.isStarter) return "he hasn't run a session yet";
    return `Morale ${value}/${MORALE_MAX}`;
}

/**
 * The "what needs you today" strip.
 * @returns {Need[]}
 */
function buildNeeds(camp, fighter, coachViews, marketView = null) {
    const needs = [];

    for (const c of coachViews) {
        if (c.nextRank && c.nextRank.reqsMet) {
            needs.push({
                type: "COACH_PROMOTE_READY",
                tone: "gold",
                icon: "star",
                title: `${c.name} is ready for promotion`,
                subtitle: c.nextRank.canAfford
                    ? `Rank ${c.nextRank.rank} costs $${c.nextRank.cost}`
                    : `Needs $${c.nextRank.cost} — you have $${fighter.iron ?? 0}`,
                ctaLabel: c.nextRank.canAfford ? "Promote" : "View coach",
                targetCoachId: c.coachId,
            });
        }
    }

    const value = Number(camp.condition?.value ?? CONDITION_MAX);
    if (value < CONDITION_NEED_THRESHOLD) {
        const band = conditionBand(value);
        needs.push({
            type: "CONDITION_LOW",
            tone: band.key === "CRITICAL" ? "warn" : "amber",
            icon: "warning",
            title: `Camp condition is ${band.label.toLowerCase()}`,
            subtitle: `${value}/${CONDITION_MAX} — training XP is at ${Math.round(band.xpMult * 100)}%`,
            ctaLabel: "Run a recovery drill",
            targetCoachId: null,
        });
    }

    // COACH_MORALE_LOW — fires 70 points before anyone quits. The whole point is that a coach
    // walking out is never a surprise: the player is warned from the first lost point.
    for (const coach of camp.coaches || []) {
        const value = Number(coach.morale ?? MORALE_MAX);
        if (value >= MORALE_NEED_THRESHOLD) continue;
        needs.push({
            type: "COACH_MORALE_LOW",
            tone: value < MORALE_XP_HALVED_BELOW ? "warn" : "amber",
            icon: "frown",
            title: `${coach.name} is restless`,
            subtitle: `Morale ${value} — ${moraleReason(camp, coach)}`,
            ctaLabel: "Train with him",
            targetCoachId: String(coach._id),
        });
    }

    // MARKET_RESET — only when there is something the player can actually DO: an open market,
    // candidates in it, a free slot, and no cooldown running.
    if (marketView && marketView.open && marketView.candidateCount > 0
        && !marketView.cooldownActive
        && (camp.coaches || []).length < marketView.slotsUnlocked) {
        const days = marketView.resetsInDays;
        needs.push({
            type: "MARKET_RESET",
            tone: "blue",
            icon: "search",
            title: "New faces at the door",
            subtitle: `${marketView.candidateCount} candidate${marketView.candidateCount === 1 ? "" : "s"} — gone in ${days} day${days === 1 ? "" : "s"}`,
            ctaLabel: "Scout",
            targetCoachId: null,
        });
    }

    return needs;
}

// ── State builder — the ONE builder (GET and promote both return its output) ──

/**
 * Build the full CampState payload. PURE: no DB, no mutation, no saves.
 * Every drill/config object it returns is a FRESH copy — shared mutable config must never
 * leak across requests.
 *
 * @param {object} fighter Fighter document
 * @param {object} camp    HomeCamp document
 * @returns {CampState}
 */
function buildCampState(fighter, camp) {
    const tier = effectiveTier(camp, fighter);
    const tierCfg = CAMP_TIERS[tier] || CAMP_TIERS[1];
    const archetype = COACH_ARCHETYPES[camp.focusDomain] || COACH_ARCHETYPES.STRIKING;

    // Resolve the injury blocks ONCE per request; every drill card reads the same answer.
    const blocks = resolveInjuryBlocks(fighter);

    const coaches = (camp.coaches || []).map((c) => coachService.buildCoachView(c, fighter, blocks, {
        tierCfg,
        coachCount: (camp.coaches || []).length,
        // Needed to tell a rank the player PAID for from one a migrated coach arrived with,
        // for legacy coach docs with no stored `joinedAtRank`.
        campOrigin: camp.origin || null,
    }));

    const conditionValue = Number(camp.condition?.value ?? CONDITION_MAX);
    const band = conditionBand(conditionValue);

    const fb = fallbackDrill();
    const fbBlocked = blocks[fb.family] || null;

    const weeklyTotal = (camp.coaches || []).reduce((sum, c) => sum + (Number(c.wage) || 0), 0);
    const nextDebitAt = camp.nextWageDebitAt ? new Date(camp.nextWageDebitAt).toISOString() : null;
    const nextDebitInDays = camp.nextWageDebitAt
        ? Math.max(0, Math.ceil((new Date(camp.nextWageDebitAt).getTime() - Date.now()) / 86_400_000))
        : null;
    const lastDebit = camp.lastWageDebit && camp.lastWageDebit.at
        ? {
            at: new Date(camp.lastWageDebit.at).toISOString(),
            amount: Number(camp.lastWageDebit.amount) || 0,
            paid: camp.lastWageDebit.paid !== false,
        }
        : null;

    // ── Market block ──
    // ⚠️ THIS READ NEVER ROLLS. Rolling here would mean a plain camp GET mutates the market,
    // and the roll belongs to GET /market (which is also the only place allowed to persist it).
    // The count is PREDICTED when the stored week is stale, and the prediction is exact: 3
    // candidates (+1 with Well-Connected), and 4 disciplines × max 2 can always supply n <= 4.
    const wk = homeCampWeekIndex();
    const marketOpen = tier >= MARKET_MIN_TIER;
    const wcBonus = (camp.coaches || []).some((c) => {
        const t = traitDef(c.traitKey);
        return !!(t && t.marketCandidateBonus);
    }) ? 1 : 0;
    const marketCooldownUntil = camp.market?.slotCooldownUntil ? new Date(camp.market.slotCooldownUntil) : null;
    const marketCooldownActive = !!marketCooldownUntil && marketCooldownUntil.getTime() > Date.now();
    const marketResetsAt = homeCampWeekEnd(wk);
    const candidateCount = !marketOpen
        ? 0
        : (camp.market?.weekIndex === wk ? (camp.market.candidates || []).length : MARKET_CANDIDATES + wcBonus);

    const state = {
        camp: {
            campId: String(camp._id),
            name: camp.name,
            tier,
            tierLabel: tierCfg.label,
            focusDomain: camp.focusDomain,
            focusLabel: archetype.label,
            renovation: buildRenovationView(camp, fighter),
        },
        condition: {
            value: conditionValue,
            max: CONDITION_MAX,
            band: band.key,
            bandLabel: band.label,
            xpMultiplier: band.xpMult,
            penaltyStartsAt: CONDITION_PENALTY_STARTS_AT,
            explainer: CONDITION_EXPLAINER,
        },
        wages: {
            weeklyTotal,
            nextDebitAt,
            nextDebitInDays,
            unpaidWeeks: Number(camp.consecutiveUnpaidWeeks) || 0,
            lastDebit,
        },
        slots: {
            unlocked: tierCfg.slots,
            max: MAX_COACHES,
            nextUnlocksAt: tierCfg.slots >= MAX_COACHES ? null : (NEXT_SLOT_UNLOCK_TIER[tier] || null),
        },
        coaches,
        // Camp-wide passives (contract addendum). Rendered on the camp bar, not just on the
        // providing coach's card — the effect applies to sessions run with ANY coach.
        passives: coachService.buildCampPassives(camp.coaches),
        fallbackSession: {
            key: fb.key,
            name: fb.name,
            energy: fb.energy,
            stats: fb.stats,
            xpMultiplier: tierCfg.fallbackXpMult,
            injuryPct: fb.injuryPct,
            dropPct: fb.dropPct,
            condDelta: fb.condDelta,
            family: fb.family,
            canTrain: !fbBlocked,
            blockedReason: fbBlocked ? `${fbBlocked.label} (${fbBlocked.effect})` : null,
            description: fb.description,
        },
        market: {
            open: marketOpen,
            candidateCount,
            resetsAt: marketOpen ? marketResetsAt.toISOString() : null,
            resetsInDays: marketOpen
                ? Math.max(0, Math.ceil((marketResetsAt.getTime() - Date.now()) / 86_400_000))
                : null,
            // null when open; "tier_locked" when the camp hasn't been renovated far enough.
            reason: marketOpen ? null : "tier_locked",
        },
        needs: [],
    };

    state.needs = buildNeeds(camp, fighter, coaches, {
        open: marketOpen,
        candidateCount,
        resetsInDays: state.market.resetsInDays,
        cooldownActive: marketCooldownActive,
        slotsUnlocked: tierCfg.slots,
    });
    return state;
}

/**
 * GET /home-camp/:fighterId — creates the camp on first call and applies the lazy tick.
 * @returns {Promise<CampState>}
 */
async function getCampState(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);
    const camp = await ensureCamp(fighter);
    return buildCampState(fighter, camp);
}

// ── Daily job (B8) ───────────────────────────────────────────────────────────

const DECAY_BATCH_SIZE = 500;

/**
 * Daily condition-decay sweep. Cursors over camps whose last tick predates today (UTC),
 * batched, and applies the SAME applyIdleNeglect used by the lazy read tick — so the job and
 * a player visit can never disagree, and running the job repeatedly in one day is a no-op
 * after the first pass.
 *
 * Retry: the queue sets NO `attempts` — due-ness lives in condition.lastNeglectDayKey, so a
 * failed sweep needs no retry; tomorrow's tick (or the player's next visit) picks it up.
 *
 * @returns {Promise<{touched:number, decayed:number, failed:number}>}
 */
async function runConditionDecayBatch() {
    const now = new Date();
    const startOfTodayUtc = new Date(`${utcDayKey(now)}T00:00:00.000Z`);

    let touched = 0;
    let decayed = 0;
    let failed = 0;

    const cursor = HomeCamp.find({ "condition.lastNeglectAt": { $lt: startOfTodayUtc } })
        .batchSize(DECAY_BATCH_SIZE)
        .cursor();

    for await (const camp of cursor) {
        try {
            const tick = applyIdleNeglect(camp, now);
            if (tick.changed) {
                await camp.save();
                touched += 1;
                if (tick.points > 0) decayed += 1;
            }
        } catch (e) {
            failed += 1;
            console.error(`[Home camp condition] camp ${camp && camp._id} failed to tick:`, e.message);
        }
    }

    return { touched, decayed, failed };
}

// ── Weekly wage / morale tick (B9) ───────────────────────────────────────────

const WEEKLY_BATCH_SIZE = 500;

/**
 * THE single home for wages, morale decay and quits. One camp, one call, N weeks.
 *
 * ⚠️ CALLED ONLY BY THE JOB — never lazily on a read. `ensureCamp` runs inside a GET and must
 * never write the fighter document (that is the whole lossless-rollback guarantee, contract
 * §6.3/§6.5.4), and this function MOVES MONEY. A missed job is repaired by the catch-up below,
 * not by making reads write.
 *
 * FIRST-SIGHT RULE: `lastWeeklyTickIndex < 0` means this camp has never been ticked (every
 * migrated camp starts there). It processes NO history — no retro-wages, no retro-morale. A
 * player who converted six months of gym history does not owe six months of back pay.
 *
 * ⚠️ ONE WEEK = ONE CHARGE + ONE SAVE. The wage debit lives in the FIGHTER document and the
 * bookkeeping in the CAMP document; there are no transactions across them, so the two can only
 * be tied together by keeping them adjacent. Each iteration therefore debits and immediately
 * persists that week before moving to the next.
 *
 * The residual failure window is exactly ONE in-flight week: a crash between a week's debit and
 * its save leaves that single charge unrecorded. It can never be more than one week, and the
 * ledger never claims a charge that did not happen (we record only after the money moved).
 * Batching the saves — which is what this used to do — turned that into up to EIGHT weeks of
 * real, irreversible, unrecorded charges on an already-claimed camp: money gone, no evidence,
 * never retried. Do not re-batch it.
 *
 * @param {object} camp        HomeCamp doc, ALREADY CLAIMED by the caller
 * @param {number} weekIndex   the week being claimed
 * @param {number} lastIndex   lastWeeklyTickIndex as read BEFORE the claim
 * @returns {Promise<{weeks:number, paid:number, unpaid:number, quit:string[]}>}
 */
async function applyWeeklyTick(camp, weekIndex, lastIndex) {
    const summary = { weeks: 0, paid: 0, unpaid: 0, quit: [] };
    let doc = camp;

    if (lastIndex < 0) {
        // First sight — anchor the schedule and charge nothing.
        doc.nextWageDebitAt = homeCampWeekStart(weekIndex + 1);
        await doc.save();
        return summary;
    }

    // Bounded catch-up: an outage (or a long absence) can cost at most 8 weeks of back pay.
    const weeks = Math.min(weekIndex - lastIndex, MAX_WEEKLY_CATCHUP);
    // Every week's patch carries the FINAL next-debit date, not that week's, so however far a
    // partial run gets, the camp bar still shows the right upcoming Monday.
    const nextWageDebitAt = homeCampWeekStart(weekIndex + 1);

    for (let w = weekIndex - weeks + 1; w <= weekIndex; w++) {
        const ws = homeCampWeekStart(w);
        const weeklyTotal = (doc.coaches || []).reduce((sum, c) => sum + (Number(c.wage) || 0), 0);

        // 1. WAGES — one conditional $inc. All-or-nothing and NEVER negative: the filter's
        //    `iron >= weeklyTotal` is what makes a partial payment impossible, and a player
        //    can never be pushed into debt by their own camp.
        let paid = true;
        if (weeklyTotal > 0) {
            const res = await Fighter.updateOne(
                { _id: doc.fighterId, iron: { $gte: weeklyTotal } },
                { $inc: { iron: -weeklyTotal } }
            );
            paid = res.modifiedCount === 1;
        }

        // 2-4. Everything this week does to the CAMP, computed as absolute target values.
        const patch = computeWeekPatch(doc, ws, paid, weeklyTotal, nextWageDebitAt);
        applyWeekPatch(doc, patch);

        // ⚠️ PERSIST THIS WEEK'S BOOKKEEPING NOW — in the same breath as its debit.
        //
        // The money moved at step 1 and CANNOT be rolled back (separate document, no
        // transactions), while the claim is already committed so this week will never be
        // revisited. Deferring the save to the end of an 8-week catch-up therefore risked the
        // worst possible outcome: several weeks of real, irreversible charges with no ledger
        // entry, no morale/condition effect and a stale next-debit date — a silent charge the
        // player has no evidence of. Saving per week bounds that to the ONE week in flight.
        doc = await saveWeekBookkeeping(doc, patch);

        if (paid) summary.paid += 1; else summary.unpaid += 1;
        for (const name of patch.quitNames) summary.quit.push(name);
        summary.weeks += 1;
    }

    return summary;
}

/**
 * Everything a single week does to the camp, as ABSOLUTE target values (never deltas).
 *
 * Absolute values are what make the write safely re-appliable: if the save loses a version
 * race we can reload the document and apply this same patch again without double-counting a
 * decrement. PURE — reads the camp, mutates nothing.
 */
function computeWeekPatch(camp, ws, paid, weeklyTotal, nextWageDebitAt) {
    const coaches = camp.coaches || [];

    const consecutiveUnpaidWeeks = paid ? 0 : (Number(camp.consecutiveUnpaidWeeks) || 0) + 1;

    // CONDITION — an unpaid camp decays, and it compounds (−5, −10, −15, −20 max).
    const condAtWeekStart = Number(camp.condition?.value ?? CONDITION_MAX);
    let conditionValue = condAtWeekStart;
    if (!paid) {
        const mult = Math.min(consecutiveUnpaidWeeks, CONDITION_UNPAID_MAX_MULT);
        conditionValue = Math.max(0, condAtWeekStart + CONDITION_UNPAID_PER_WEEK * mult);
    }

    // MORALE — negatives are summed and THEN doubled in a squalid camp; the Locker-Room
    // Leader's +2 is never doubled (a bonus shouldn't scale with neglect).
    const hasLockerRoomLeader = coaches.some((c) => {
        const t = traitDef(c.traitKey);
        return !!(t && t.othersMoralePerWeek);
    });
    const moraleById = new Map();
    for (const coach of coaches) {
        const t = traitDef(coach.traitKey);
        let neg = 0;
        if (!paid) neg += MORALE_WAGE_UNPAID;
        // Only coaches who were already here for the whole week can be blamed for idling.
        const hiredBefore = coach.hiredAt ? new Date(coach.hiredAt).getTime() < ws.getTime() : true;
        const lastSession = coach.lastSessionAt ? new Date(coach.lastSessionAt).getTime() : null;
        if (hiredBefore && (lastSession === null || lastSession < ws.getTime())) {
            neg += MORALE_UNUSED_SESSIONS;
        }
        if (t && t.selfMoralePerWeek) neg += t.selfMoralePerWeek;

        // A Locker-Room Leader lifts the OTHERS, not himself.
        const pos = (hasLockerRoomLeader && !(t && t.othersMoralePerWeek))
            ? coaches.reduce((best, other) => {
                if (String(other._id) === String(coach._id)) return best;
                const ot = traitDef(other.traitKey);
                return ot && ot.othersMoralePerWeek ? Math.max(best, ot.othersMoralePerWeek) : best;
            }, 0)
            : 0;

        if (condAtWeekStart < CONDITION_DOUBLE_DECAY_BELOW) neg *= 2;
        const floor = t && t.moraleFloor ? t.moraleFloor : 0;   // LOYAL never falls past 40
        const before = Number(coach.morale ?? MORALE_MAX);
        moraleById.set(String(coach._id), Math.max(floor, Math.min(MORALE_MAX, before + neg + pos)));
    }

    // QUITS — at 0 morale a coach walks. No condition hit, no morale hit to the others, no
    // slot cooldown: the player is already losing a coach they paid for, and piling the firing
    // penalties on top would punish them twice for the same neglect.
    const quitIds = [];
    const quitNames = [];
    const bankDomains = [];
    let remaining = coaches.length;
    for (const coach of coaches) {
        const id = String(coach._id);
        if (moraleById.get(id) > MORALE_QUIT_AT) continue;
        if (remaining <= 1) {
            // THE LAST COACH NEVER QUITS. A coachless camp is unrecoverable (no drills, and
            // the market needs Tier 2), so morale floors at 1 and the COACH_MORALE_LOW need
            // keeps shouting instead.
            moraleById.set(id, 1);
            continue;
        }
        // A Head Coach leaves knowledge behind — same bank a firing produces.
        if ((Number(coach.rank) || 1) >= 3) bankDomains.push(coach.archetype);
        quitIds.push(id);
        quitNames.push(`${coach.name} (${coach.archetype})`);
        remaining -= 1;
    }

    return {
        lastWageDebit: { at: ws, amount: weeklyTotal, paid },
        consecutiveUnpaidWeeks,
        conditionValue,
        nextWageDebitAt,
        morale: [...moraleById].map(([id, value]) => ({ id, value })),
        quitIds,
        quitNames,
        bankDomains,
    };
}

/**
 * Apply a week's patch to a camp document. IDEMPOTENT by construction — every field is an
 * absolute assignment and `bankDisciplineFamiliarity` never lowers — so re-applying it to a
 * freshly reloaded document after a version race produces the same result.
 */
function applyWeekPatch(doc, patch) {
    doc.consecutiveUnpaidWeeks = patch.consecutiveUnpaidWeeks;
    doc.lastWageDebit = { ...patch.lastWageDebit };
    if (doc.condition) doc.condition.value = patch.conditionValue;
    doc.nextWageDebitAt = patch.nextWageDebitAt;

    for (const { id, value } of patch.morale) {
        const coach = doc.coaches.id ? doc.coaches.id(id) : (doc.coaches || []).find((c) => String(c._id) === id);
        if (coach) coach.morale = value;
    }
    for (const domain of patch.bankDomains) {
        require("./homeCampMarketService").bankDisciplineFamiliarity(doc, domain);
    }
    for (const id of patch.quitIds) {
        const present = doc.coaches.id ? doc.coaches.id(id) : (doc.coaches || []).find((c) => String(c._id) === id);
        if (present) doc.coaches.pull(id);
    }
}

/**
 * Save one week's bookkeeping, surviving a concurrent writer.
 *
 * WHY A RETRY IS NEEDED AT ALL: we hold the weekly CLAIM, so no other tick is on this camp —
 * but the camp document is not ours alone. The daily condition sweep (03:15 UTC, fifteen
 * minutes before this job) and any training session both call `camp.save()`, and mongoose
 * raises a VersionError when an array-bearing document is saved from a stale snapshot.
 *
 * We do NOT use `saveWithVersionRetry` here: that helper re-runs a mutation closure against a
 * fresh document, and this mutation is a whole week of arithmetic that has already been paid
 * for — re-deriving it from reloaded state could produce a DIFFERENT week than the one the
 * player was charged for. Instead we reload and re-apply the SAME absolute patch, so what
 * lands is exactly what the debit paid for.
 *
 * @returns {Promise<object>} the document to keep working with (fresh one after a retry)
 */
async function saveWeekBookkeeping(doc, patch) {
    try {
        await doc.save();
        return doc;
    } catch (err) {
        if (!err || err.name !== "VersionError") throw err;   // a real failure must surface
        const fresh = await HomeCamp.findById(doc._id);
        if (!fresh) throw err;
        applyWeekPatch(fresh, patch);
        await fresh.save();
        console.warn(`[Home camp weekly] camp ${doc._id}: version race on the weekly save — re-applied on a fresh read.`);
        return fresh;
    }
}

/**
 * Weekly sweep over every camp that hasn't been ticked for the current week.
 *
 * ⚠️ CLAIM-THEN-CHARGE. THE ORDER BELOW IS THE ANTI-DOUBLE-DEBIT GUARANTEE — NEVER REORDER IT.
 * The claim is a compare-and-set on `lastWeeklyTickIndex` that PERSISTS BEFORE a single cent
 * moves. Consequences, deliberately chosen:
 *   · running the job five times in one week debits exactly once (four runs claim nothing);
 *   · a crash between the claim and the debit costs the player NOTHING — that week is simply
 *     skipped. A free week is a bug we can live with; charging twice is not.
 * This is also why the queue can safely carry attempts:3 — a retry resumes the sweep instead
 * of re-billing the camps it already processed.
 *
 * QA/ALERT: `HomeCamp.countDocuments({lastWeeklyTickIndex: {$lt: currentWeek - 1}})` being
 * non-zero on a Tuesday means this job is down.
 *
 * @returns {Promise<{claimed:number, paid:number, unpaid:number, quit:number, failed:number}>}
 */
async function runWeeklyCampBatch() {
    const wk = homeCampWeekIndex();
    let claimed = 0;
    let paid = 0;
    let unpaid = 0;
    let quit = 0;
    let failed = 0;

    const cursor = HomeCamp.find({ lastWeeklyTickIndex: { $lt: wk } })
        .batchSize(WEEKLY_BATCH_SIZE)
        .cursor();

    for await (const camp of cursor) {
        const lastIndex = Number(camp.lastWeeklyTickIndex);
        try {
            // ── THE CLAIM. Persisted before any money moves. ──
            const res = await HomeCamp.updateOne(
                { _id: camp._id, lastWeeklyTickIndex: lastIndex },
                { $set: { lastWeeklyTickIndex: wk } }
            );
            if (res.modifiedCount !== 1) continue;   // another attempt owns this camp
            claimed += 1;

            camp.lastWeeklyTickIndex = wk;   // keep the in-memory doc consistent with the claim
            const r = await applyWeeklyTick(camp, wk, lastIndex);
            paid += r.paid;
            unpaid += r.unpaid;
            quit += r.quit.length;
            if (r.quit.length > 0) {
                console.log(`[Home camp weekly] camp ${camp._id}: coach(es) quit — ${r.quit.join(", ")}`);
            }
        } catch (e) {
            failed += 1;
            console.error(`[Home camp weekly] camp ${camp && camp._id} failed to tick:`, e.message);
        }
    }

    return { claimed, paid, unpaid, quit, failed };
}

module.exports = {
    ensureCamp,
    deriveInitialCampState,
    buildCampState,
    getCampState,
    renameCamp,
    buildNeeds,
    resolveInjuryBlocks,
    // PHASE 1
    renovationQuote,
    buildRenovationView,
    renovateCamp,
    deepClean,
    applyWeeklyTick,
    runWeeklyCampBatch,
    // condition — single home
    conditionBand,
    applySessionConditionDelta,
    applyIdleNeglect,
    runConditionDecayBatch,
    // exported for tests / internal reuse
    campError,
    loadGymSlugMap,
    _dayKeyDiff: dayKeyDiff,
    _shiftDayKey: shiftDayKey,
};
