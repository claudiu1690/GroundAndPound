/**
 * Home Camp ("My Camp") — single source of truth for every number, label and enum.
 *
 * NAMING: the `camp` prefix is already taken by the FIGHT camp system
 * (services/campService.js, consts/campConfig.js, models/fightCampModel.js — GDD §9).
 * Everything in the player's own training camp uses the `homeCamp` prefix on the
 * backend and mounts at /home-camp. Player-facing strings still read "My Camp".
 *
 * The FRONTEND MUST NOT import this module. Every number the UI renders arrives in
 * the API response; frontend/src/components/camp/campConstants.js is presentation
 * only (colours, glyphs). Precedent: shopConstants.js.
 *
 * validateHomeCampConfig() runs at module load (mirroring specialMovesCatalog.validateCatalog)
 * so a bad slug map / teach id / stat key fails the boot rather than a live request.
 */
const { STAT_NAMES, STYLES, FIGHT_OUTCOMES } = require("./gameConstants");
const { SPECIAL_MOVES_BY_ID, rarityRank } = require("./specialMovesCatalog");
const { TIER_KEYS: NOTORIETY_TIER_KEYS } = require("./notorietyConfig");

// ── Tiers ────────────────────────────────────────────────────────────────────
// coachXpMult deliberately tracks the gym focus multipliers (1.25 / 1.30 / 1.40 / 1.50)
// so the camp is never a nerf while the camp and the 10 gyms coexist.
const CAMP_TIERS = Object.freeze({
    1: Object.freeze({ label: "Tier 1", slots: 1, fallbackXpMult: 0.60, coachXpMult: 1.25, dropKey: "Amateur" }),
    2: Object.freeze({ label: "Tier 2", slots: 2, fallbackXpMult: 1.00, coachXpMult: 1.30, dropKey: "Amateur" }),
    3: Object.freeze({ label: "Tier 3", slots: 3, fallbackXpMult: 1.15, coachXpMult: 1.40, dropKey: "Regional Pro" }),
    4: Object.freeze({ label: "Tier 4", slots: 4, fallbackXpMult: 1.30, coachXpMult: 1.50, dropKey: "National" }),
});

const MAX_CAMP_TIER = 4;

/** Promotion tier floors the EFFECTIVE camp tier — progression can never leave a camp behind. */
const TIER_FLOOR_BY_PROMOTION = Object.freeze({
    "Amateur": 1,
    "Regional Pro": 3,
    "National": 4,
    "GCS Contender": 4,
    "GCS": 4,
});

/** The tier the camp actually operates at: max(stored renovation tier, promotion floor). */
function effectiveTier(camp, fighter) {
    const stored = Math.min(MAX_CAMP_TIER, Math.max(1, Number(camp && camp.tier) || 1));
    const floor = TIER_FLOOR_BY_PROMOTION[fighter && fighter.promotionTier] ?? 1;
    return Math.max(stored, floor);
}

/** The promotion tier at which the NEXT slot unlocks, or null at max. */
const NEXT_SLOT_UNLOCK_TIER = Object.freeze({ 1: "Regional Pro", 2: "Regional Pro", 3: "National" });

// ── Coach archetypes ─────────────────────────────────────────────────────────
// relevantWinTypes strings MUST match gameConstants.FIGHT_OUTCOMES exactly.
//
// `perkKey` — the rank-4 payoff. Per the design ("the 10 existing gym-mastery perks re-home
// 1:1 onto trainer archetypes") each archetype inherits the perk from the GYM whose focusStats
// exactly equal that archetype's cluster, so the camp reuses the existing gymPerks mechanism
// rather than inventing a parallel one:
//   STRIKING     ← iron-fist-boxing    (STR,SPD,CHN) → corner_confidence     [named in mock F]
//   WRESTLING    ← apex-wrestling      (WRE,STR,GND) → mat_returns
//   BJJ          ← gracie-ground-game  (GND,SUB)     → submission_awareness
//   CONDITIONING ← warrior-muay-thai   (LEG,STR,CHN) → iron_conditioning      [PHASE 1]
// The perk's display name/effect are read from data/gyms.json (see GYM_PERK_CATALOG) so the
// camp and the gym can never show different text for the same perk.
const COACH_ARCHETYPES = Object.freeze({
    STRIKING: Object.freeze({
        label: "Striking Coach",
        cluster: Object.freeze(["STR", "SPD", "CHN"]),
        relevantWinTypes: Object.freeze(["KO/TKO"]),
        relevantWinLabel: "KO wins",
        perkKey: "corner_confidence",
    }),
    WRESTLING: Object.freeze({
        label: "Wrestling Coach",
        cluster: Object.freeze(["WRE", "GND", "STR"]),
        relevantWinTypes: Object.freeze(["Decision (unanimous)", "Decision (split)"]),
        relevantWinLabel: "Decision wins",
        perkKey: "mat_returns",
    }),
    BJJ: Object.freeze({
        label: "BJJ Professor",
        cluster: Object.freeze(["GND", "SUB"]),
        relevantWinTypes: Object.freeze(["Submission"]),
        relevantWinLabel: "Sub wins",
        perkKey: "submission_awareness",
    }),
    CONDITIONING: Object.freeze({
        label: "Conditioning Coach",
        cluster: Object.freeze(["CHN", "FIQ"]),
        minCampTier: 2, // PHASE 1 — hireable only from the market
        relevantWinTypes: Object.freeze(["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"]),
        relevantWinLabel: "Wins",
        perkKey: "iron_conditioning",
    }),
});

/**
 * The 10 gym rank-4 perks, keyed by perkId, built from data/gyms.json at load.
 *
 * SINGLE SOURCE: these perks already exist and are already stored in `fighter.gymPerks` and
 * read by live code (fightService reads strength_reserve, trainingService reads
 * iron_conditioning). The camp GRANTS INTO THE SAME ARRAY — it does not define its own perk
 * system, and it never redefines a perk's name or effect text.
 */
const GYM_PERK_CATALOG = Object.freeze((() => {
    const out = {};
    let gyms = [];
    try {
        gyms = require("../data/gyms.json");
    } catch (_) {
        return out; // validateHomeCampConfig raises the real error below
    }
    for (const g of gyms) {
        for (const r of g.ranks || []) {
            const u = r.unlock;
            if (!u || u.type !== "perk" || !u.perkId) continue;
            out[u.perkId] = Object.freeze({
                key: u.perkId,
                name: u.perkName || u.perkId,
                effect: u.perkEffect || "",
                sourceGymSlug: g.slug,
            });
        }
    }
    return out;
})());

const ARCHETYPE_KEYS = Object.freeze(Object.keys(COACH_ARCHETYPES));

/** Domains a Phase-0 starter coach can be created in (CONDITIONING is market-only, Phase 1). */
const STARTER_DOMAINS = Object.freeze(["STRIKING", "WRESTLING", "BJJ"]);

// ── Drill kits ───────────────────────────────────────────────────────────────
// Array index IS the card order in the UI. unlockRank: idx 0,1 → 1 · idx 2 (flagship) → 2 ·
// idx 3 (utility) → 3. `family` drives the existing injury blocks:
//   spar → isSparringBlocked · bag → isBagWorkBlocked · none → never blocked.
// Frozen so a request handler cannot mutate shared config; every read hands back a fresh copy.
const COACH_DRILLS = Object.freeze({
    STRIKING: Object.freeze([
        Object.freeze({ key: "pad_work_circuit", name: "Pad Work Circuit", unlockRank: 1, energy: 5, stats: Object.freeze(["STR", "SPD"]), xpBase: 10, injuryPct: 0, dropPct: 0, condDelta: 2, family: "bag", isFlagship: false, description: "Sharp, repeatable combinations on the mitts. Safe volume." }),
        Object.freeze({ key: "heavy_bag_assault", name: "Heavy Bag Assault", unlockRank: 1, energy: 6, stats: Object.freeze(["STR"]), xpBase: 15, injuryPct: 2, dropPct: 0, condDelta: 0, family: "bag", isFlagship: false, description: "Nothing but power. The bag swings, the knuckles complain." }),
        Object.freeze({ key: "live_championship_rounds", name: "Live Championship Rounds", unlockRank: 2, energy: 9, stats: Object.freeze(["STR", "SPD", "CHN"]), xpBase: 18, injuryPct: 6, dropPct: 5, condDelta: -1, family: "spar", isFlagship: true, description: "Full-contact rounds at fight pace. The best XP in the room and the worst on your face." }),
        Object.freeze({ key: "chin_composure_drills", name: "Chin & Composure Drills", unlockRank: 3, energy: 4, stats: Object.freeze(["CHN"]), xpBase: 10, injuryPct: 0, dropPct: 0, condDelta: 3, family: "none", isFlagship: false, description: "Controlled work on taking a shot without panicking. Restores the room." }),
    ]),
    WRESTLING: Object.freeze([
        Object.freeze({ key: "live_wrestling", name: "Live Wrestling", unlockRank: 1, energy: 5, stats: Object.freeze(["WRE"]), xpBase: 12, injuryPct: 1, dropPct: 0, condDelta: 1, family: "spar", isFlagship: false, description: "Shots, sprawls, scrambles. The bread and butter." }),
        Object.freeze({ key: "cage_control_drilling", name: "Cage Control Drilling", unlockRank: 1, energy: 6, stats: Object.freeze(["WRE", "GND"]), xpBase: 12, injuryPct: 2, dropPct: 0, condDelta: 1, family: "spar", isFlagship: false, description: "Pin them to the fence and make every second miserable." }),
        Object.freeze({ key: "grind_it_out_rounds", name: "Grind-It-Out Rounds", unlockRank: 2, energy: 9, stats: Object.freeze(["WRE", "GND", "STR"]), xpBase: 18, injuryPct: 6, dropPct: 5, condDelta: -1, family: "spar", isFlagship: true, description: "Hard rounds with no let-up. Builds decision-winners and wrecks the mats." }),
        Object.freeze({ key: "mat_return_repetition", name: "Mat Return Repetition", unlockRank: 3, energy: 4, stats: Object.freeze(["WRE"]), xpBase: 10, injuryPct: 0, dropPct: 0, condDelta: 2, family: "none", isFlagship: false, description: "The same return, a hundred times, until it stops being a decision." }),
    ]),
    BJJ: Object.freeze([
        Object.freeze({ key: "guard_retention_work", name: "Guard Retention Work", unlockRank: 1, energy: 4, stats: Object.freeze(["GND"]), xpBase: 10, injuryPct: 0, dropPct: 0, condDelta: 2, family: "none", isFlagship: false, description: "Frames, hips, patience. Nobody passes for free." }),
        Object.freeze({ key: "positional_sparring", name: "Positional Sparring", unlockRank: 1, energy: 5, stats: Object.freeze(["GND", "SUB"]), xpBase: 10, injuryPct: 1, dropPct: 0, condDelta: 1, family: "spar", isFlagship: false, description: "Start in the bad spot. Fight your way out. Reset. Again." }),
        Object.freeze({ key: "live_rolling", name: "Live Rolling", unlockRank: 2, energy: 9, stats: Object.freeze(["GND", "SUB", "WRE"]), xpBase: 18, injuryPct: 5, dropPct: 5, condDelta: -1, family: "spar", isFlagship: true, description: "Open rolls with the room's best. Everything is live, including the joints." }),
        Object.freeze({ key: "film_technique_study", name: "Film & Technique Study", unlockRank: 3, energy: 3, stats: Object.freeze(["SUB"]), xpBase: 8, injuryPct: 0, dropPct: 0, condDelta: 3, family: "none", isFlagship: false, description: "Tape, whiteboard, coffee. Cheap, safe, and the room stays tidy." }),
    ]),
    // PHASE 1 — the hireable Conditioning coach's kit.
    //
    // Two of these drills carry NO stats, which is deliberate and validated (rules 5/7 below):
    //   · sc_plus           stats:[] + raisesMaxStamina → the max-stamina branch (no stat XP,
    //                       no booster charge), shared with the gym's S&C session via
    //                       utils/trainingSession.applyMaxStaminaSession.
    //   · recovery_mobility stats:[] + condDelta only   → pure upkeep. The cheapest way to
    //                       buy camp condition back with energy instead of cash.
    //
    // grueling_fitness_test is family "bag" ON PURPOSE, not a copy/paste slip: `family`'s only
    // job is to pick the injury block, and a 4%-injury drill MUST be blockable. Validator rule 6
    // makes "correcting" it to "none" a boot failure.
    CONDITIONING: Object.freeze([
        Object.freeze({ key: "sc_plus", name: "Strength & Conditioning+", unlockRank: 1, energy: 4, stats: Object.freeze([]), xpBase: 0, injuryPct: 0, dropPct: 0, condDelta: 2, family: "none", isFlagship: false, raisesMaxStamina: true, description: "Barbells, sleds and a stopwatch. Raises your Max Stamina rather than any one stat." }),
        Object.freeze({ key: "recovery_mobility", name: "Recovery & Mobility", unlockRank: 1, energy: 3, stats: Object.freeze([]), xpBase: 0, injuryPct: 0, dropPct: 0, condDelta: 5, family: "none", isFlagship: false, description: "Ice, bands and long stretches. Teaches nothing and fixes everything — the room included." }),
        Object.freeze({ key: "grueling_fitness_test", name: "Grueling Fitness Test", unlockRank: 2, energy: 8, stats: Object.freeze(["CHN", "STR"]), xpBase: 16, injuryPct: 4, dropPct: 3, condDelta: -1, family: "bag", isFlagship: true, description: "Timed circuits until someone quits. Nobody enjoys it and everybody improves." }),
        Object.freeze({ key: "veteran_wisdom", name: "Veteran Wisdom Sessions", unlockRank: 3, energy: 4, stats: Object.freeze(["FIQ"]), xpBase: 10, injuryPct: 0, dropPct: 0, condDelta: 2, family: "none", isFlagship: false, description: "War stories with a point to them. Cheap, safe, and the ring IQ sticks." }),
    ]),
});

/**
 * The always-available, never-gated, no-coach session. XP multiplier is
 * CAMP_TIERS[effectiveTier].fallbackXpMult (NOT a coach multiplier).
 */
const FALLBACK_DRILL = Object.freeze({
    key: "open_mat",
    name: "Open Mat Sparring",
    unlockRank: 1,
    energy: 6,
    stats: Object.freeze([...STAT_NAMES]),
    xpBase: 12,
    injuryPct: 3,
    dropPct: 4,
    condDelta: 0,
    family: "spar",
    isFlagship: false,
    description: "No coach, no plan — just whoever showed up. Always available.",
});

// ── Condition ────────────────────────────────────────────────────────────────
const CONDITION_BANDS = Object.freeze([
    Object.freeze({ min: 0, max: 19, xpMult: 0.75, key: "CRITICAL", label: "Neglected" }),
    Object.freeze({ min: 20, max: 49, xpMult: 0.90, key: "POOR", label: "Run down" }),
    Object.freeze({ min: 50, max: 100, xpMult: 1.00, key: "GOOD", label: "Thriving" }),
]);

const CONDITION_MAX = 100;
/** Highest value that still carries an XP penalty — drives the "penaltyStartsAt" hint. */
const CONDITION_PENALTY_STARTS_AT = 49;
const CONDITION_EXPLAINER = "Flagship rounds cost −1 each · recovery drills build it back";
/** A UTC day with zero camp sessions costs this much condition. */
const NEGLECT_PER_IDLE_DAY = 2;
/** Ceiling on a single lazy catch-up so a returning player isn't nuked. */
const NEGLECT_MAX_CATCHUP_DAYS = 14;
/** Condition below this raises a CONDITION_LOW need on the camp screen. */
const CONDITION_NEED_THRESHOLD = 50;

// ── Coach rank ladder ────────────────────────────────────────────────────────
// Every promotion costs cash, so EVERY promotion is manual. There is no auto-rank-up path.
const COACH_RANKS = Object.freeze({
    2: Object.freeze({ sessions: 12, wins: 2, cost: 600 }),
    3: Object.freeze({ sessions: 30, wins: 5, cost: 2000 }),
    4: Object.freeze({ sessions: 60, wins: 10, cost: 5000 }),
});
const COACH_MAX_RANK = 4;
/** Flat XP bonus a Rank-3+ coach adds on top of the tier multiplier. */
const COACH_RANK3_XP_BONUS = 0.05;

/**
 * CONDITIONING's camp-wide passive — the fraction shaved off EVERY camp drill's injury risk
 * while he is on staff, by his rank.
 *
 * WHY IT EXISTS: he is the only archetype whose kit contains statless drills (2 of 4), and
 * both of them pay out in CAPPED resources — Max Stamina stops at 120, Facility Condition at
 * 100. Every other coach's four drills grant permanent stat XP forever. So once a player
 * topped both meters out, half his kit was dead and there was no reason left to hold a slot
 * for him. This gives him a reason that cannot expire: he is insurance, not maintenance.
 *
 * Deliberately a PASSIVE, not another drill — it pays while you train with SOMEONE ELSE,
 * which is what makes a support slot worth its wage. Scaled by rank so promoting him is a
 * real decision, and multiplicative so it shaves risky sessions hardest (a 0% drill can
 * never become "more than 0% safe").
 */
const CONDITIONING_INJURY_REDUCTION_BY_RANK = Object.freeze({ 1: 0.15, 2: 0.20, 3: 0.25, 4: 0.30 });

/**
 * Total injury reduction the roster's CONDITIONING coach provides, 0 when there isn't one.
 * NOT additive across coaches — the roster can only hold one coach per archetype, and this
 * reads the first match so a future rule change can't silently start stacking.
 */
function conditioningInjuryReduction(coaches) {
    const c = (Array.isArray(coaches) ? coaches : []).find((x) => x && x.archetype === "CONDITIONING");
    if (!c) return 0;
    const rank = Math.max(1, Math.min(COACH_MAX_RANK, Number(c.rank) || 1));
    return CONDITIONING_INJURY_REDUCTION_BY_RANK[rank] || 0;
}
const COACH_RANK_LABELS = Object.freeze(["Cornerman", "Coach", "Head Coach", "Master"]);
/** Hard cap on the coach roster (schema + service enforced). */
const MAX_COACHES = 4;

// ── Teach pools (stored at coach creation; GRANTING is PHASE 2) ──────────────
const DOMAIN_TEACH_POOLS = Object.freeze({
    STRIKING: Object.freeze(["HEAVY_HANDS", "BODY_SNATCHER", "CLINCH_KILLER", "THE_FINISHER"]),
    WRESTLING: Object.freeze(["SPRAWL_INSTINCT", "MOUNT_REAPER", "KILLER_INSTINCT"]),
    BJJ: Object.freeze(["NEVER_TAP", "VETERAN_IQ", "IRON_RECOVERY"]),
    CONDITIONING: Object.freeze(["GRANITE_JAW", "SECOND_WIND"]),
});

/** How many moves a coach of each rarity can ever teach. */
const TEACH_BREADTH_BY_RARITY = Object.freeze({ COMMON: 1, UNCOMMON: 2, RARE: 3, LEGENDARY: Infinity });
/** Coach rank required to teach the move in each teach-pool slot. */
const TEACH_RANK_BY_SLOT = Object.freeze({ 0: 2, 1: 4, 2: 4, 3: 4 });

const COACH_RARITIES = Object.freeze(["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]);

// ── PHASE 1: rarity economics ────────────────────────────────────────────────
// DETERMINISTIC PER RARITY+TRAIT — there is NO per-individual jitter anywhere. "Displayed
// price == charged price" is law, and the only way to keep it true across a market card, a
// hire confirm and the actual debit is for the price to be a pure function of (rarity, trait).
// The validator re-derives every fee/wage from the base numbers so a hand-edited table fails
// the boot instead of silently overcharging a player.
const COACH_BASE_HIRE_FEE = 500;
const COACH_BASE_WAGE = 150;
const RARITY_ECONOMICS = Object.freeze({
    COMMON: Object.freeze({ hireMult: 1, wageMult: 1, hireFee: 500, wage: 150 }),
    UNCOMMON: Object.freeze({ hireMult: 2.5, wageMult: 2, hireFee: 1250, wage: 300 }),
    RARE: Object.freeze({ hireMult: 6, wageMult: 5, hireFee: 3000, wage: 750 }),
    // Legendary hire multiplier is 10 (top hire fee exactly $5,000); the WAGE multiplier
    // stays 15 — a Legendary is cheap to sign and expensive to keep.
    LEGENDARY: Object.freeze({ hireMult: 10, wageMult: 15, hireFee: 5000, wage: 2250 }),
});

// ── PHASE 1: the 12 coach traits ─────────────────────────────────────────────
// `{name, desc, caution}` is exactly the shape the coach card's trait chip renders, so a trait
// never needs a second description on the frontend.
//
// EVERY EFFECT KEY BELOW HAS EXACTLY ONE IMPLEMENTATION SITE (see the table in the Phase-1
// contract §4.4). Adding a second "+1 here as well" in a resolver is how this feature breaks:
// the market card would advertise a number the training endpoint doesn't charge.
//   wageMult/hireMult        → homeCampMarketService.generateCandidate (frozen at generation)
//   rankReqMult              → homeCampCoachService.rankProgress
//   xpBonus                  → homeCampCoachService.coachXpMultiplier
//   energyDelta/injuryDelta/dropDelta/condDeltaBonus
//                            → homeCampCoachService.applyTraitToDrill (THE single home)
//   selfMoralePerWeek/othersMoralePerWeek/moraleFloor
//                            → homeCampService.applyWeeklyTick
//   immuneToFiringMorale     → homeCampMarketService.fireCoach
//   postFightCondition/postFightSelfMorale → homeCampCoachService.onFightResolved
//   marketCandidateBonus     → homeCampMarketService.rollCandidates
const COACH_TRAITS = Object.freeze({
    GRIZZLED_VET: Object.freeze({ name: "Grizzled Vet", desc: "−10% wage", caution: false, wageMult: 0.90 }),
    JOURNEYMAN: Object.freeze({ name: "Journeyman", desc: "−50% hire fee", caution: false, hireMult: 0.50 }),
    PRODIGY: Object.freeze({ name: "Prodigy", desc: "−15% rank-up requirements", caution: false, rankReqMult: 0.85 }),
    TASKMASTER: Object.freeze({ name: "Taskmaster", desc: "+10% XP on his sessions · loses 1 morale a week", caution: true, xpBonus: 0.10, selfMoralePerWeek: -1 }),
    PERFECTIONIST: Object.freeze({ name: "Perfectionist", desc: "+1pt move-drop odds · +1pt injury risk", caution: true, dropDelta: 1, injuryDelta: 1 }),
    SAFETY_FIRST: Object.freeze({ name: "Safety-First", desc: "−2pts injury risk · −1pt move-drop odds", caution: true, injuryDelta: -2, dropDelta: -1 }),
    NIGHT_OWL: Object.freeze({ name: "Night Owl", desc: "His flagship costs 1 less energy", caution: false, energyDelta: -1, energyFlagshipOnly: true }),
    HANDYMAN: Object.freeze({ name: "Handyman", desc: "+1 Camp Condition on every one of his sessions", caution: false, condDeltaBonus: 1 }),
    LOCKER_ROOM_LEADER: Object.freeze({ name: "Locker-Room Leader", desc: "+2 morale a week to your other coaches · they don't take the hit when you fire someone", caution: false, othersMoralePerWeek: 2, immuneToFiringMorale: true }),
    LOYAL: Object.freeze({ name: "Loyal", desc: "Never quits — morale floor 40 · +10% wage", caution: true, moraleFloor: 40, wageMult: 1.10 }),
    CORNERMAN: Object.freeze({ name: "Cornerman", desc: "+2 Camp Condition and +2 own morale after every fight", caution: false, postFightCondition: 2, postFightSelfMorale: 2 }),
    WELL_CONNECTED: Object.freeze({ name: "Well-Connected", desc: "The weekly market shows 1 extra candidate", caution: false, marketCandidateBonus: 1 }),
});
const TRAIT_KEYS = Object.freeze(Object.keys(COACH_TRAITS));
/** Every effect key a trait is allowed to declare. An unknown key fails the boot (rule 4). */
const TRAIT_EFFECT_KEYS = Object.freeze([
    "wageMult", "hireMult", "rankReqMult", "xpBonus", "selfMoralePerWeek",
    "dropDelta", "injuryDelta", "energyDelta", "energyFlagshipOnly", "condDeltaBonus",
    "othersMoralePerWeek", "immuneToFiringMorale", "moraleFloor",
    "postFightCondition", "postFightSelfMorale", "marketCandidateBonus",
]);

// ── PHASE 1: the weekly trainer market ───────────────────────────────────────
/** Effective camp tier below this → the market is closed (403 market_locked). */
const MARKET_MIN_TIER = 2;
const MARKET_CANDIDATES = 3;              // +1 while a Well-Connected coach is on the roster
const MARKET_MAX_PER_DOMAIN = 2;
const HOME_CAMP_WEEK_MS = 604_800_000;
/**
 * Epoch weeks start on a Thursday; +3 days shifts every boundary to Monday 00:00 UTC, which is
 * when the weekly wage/morale job runs. ONE weekly heartbeat: the market resets and the wages
 * are debited on the same tick, so "resets in 4 days" and "next wage in 4 days" agree.
 */
const HOME_CAMP_WEEK_OFFSET_MS = 3 * 86_400_000;
const MARKET_NAME_REDRAW_TRIES = 10;
/** Sums to exactly 100 (validated). Ineligible rarities are REMOVED and the rest RENORMALISED. */
const MARKET_RARITY_ODDS = Object.freeze({ COMMON: 55, UNCOMMON: 30, RARE: 12, LEGENDARY: 3 });
/**
 * Who can even appear. LEGENDARY is DUAL-gated (camp tier 4 AND fame) — and note that the 3%
 * is never folded into Common for an ineligible player: the weights are renormalised over the
 * eligible set, so an Amateur's Common/Uncommon odds are 55/30 → 64.7/35.3, not 58/30.
 */
const RARITY_GATES = Object.freeze({
    COMMON: Object.freeze({ minTier: 1, minFameTier: null }),
    UNCOMMON: Object.freeze({ minTier: 1, minFameTier: null }),
    RARE: Object.freeze({ minTier: 2, minFameTier: null }),
    LEGENDARY: Object.freeze({ minTier: 4, minFameTier: "RISING_STAR" }),
});
/** Firing locks the freed slot for a week — a fire/hire churn loop is not a strategy. */
const SLOT_COOLDOWN_DAYS = 7;
/**
 * Move drops from a COACH drill prefer that coach's own teach pool. 1.0 = "always prefer the
 * pool when the rolled rarity allows it, otherwise fall back to the catalog"
 * (specialMovesService.rollCampMoveDrop filters rarity FIRST, so this can never grant a move
 * above the rolled rarity). open_mat stays 0 — the unbiased control.
 */
const FLAGSHIP_POOL_BIAS = 1.0;
/**
 * The key of the 5th, LEGENDARY-only drill each archetype carries. Stored on the coach subdoc
 * at generation (`exclusiveSessionKey`); PHASE 2 registers the actual drills below.
 *
 * PHASE 2 (P2-D4): the masterclass IS advertised on the hire card, locked at Rank 4. It falls
 * out free — `buildCandidateView` renders `buildDrillViews`, which now iterates `drillsForCoach`
 * — and a visible, locked 5th card is exactly the goal a $5,000 signing should be selling.
 */
const LEGENDARY_EXCLUSIVE_SESSIONS = Object.freeze({
    STRIKING: "legend_striking_masterclass",
    WRESTLING: "legend_wrestling_masterclass",
    BJJ: "legend_bjj_masterclass",
    CONDITIONING: "legend_conditioning_masterclass",
});

/**
 * PHASE 2 — the Legendary masterclass drills. A SEPARATE MAP, NOT part of COACH_DRILLS.
 *
 * ⚠️ DO NOT MOVE THESE INTO `COACH_DRILLS`. Shipped validator rule 5 asserts every kit is
 * EXACTLY 4 drills with the unlockRank sequence 1,1,2,3 and one `isFlagship` at index 2. A 5th
 * entry fails the boot. Keeping the masterclass in its own map is what makes "only a Legendary
 * gets a 5th card" STRUCTURAL rather than a runtime filter somebody can forget.
 *
 * ECONOMY — 20 xp / 10 energy = 2.0 xp/energy, IDENTICAL to every other flagship (18/9, 16/8).
 * A Legendary does NOT train faster. What the player buys is a WIDER SPREAD (4 stats in one
 * session), the best drop odds in the game biased to his full teach pool, at twice the
 * condition cost (−2). Raising `xpBase` here turns a payoff into power creep — the lever for
 * "the masterclass is too strong" is the drop odds or the condition cost, never the XP.
 *
 * `isFlagship: false` is DELIBERATE, twice over:
 *   1. NIGHT_OWL's `energyFlagshipOnly` −1 energy discount must NOT apply to it (the card
 *      would advertise 9 and the resolver would charge 9 — but the masterclass is not the
 *      drill that trait was priced against).
 *   2. Rule 5's "exactly one isFlagship, at index 2" stays true for the 4-drill kit.
 *
 * CONDITIONING's `family: "bag"` follows the injuryPct>0 ⇒ blockable rule (rule 6's reasoning:
 * `family`'s ONLY job is to pick the injury block, and a 5%-injury drill must be blockable).
 * Do not "correct" it to "none".
 */
const LEGENDARY_EXCLUSIVE_DRILLS = Object.freeze({
    STRIKING: Object.freeze({
        key: "legend_striking_masterclass", name: "Championship Camp Rounds", unlockRank: 4,
        energy: 10, stats: Object.freeze(["STR", "SPD", "CHN", "FIQ"]), xpBase: 20,
        injuryPct: 7, dropPct: 8, condDelta: -2, family: "spar",
        isFlagship: false, isExclusive: true,
        description: "The room he ran for world champions, rebuilt around you. Four disciplines, one brutal hour.",
    }),
    WRESTLING: Object.freeze({
        key: "legend_wrestling_masterclass", name: "The Olympic Room", unlockRank: 4,
        energy: 10, stats: Object.freeze(["WRE", "GND", "STR", "CHN"]), xpBase: 20,
        injuryPct: 7, dropPct: 8, condDelta: -2, family: "spar",
        isFlagship: false, isExclusive: true,
        description: "Whistle, mat, no water break. The room that made his medallists, and it does not care who you are.",
    }),
    BJJ: Object.freeze({
        key: "legend_bjj_masterclass", name: "Black Belt Invitational", unlockRank: 4,
        energy: 10, stats: Object.freeze(["GND", "SUB", "WRE", "FIQ"]), xpBase: 20,
        injuryPct: 6, dropPct: 8, condDelta: -2, family: "spar",
        isFlagship: false, isExclusive: true,
        description: "He makes the calls and the room shows up. Everyone on the mat is better than you — that is the point.",
    }),
    CONDITIONING: Object.freeze({
        key: "legend_conditioning_masterclass", name: "The Altitude Block", unlockRank: 4,
        energy: 10, stats: Object.freeze(["CHN", "FIQ", "STR", "SPD"]), xpBase: 20,
        injuryPct: 5, dropPct: 6, condDelta: -2, family: "bag",
        isFlagship: false, isExclusive: true,
        description: "Thin air, thick lungs. A full block of work at the edge of what your body will agree to.",
    }),
});

/** key → masterclass def. Built once; the ONLY resolution path is by the coach's stored key. */
const LEGENDARY_EXCLUSIVE_DRILLS_BY_KEY = Object.freeze(
    Object.values(LEGENDARY_EXCLUSIVE_DRILLS).reduce((acc, d) => { acc[d.key] = d; return acc; }, Object.create(null))
);

// ── PHASE 1: morale & wages ──────────────────────────────────────────────────
// Tuning target (design: "months of total neglect"): an absent player with 2 coaches takes
// −5 (unpaid) −3 (unused) = −8/wk, doubling once condition falls under 20 (~week 2), so
// 100 → 0 lands around week 8. An ACTIVE player takes zero decay: paying wages and running
// one session a week with each coach cancels both negatives outright.
const MORALE_MAX = 100;
const MORALE_START = 100;
const MORALE_WAGE_UNPAID = -5;          // per unpaid week, every coach
const MORALE_UNUSED_SESSIONS = -3;      // per week a coach ran zero sessions
const MORALE_XP_HALVED_BELOW = 30;      // halves the coach XP BONUS, never the base multiplier
const MORALE_NEED_THRESHOLD = 70;       // COACH_MORALE_LOW fires below this — 70 points of warning
const MORALE_QUIT_AT = 0;
const MORALE_FIRE_HIT_OTHERS = -10;
const CONDITION_FIRE_HIT = -15;
const CONDITION_DOUBLE_DECAY_BELOW = 20;  // a squalid camp accelerates the spiral
const CONDITION_UNPAID_PER_WEEK = -5;     // compounds × consecutiveUnpaidWeeks
const CONDITION_UNPAID_MAX_MULT = 4;      // capped at −20/wk
/** Ceiling on a single weekly catch-up, so a returning player's back-wages bill is bounded. */
const MAX_WEEKLY_CATCHUP = 8;
const DEEP_CLEAN_COST = 300;
const DEEP_CLEAN_GAIN = 40;

// ── PHASE 1: renovation ──────────────────────────────────────────────────────
// Tiers 3/4 are floored by promotion tier (TIER_FLOOR_BY_PROMOTION), so in practice only
// 1→2 is ever bought. null = "this tier is not purchasable".
const RENOVATIONS = Object.freeze({
    2: Object.freeze({ cost: 2000, wins: 3, grants: "Unlocks a 2nd coach slot and opens the Trainer Market" }),
    3: null,
    4: null,
});

// ── Style → starting domain ──────────────────────────────────────────────────
// Keys must match gameConstants.STYLES exactly.
const STYLE_TO_DOMAIN = Object.freeze({
    "Boxer": "STRIKING",
    "Kickboxer": "STRIKING",
    "Muay Thai": "STRIKING",
    "Capoeira": "STRIKING",
    "Wrestler": "WRESTLING",
    "Judo": "WRESTLING",
    "Brazilian Jiu-Jitsu": "BJJ",
    "Sambo": "BJJ",
});

const DEFAULT_DOMAIN = "STRIKING";

// ── Gym → domain map (migration D2) ──────────────────────────────────────────
// A WRONG ENTRY HERE CONVERTS A LIVE RANK-4 PLAYER INTO THE WRONG DOMAIN. All 10 paid
// slugs are verified against data/gyms.json and the boot assertion below re-checks it.
//
// `elite-fight-academy` maps to null DELIBERATELY: it trains all 8 stats, so it carries no
// domain signal. When the head-coach gym resolves to null we fall back to
// STYLE_TO_DOMAIN[fighter.style], so an all-rounder gym never hands a BJJ specialist a
// striking coach. `community-mma` is the free gym and never converts.
const GYM_SLUG_TO_DOMAIN = Object.freeze({
    "iron-fist-boxing": "STRIKING",     // STR, SPD, CHN
    "dragon-kickboxing": "STRIKING",    // STR, LEG, SPD
    "warrior-muay-thai": "STRIKING",    // LEG, STR, CHN
    "precision-mma-lab": "STRIKING",    // SPD, FIQ, CHN
    "apex-wrestling": "WRESTLING",      // WRE, STR, GND
    "titan-performance": "WRESTLING",   // STR, WRE, CHN
    "gracie-ground-game": "BJJ",        // GND, SUB
    "renzo-combat": "BJJ",              // SUB, WRE, FIQ
    "the-war-room": "BJJ",              // FIQ, GND, SUB
    "elite-fight-academy": null,        // all 8 stats — falls back to style
    "community-mma": null,              // free gym — never converts
});

// ── Names ────────────────────────────────────────────────────────────────────
// PHASE 0 uses FIXED starter names — no RNG. That is the anti-reroll guarantee: a player
// cannot delete and re-read their camp to fish for a better starter. Random generation
// (data/coachNames.json) is PHASE 1 and market-only.
const STARTER_COACH_NAMES = Object.freeze({
    STRIKING: "Tommy Vasquez",
    WRESTLING: "Viktor Petrov",
    BJJ: "Danny Reyes",
    CONDITIONING: "Marcus Cole",
});

// ── Misc limits ──────────────────────────────────────────────────────────────
const CAMP_NAME_MIN = 3;
const CAMP_NAME_MAX = 28;
/** Hard ceiling on a single train request, independent of energy (matches trainingService.MAX_BATCH). */
const MAX_BATCH = 25;

// ── Helpers (data lookups, no game logic) ────────────────────────────────────

/** Condition band for a raw 0–100 value. Always returns a band (clamps out of range). */
function conditionBandFor(value) {
    const v = Math.max(0, Math.min(CONDITION_MAX, Number(value) || 0));
    return CONDITION_BANDS.find((b) => v >= b.min && v <= b.max) || CONDITION_BANDS[CONDITION_BANDS.length - 1];
}

/**
 * The ordered drill kit for an archetype, as FRESH shallow copies (stats arrays copied too).
 * The stored kits are frozen; handing out copies means a request handler can decorate a drill
 * with canTrain/blockedReason without leaking that state into the next request.
 */
function drillsForArchetype(archetype) {
    const kit = COACH_DRILLS[archetype] || [];
    return kit.map((d) => ({ ...d, stats: [...d.stats] }));
}

/** Fresh copy of a single drill from an archetype kit, or null. */
function drillFor(archetype, drillKey) {
    const d = (COACH_DRILLS[archetype] || []).find((x) => x.key === drillKey);
    return d ? { ...d, stats: [...d.stats] } : null;
}

// ── PHASE 2: the Legendary masterclass + the teach channel (data lookups only) ────

/** Fresh copy of an archetype's masterclass drill, or null. */
function exclusiveDrillFor(archetype) {
    const d = hasOwnKey(LEGENDARY_EXCLUSIVE_DRILLS, archetype) ? LEGENDARY_EXCLUSIVE_DRILLS[archetype] : null;
    return d ? { ...d, stats: [...d.stats] } : null;
}

/**
 * EVERY drill this coach has — his 4-drill kit, plus the masterclass if HE carries one.
 * Length 4 for anyone but a Legendary, 5 for a Legendary. Fresh copies throughout.
 *
 * ⚠️ THIS, not `drillsForArchetype`, is what `buildDrillViews` iterates. Resolution is by the
 * coach's OWN stored `exclusiveSessionKey`, never by his archetype: archetype is a property of
 * the ROLE, the masterclass is a property of the INDIVIDUAL, and conflating them is how a
 * Common Striking coach ends up rendering a card he can never train.
 */
function drillsForCoach(coach) {
    const kit = drillsForArchetype(coach && coach.archetype);
    const key = coach && coach.exclusiveSessionKey;
    if (typeof key === "string" && key && hasOwnKey(LEGENDARY_EXCLUSIVE_DRILLS_BY_KEY, key)) {
        const ex = LEGENDARY_EXCLUSIVE_DRILLS_BY_KEY[key];
        kit.push({ ...ex, stats: [...ex.stats] });
    }
    return kit;
}

/**
 * ⚠️ THE ONLY WAY `runDrill` RESOLVES A COACH DRILL. Fresh copy, or null.
 *
 * The masterclass branch gates on `coach.exclusiveSessionKey === drillKey` — NEVER on
 * archetype. THE CLIENT PICKS `drillKey`, so this input is hostile by definition: if this
 * resolved by archetype, a COMMON Striking coach's owner could POST
 * "legend_striking_masterclass" and train the best drill in the game for free. Returning null
 * here is what makes that a 400 `unknown_drill` that spends ZERO energy (resolution happens
 * before `deductBatchEnergy`).
 */
function drillForCoach(coach, drillKey) {
    if (!coach || typeof drillKey !== "string" || drillKey.length === 0) return null;
    const kitDrill = drillFor(coach.archetype, drillKey);
    if (kitDrill) return kitDrill;
    // Masterclass: HIS key, matched against itself. Not the archetype's.
    if (coach.exclusiveSessionKey === drillKey && hasOwnKey(LEGENDARY_EXCLUSIVE_DRILLS_BY_KEY, drillKey)) {
        const ex = LEGENDARY_EXCLUSIVE_DRILLS_BY_KEY[drillKey];
        return { ...ex, stats: [...ex.stats] };
    }
    return null;
}

/**
 * The teach-pool INDICES a given rank unlocks for THIS coach — pool-order indices whose
 * `TEACH_RANK_BY_SLOT` value equals `rank`, bounded by the coach's own pool length.
 *
 * The pool is ALREADY rarity-sliced at generation (`DOMAIN_TEACH_POOLS[d].slice(0, breadth)`),
 * so the bound is the whole rarity gate — no rarity check is needed or wanted here:
 *   COMMON(1):    R2 → [0]   R4 → []
 *   UNCOMMON(2):  R2 → [0]   R4 → [1]
 *   RARE(3):      R2 → [0]   R4 → [1,2]
 *   LEGENDARY(n): R2 → [0]   R4 → [1..n-1]
 *
 * RANK 3 IS ALWAYS []. That is not an oversight: rank 3 is the +5% XP payoff, and giving it a
 * move too would leave rank 4 with nothing but the perk.
 */
function teachSlotsForRank(coach, rank) {
    const r = Number(rank);
    const pool = Array.isArray(coach && coach.teachPoolMoveIds) ? coach.teachPoolMoveIds : [];
    const out = [];
    for (let i = 0; i < pool.length; i++) {
        if ((TEACH_RANK_BY_SLOT[i] ?? COACH_MAX_RANK) === r) out.push(i);
    }
    return out;
}

/** Fresh copy of the fallback (open mat) drill. */
function fallbackDrill() {
    return { ...FALLBACK_DRILL, stats: [...FALLBACK_DRILL.stats] };
}

/**
 * The rank-4 perk an archetype grants, as a FRESH copy, or null.
 * @returns {{key:string,name:string,effect:string}|null}
 */
function perkForArchetype(archetype) {
    const a = COACH_ARCHETYPES[archetype];
    if (!a || !a.perkKey) return null;
    const p = GYM_PERK_CATALOG[a.perkKey];
    if (!p) return null;
    return { key: p.key, name: p.name, effect: p.effect };
}

/** UTC day key "YYYY-MM-DD" — the idempotency unit for condition decay. */
function utcDayKey(date = new Date()) {
    return new Date(date).toISOString().slice(0, 10);
}

/** Own-property test — a key read out of Mongo (traitKey, archetype) is never trusted. */
const hasOwnKey = (obj, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);

/**
 * The raw trait definition (frozen) or null. Internal — services read effect keys off this.
 * Prototype-safe: a stored traitKey of "constructor" resolves to null, not to Object.
 */
function traitDef(traitKey) {
    return hasOwnKey(COACH_TRAITS, traitKey) ? COACH_TRAITS[traitKey] : null;
}

/**
 * The player-facing trait chip, as a FRESH copy — `{key,name,desc,caution}` and nothing else.
 * Effect numbers are deliberately NOT shipped: the drill/price numbers in the payload are
 * already trait-adjusted, so sending the raw modifiers would invite the UI to apply them twice.
 * @returns {{key:string,name:string,desc:string,caution:boolean}|null}
 */
function traitView(traitKey) {
    const t = traitDef(traitKey);
    if (!t) return null;
    return { key: traitKey, name: t.name, desc: t.desc, caution: !!t.caution };
}

/** Fresh copy of a rarity's economics, or COMMON's for an unknown rarity. */
function rarityEconomics(rarity) {
    const e = hasOwnKey(RARITY_ECONOMICS, rarity) ? RARITY_ECONOMICS[rarity] : RARITY_ECONOMICS.COMMON;
    return { ...e };
}

/** Fresh copy of a renovation step, or null when that tier isn't purchasable. */
function renovationFor(tier) {
    const r = RENOVATIONS[tier];
    return r ? { ...r } : null;
}

/**
 * Monday-aligned week index — THE heartbeat of the whole Phase-1 economy: the market resets,
 * the wages are debited and the morale tick runs on the same boundary.
 *
 * Epoch weeks begin on a Thursday, so +3 days moves every boundary to Monday 00:00 UTC.
 * Pure date math with no state, which is what lets the weekly job be idempotent by simple
 * compare-and-set on lastWeeklyTickIndex.
 */
function homeCampWeekIndex(now = Date.now()) {
    return Math.floor((Number(now) + HOME_CAMP_WEEK_OFFSET_MS) / HOME_CAMP_WEEK_MS);
}

/** Start instant (Monday 00:00 UTC) of a given week index. */
function homeCampWeekStart(weekIndex) {
    return new Date(Number(weekIndex) * HOME_CAMP_WEEK_MS - HOME_CAMP_WEEK_OFFSET_MS);
}

/** End instant of a week index — i.e. the start of the next one. */
function homeCampWeekEnd(weekIndex) {
    return homeCampWeekStart(Number(weekIndex) + 1);
}

// ── Boot validation ──────────────────────────────────────────────────────────

/**
 * Fail the process at require-time rather than at a live request. Asserts:
 *  - every teach-pool move id exists in SPECIAL_MOVES_BY_ID
 *  - every relevantWinTypes entry exists in FIGHT_OUTCOMES
 *  - every STYLE_TO_DOMAIN key exists in STYLES (and maps to a real archetype)
 *  - every slug in data/gyms.json has a GYM_SLUG_TO_DOMAIN entry (value may be null)
 *  - every drill stat exists in STAT_NAMES, and drill keys are globally unique
 */
function validateHomeCampConfig() {
    const styleKeys = new Set(Object.keys(STYLES));
    const statSet = new Set(STAT_NAMES);
    const outcomeSet = new Set(FIGHT_OUTCOMES);
    const fail = (msg) => { throw new Error(`[homeCampConfig] ${msg}`); };

    for (const [domain, ids] of Object.entries(DOMAIN_TEACH_POOLS)) {
        if (!COACH_ARCHETYPES[domain]) fail(`teach pool for unknown archetype "${domain}"`);
        for (const id of ids) {
            if (!SPECIAL_MOVES_BY_ID[id]) fail(`teach pool ${domain} references unknown move id "${id}"`);
        }
    }

    // The rank-4 perk must resolve to a REAL gym perk, or a player pays for nothing.
    if (Object.keys(GYM_PERK_CATALOG).length === 0) {
        fail("GYM_PERK_CATALOG is empty — data/gyms.json rank-4 perk unlocks could not be read");
    }
    const seenPerks = new Map();
    for (const [key, a] of Object.entries(COACH_ARCHETYPES)) {
        for (const o of a.relevantWinTypes) {
            if (!outcomeSet.has(o)) fail(`archetype ${key} relevantWinType "${o}" is not in FIGHT_OUTCOMES`);
        }
        for (const s of a.cluster) {
            if (!statSet.has(s)) fail(`archetype ${key} cluster stat "${s}" is not in STAT_NAMES`);
        }
        if (!a.perkKey) fail(`archetype ${key} has no perkKey — rank 4 would grant nothing`);
        if (!GYM_PERK_CATALOG[a.perkKey]) {
            fail(`archetype ${key} perkKey "${a.perkKey}" is not a rank-4 perk in data/gyms.json`);
        }
        if (seenPerks.has(a.perkKey)) {
            fail(`archetype ${key} shares perkKey "${a.perkKey}" with ${seenPerks.get(a.perkKey)}`);
        }
        seenPerks.set(a.perkKey, key);
    }

    for (const [style, domain] of Object.entries(STYLE_TO_DOMAIN)) {
        if (!styleKeys.has(style)) fail(`STYLE_TO_DOMAIN key "${style}" is not in gameConstants.STYLES`);
        if (!COACH_ARCHETYPES[domain]) fail(`STYLE_TO_DOMAIN["${style}"] → unknown archetype "${domain}"`);
    }

    // Gym slug coverage — the top migration risk. Read the raw JSON (not the Mongo
    // collection) so this runs at boot without a DB connection.
    let gyms = [];
    try {
        gyms = require("../data/gyms.json");
    } catch (e) {
        fail(`could not load data/gyms.json for slug validation: ${e.message}`);
    }
    for (const g of gyms) {
        if (!g || !g.slug) continue;
        if (!(g.slug in GYM_SLUG_TO_DOMAIN)) {
            fail(`gym slug "${g.slug}" has no GYM_SLUG_TO_DOMAIN entry (add it, value may be null)`);
        }
        const d = GYM_SLUG_TO_DOMAIN[g.slug];
        if (d !== null && !COACH_ARCHETYPES[d]) fail(`GYM_SLUG_TO_DOMAIN["${g.slug}"] → unknown archetype "${d}"`);
    }

    const seenKeys = new Set([FALLBACK_DRILL.key]);
    for (const [archetype, kit] of Object.entries(COACH_DRILLS)) {
        if (!COACH_ARCHETYPES[archetype]) fail(`drill kit for unknown archetype "${archetype}"`);

        // RULE 5 — every archetype ships a COMPLETE kit. Until Phase 1 only STARTER_DOMAINS
        // were checked, which is exactly how CONDITIONING shipped as an empty array: a
        // hireable coach whose card would have rendered zero drills.
        if (kit.length !== 4) fail(`archetype ${archetype} must have exactly 4 drills, has ${kit.length}`);
        const unlockSeq = kit.map((d) => d.unlockRank).join(",");
        if (unlockSeq !== "1,1,2,3") fail(`archetype ${archetype} unlockRank sequence must be 1,1,2,3 (got ${unlockSeq})`);
        const flagshipIdx = kit.map((d, i) => (d.isFlagship ? i : -1)).filter((i) => i >= 0);
        if (flagshipIdx.length !== 1 || flagshipIdx[0] !== 2) {
            fail(`archetype ${archetype} must have exactly one isFlagship drill at index 2 (got [${flagshipIdx}])`);
        }

        for (const d of kit) {
            if (seenKeys.has(d.key)) fail(`duplicate drill key "${d.key}"`);
            seenKeys.add(d.key);
            for (const s of d.stats) {
                if (!statSet.has(s)) fail(`drill ${d.key} stat "${s}" is not in STAT_NAMES`);
            }
            if (!(d.injuryPct >= 0 && d.injuryPct <= 100)) fail(`drill ${d.key} injuryPct out of range`);
            if (!(d.dropPct >= 0 && d.dropPct <= 100)) fail(`drill ${d.key} dropPct out of range`);
            if (!(d.energy > 0)) fail(`drill ${d.key} energy must be > 0`);
            if (!["spar", "bag", "none"].includes(d.family)) fail(`drill ${d.key} unknown family "${d.family}"`);

            // RULE 6 — `family` exists ONLY to pick the injury block, so a drill that can hurt
            // you must be blockable. family:"none" + injuryPct>0 = an injured fighter can keep
            // aggravating the same injury with no gate at all.
            if (d.injuryPct > 0 && d.family === "none") {
                fail(`drill ${d.key} has injuryPct ${d.injuryPct} but family "none" — an injurious drill must be blockable`);
            }

            // RULE 7 — a statless drill must be an honest one: it earns no XP, and it does
            // something else instead (max stamina or condition). Otherwise it is a button that
            // spends energy for nothing.
            if (d.stats.length === 0) {
                if (d.xpBase !== 0) fail(`drill ${d.key} has no stats but xpBase ${d.xpBase} — that XP goes nowhere`);
                if (!d.raisesMaxStamina && d.condDelta === 0) {
                    fail(`drill ${d.key} has no stats, no maxStamina gain and no condition effect — it does nothing`);
                }
            }
        }
    }
    for (const s of FALLBACK_DRILL.stats) {
        if (!statSet.has(s)) fail(`fallback drill stat "${s}" is not in STAT_NAMES`);
    }

    for (const t of Object.keys(CAMP_TIERS)) {
        if (!CAMP_TIERS[t].dropKey) fail(`tier ${t} missing dropKey`);
    }
    for (const [tier, floor] of Object.entries(TIER_FLOOR_BY_PROMOTION)) {
        if (!CAMP_TIERS[floor]) fail(`TIER_FLOOR_BY_PROMOTION["${tier}"] → unknown tier ${floor}`);
    }
    for (const d of STARTER_DOMAINS) {
        if (!COACH_ARCHETYPES[d]) fail(`STARTER_DOMAINS entry "${d}" is not an archetype`);
        if (!STARTER_COACH_NAMES[d]) fail(`STARTER_DOMAINS entry "${d}" has no starter name`);
        if (!(COACH_DRILLS[d] || []).length) fail(`STARTER_DOMAINS entry "${d}" has an empty drill kit`);
    }
    if (COACH_RANK_LABELS.length !== COACH_MAX_RANK) fail("COACH_RANK_LABELS must have COACH_MAX_RANK entries");

    // ── PHASE 1 ─────────────────────────────────────────────────────────────
    // Everything below guards a number that MOVES REAL PLAYER CASH or decides who quits.
    // A typo here is not a cosmetic bug, so it fails the boot rather than a live request.

    // RULE 1 — the market odds must be a real distribution.
    const oddsKeys = Object.keys(MARKET_RARITY_ODDS);
    const oddsSum = oddsKeys.reduce((s, k) => s + MARKET_RARITY_ODDS[k], 0);
    if (oddsSum !== 100) fail(`MARKET_RARITY_ODDS must sum to exactly 100 (got ${oddsSum})`);
    for (const k of oddsKeys) {
        if (!COACH_RARITIES.includes(k)) fail(`MARKET_RARITY_ODDS key "${k}" is not a coach rarity`);
        if (!(MARKET_RARITY_ODDS[k] > 0)) fail(`MARKET_RARITY_ODDS["${k}"] must be > 0`);
    }

    // RULE 2 — displayed price == charged price starts here: every fee/wage is RE-DERIVED
    // from the base × multiplier, so a hand-edited table can never quote one number and
    // debit another.
    for (const r of COACH_RARITIES) {
        const e = RARITY_ECONOMICS[r];
        if (!e) fail(`RARITY_ECONOMICS missing rarity "${r}"`);
        const expectedFee = Math.round(COACH_BASE_HIRE_FEE * e.hireMult);
        const expectedWage = Math.round(COACH_BASE_WAGE * e.wageMult);
        if (e.hireFee !== expectedFee) fail(`RARITY_ECONOMICS.${r}.hireFee ${e.hireFee} !== round(${COACH_BASE_HIRE_FEE} * ${e.hireMult}) = ${expectedFee}`);
        if (e.wage !== expectedWage) fail(`RARITY_ECONOMICS.${r}.wage ${e.wage} !== round(${COACH_BASE_WAGE} * ${e.wageMult}) = ${expectedWage}`);
    }

    // RULE 3 — the gates must reference tiers and fame tiers that exist.
    const fameTierSet = new Set(NOTORIETY_TIER_KEYS);
    for (const r of COACH_RARITIES) {
        const g = RARITY_GATES[r];
        if (!g) fail(`RARITY_GATES missing rarity "${r}"`);
        if (!(g.minTier >= 1 && g.minTier <= MAX_CAMP_TIER)) fail(`RARITY_GATES.${r}.minTier ${g.minTier} out of 1..${MAX_CAMP_TIER}`);
        if (g.minFameTier !== null && !fameTierSet.has(g.minFameTier)) {
            fail(`RARITY_GATES.${r}.minFameTier "${g.minFameTier}" is not in notorietyConfig.TIER_KEYS`);
        }
    }

    // RULE 4 — traits: complete, described, and no effect key without an implementation.
    if (TRAIT_KEYS.length !== 12) fail(`COACH_TRAITS must define exactly 12 traits (got ${TRAIT_KEYS.length})`);
    const effectSet = new Set(TRAIT_EFFECT_KEYS);
    for (const key of TRAIT_KEYS) {
        const t = COACH_TRAITS[key];
        if (!t.name || typeof t.name !== "string") fail(`trait ${key} has no name`);
        if (!t.desc || typeof t.desc !== "string") fail(`trait ${key} has no desc`);
        if (typeof t.caution !== "boolean") fail(`trait ${key} must declare caution:true|false`);
        for (const k of Object.keys(t)) {
            if (k === "name" || k === "desc" || k === "caution") continue;
            // An unrecognised key is a trait effect NOBODY IMPLEMENTS — it would render in the
            // chip text and do nothing.
            if (!effectSet.has(k)) fail(`trait ${key} declares unknown effect key "${k}"`);
        }
    }

    // RULE 8 — renovations.
    for (const [tierStr, r] of Object.entries(RENOVATIONS)) {
        const t = Number(tierStr);
        if (!(t >= 2 && t <= MAX_CAMP_TIER)) fail(`RENOVATIONS key ${tierStr} must be 2..${MAX_CAMP_TIER}`);
        if (r === null) continue;
        if (!(r.cost > 0)) fail(`RENOVATIONS[${t}].cost must be > 0`);
        if (!(r.wins >= 0)) fail(`RENOVATIONS[${t}].wins must be >= 0`);
        if (!r.grants) fail(`RENOVATIONS[${t}] must say what it grants`);
    }

    // RULE 9 — every archetype has an exclusive-session key reserved.
    //
    // ⚠️ INVERTED IN PHASE 2. This rule used to also assert "must NOT collide with a real drill
    // key", because Phase 1 stored the keys without building the drills. PHASE 2 REGISTERS THESE
    // AS REAL DRILLS, so that assertion is now false by design — it moved into RULE 11, which
    // asserts the opposite direction: the key must be unique against the 4-drill kits and the
    // fallback (i.e. it may not SHADOW a kit drill), and then joins `seenKeys` itself. The guard
    // was inverted, not dropped: a masterclass key colliding with `live_rolling` still fails the
    // boot, it just fails from rule 11 now.
    for (const a of ARCHETYPE_KEYS) {
        if (!LEGENDARY_EXCLUSIVE_SESSIONS[a]) fail(`LEGENDARY_EXCLUSIVE_SESSIONS missing archetype "${a}"`);
    }

    // RULE 11 — the Legendary masterclass drills (PHASE 2). These are REAL drills living in a
    // SEPARATE map, because rule 5 (exactly-4 kits, unlockRank 1,1,2,3, one flagship at index 2)
    // would reject a 5th kit entry. Everything rule 5/6/7 guarantees for a kit drill is asserted
    // here for the masterclass, plus the two invariants that make it a masterclass at all:
    // it unlocks at MAX rank, and it is NOT a flagship (so NIGHT_OWL's flagship-only energy
    // discount can never apply to it — the hire card would advertise a price we don't charge).
    for (const a of ARCHETYPE_KEYS) {
        const d = LEGENDARY_EXCLUSIVE_DRILLS[a];
        if (!d) fail(`LEGENDARY_EXCLUSIVE_DRILLS missing archetype "${a}"`);
        if (d.key !== LEGENDARY_EXCLUSIVE_SESSIONS[a]) {
            fail(`LEGENDARY_EXCLUSIVE_DRILLS.${a}.key "${d.key}" !== LEGENDARY_EXCLUSIVE_SESSIONS.${a} "${LEGENDARY_EXCLUSIVE_SESSIONS[a]}" — a coach's stored exclusiveSessionKey would resolve to nothing`);
        }
        if (seenKeys.has(d.key)) fail(`LEGENDARY_EXCLUSIVE_DRILLS.${a} key "${d.key}" collides with an existing drill key`);
        seenKeys.add(d.key);
        if (!Array.isArray(d.stats) || d.stats.length === 0) fail(`masterclass ${d.key} must train at least one stat`);
        for (const s of d.stats) {
            if (!statSet.has(s)) fail(`masterclass ${d.key} stat "${s}" is not in STAT_NAMES`);
        }
        if (!(d.energy > 0)) fail(`masterclass ${d.key} energy must be > 0`);
        if (!(d.injuryPct >= 0 && d.injuryPct <= 100)) fail(`masterclass ${d.key} injuryPct out of range`);
        if (!(d.dropPct >= 0 && d.dropPct <= 100)) fail(`masterclass ${d.key} dropPct out of range`);
        if (!["spar", "bag", "none"].includes(d.family)) fail(`masterclass ${d.key} unknown family "${d.family}"`);
        if (d.injuryPct > 0 && d.family === "none") {
            fail(`masterclass ${d.key} has injuryPct ${d.injuryPct} but family "none" — an injurious drill must be blockable`);
        }
        if (d.unlockRank !== COACH_MAX_RANK) {
            fail(`masterclass ${d.key} must unlock at rank ${COACH_MAX_RANK} (got ${d.unlockRank})`);
        }
        if (d.isFlagship !== false) {
            fail(`masterclass ${d.key} must set isFlagship:false — NIGHT_OWL's flagship-only energy discount must not apply to it`);
        }
        if (d.isExclusive !== true) fail(`masterclass ${d.key} must set isExclusive:true`);
        if (!d.description) fail(`masterclass ${d.key} must carry a description`);
    }

    // RULE 12 — THE TEACH CEILING. For every domain pool and every coach rarity, every slot
    // that rarity can ever reach must hold a move whose catalog `minRarity` is at or below that
    // rarity.
    //
    // THIS IS WHAT KEEPS "Signatures are Rare+ only" TRUE BY CONSTRUCTION. The teach channel
    // grants pool[i] to a coach of rarity R whenever i < breadth(R) — there is no per-move
    // rarity gate at grant time, only this shape. So if somebody reorders a pool and moves
    // THE_FINISHER (a Rare Signature) to index 0, EVERY Common coach in the game would start
    // teaching a Signature. This rule turns that edit into a boot failure instead of a silent
    // economy break.
    for (const [domain, pool] of Object.entries(DOMAIN_TEACH_POOLS)) {
        for (const R of COACH_RARITIES) {
            const breadth = TEACH_BREADTH_BY_RARITY[R];
            if (breadth === undefined) fail(`TEACH_BREADTH_BY_RARITY missing rarity "${R}"`);
            const reach = Math.min(breadth, pool.length);
            for (let i = 0; i < reach; i++) {
                const def = SPECIAL_MOVES_BY_ID[pool[i]];
                if (!def) fail(`teach pool ${domain}[${i}] references unknown move id "${pool[i]}"`);
                if ((rarityRank[def.minRarity] ?? Infinity) > (rarityRank[R] ?? -1)) {
                    fail(`TEACH CEILING: a ${R} coach reaches ${domain}[${i}] "${pool[i]}" (minRarity ${def.minRarity}) — reorder the pool so slot ${i} holds a move at or below ${R}`);
                }
            }
        }
    }

    // RULE 13 — the teach ladder. Slot 0 must arrive STRICTLY EARLIER than every other slot,
    // because "your first move arrives early" is a promise the market card renders on every
    // hire. Flattening the table to all-4s would make every card lie.
    const maxPoolLen = Math.max(...Object.values(DOMAIN_TEACH_POOLS).map((p) => p.length));
    for (let i = 0; i < maxPoolLen; i++) {
        const v = TEACH_RANK_BY_SLOT[i];
        if (v === undefined) fail(`TEACH_RANK_BY_SLOT has no entry for slot ${i} (longest pool is ${maxPoolLen})`);
        if (!(Number.isInteger(v) && v >= 2 && v <= COACH_MAX_RANK)) {
            fail(`TEACH_RANK_BY_SLOT[${i}] = ${v} must be an integer in 2..${COACH_MAX_RANK}`);
        }
        if (i > 0 && !(TEACH_RANK_BY_SLOT[0] < v)) {
            fail(`TEACH_RANK_BY_SLOT[0] (${TEACH_RANK_BY_SLOT[0]}) must be strictly less than slot ${i} (${v}) — the first taught move must arrive before every other`);
        }
    }

    // RULE 10 — the morale thresholds must be ordered, or the warning fires after the coach
    // has already lost half his value (or never fires at all).
    if (!(MORALE_XP_HALVED_BELOW < MORALE_NEED_THRESHOLD && MORALE_NEED_THRESHOLD <= MORALE_MAX)) {
        fail(`morale thresholds must satisfy XP_HALVED_BELOW (${MORALE_XP_HALVED_BELOW}) < NEED_THRESHOLD (${MORALE_NEED_THRESHOLD}) <= MAX (${MORALE_MAX})`);
    }

    return true;
}

// Run at require-time — a misconfigured camp must never reach a live request.
validateHomeCampConfig();

module.exports = {
    CAMP_TIERS,
    MAX_CAMP_TIER,
    TIER_FLOOR_BY_PROMOTION,
    NEXT_SLOT_UNLOCK_TIER,
    effectiveTier,
    COACH_ARCHETYPES,
    GYM_PERK_CATALOG,
    perkForArchetype,
    ARCHETYPE_KEYS,
    STARTER_DOMAINS,
    COACH_DRILLS,
    FALLBACK_DRILL,
    CONDITION_BANDS,
    CONDITION_MAX,
    CONDITION_PENALTY_STARTS_AT,
    CONDITION_EXPLAINER,
    CONDITION_NEED_THRESHOLD,
    NEGLECT_PER_IDLE_DAY,
    NEGLECT_MAX_CATCHUP_DAYS,
    COACH_RANKS,
    COACH_MAX_RANK,
    COACH_RANK3_XP_BONUS,
    CONDITIONING_INJURY_REDUCTION_BY_RANK,
    conditioningInjuryReduction,
    COACH_RANK_LABELS,
    COACH_RARITIES,
    MAX_COACHES,
    // PHASE 1 — economics, traits, market, morale, renovation
    COACH_BASE_HIRE_FEE,
    COACH_BASE_WAGE,
    RARITY_ECONOMICS,
    rarityEconomics,
    COACH_TRAITS,
    TRAIT_KEYS,
    TRAIT_EFFECT_KEYS,
    traitDef,
    traitView,
    MARKET_MIN_TIER,
    MARKET_CANDIDATES,
    MARKET_MAX_PER_DOMAIN,
    MARKET_NAME_REDRAW_TRIES,
    MARKET_RARITY_ODDS,
    RARITY_GATES,
    SLOT_COOLDOWN_DAYS,
    FLAGSHIP_POOL_BIAS,
    LEGENDARY_EXCLUSIVE_SESSIONS,
    // PHASE 2 — the masterclass + the teach channel
    LEGENDARY_EXCLUSIVE_DRILLS,
    exclusiveDrillFor,
    drillsForCoach,
    drillForCoach,
    teachSlotsForRank,
    HOME_CAMP_WEEK_MS,
    HOME_CAMP_WEEK_OFFSET_MS,
    homeCampWeekIndex,
    homeCampWeekStart,
    homeCampWeekEnd,
    MORALE_MAX,
    MORALE_START,
    MORALE_WAGE_UNPAID,
    MORALE_UNUSED_SESSIONS,
    MORALE_XP_HALVED_BELOW,
    MORALE_NEED_THRESHOLD,
    MORALE_QUIT_AT,
    MORALE_FIRE_HIT_OTHERS,
    CONDITION_FIRE_HIT,
    CONDITION_DOUBLE_DECAY_BELOW,
    CONDITION_UNPAID_PER_WEEK,
    CONDITION_UNPAID_MAX_MULT,
    MAX_WEEKLY_CATCHUP,
    DEEP_CLEAN_COST,
    DEEP_CLEAN_GAIN,
    RENOVATIONS,
    renovationFor,
    DOMAIN_TEACH_POOLS,
    TEACH_BREADTH_BY_RARITY,
    TEACH_RANK_BY_SLOT,
    STYLE_TO_DOMAIN,
    DEFAULT_DOMAIN,
    GYM_SLUG_TO_DOMAIN,
    STARTER_COACH_NAMES,
    CAMP_NAME_MIN,
    CAMP_NAME_MAX,
    MAX_BATCH,
    conditionBandFor,
    drillsForArchetype,
    drillFor,
    fallbackDrill,
    utcDayKey,
    validateHomeCampConfig,
};
