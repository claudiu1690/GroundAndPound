/**
 * Special Moves catalog (Special Moves v2: 24 moves, 8 Passive / 10 Proc / 6 Signature).
 * Design of record: GDD §26, docs/special-moves-spec.md (v1), docs/special-moves-v2-spec.md (v2).
 *
 * Mirrors the catalog-as-consts pattern of consts/sponsorCatalog.js: a flat, static,
 * code-versioned definition of every collectible move. Player ownership/equip state
 * lives on the fighter document (models/fighterModel.js), never here.
 *
 * RARITY-SCALING MODEL: a move is ONE concept spanning multiple rarities. A player owns
 * each move at their best-pulled rarity; a higher-rarity pull UPGRADES the same concept
 * in place (see specialMovesService.grantOrUpgrade). `values` is therefore a rarity-keyed
 * table, dense from `minRarity` upward with no sub-minRarity keys.
 */

const RARITY = { COMMON: "COMMON", UNCOMMON: "UNCOMMON", RARE: "RARE", LEGENDARY: "LEGENDARY" };

const EFFECT_TYPE = { PASSIVE: "PASSIVE", PROC: "PROC", SIGNATURE: "SIGNATURE" };

/**
 * Single source of rarity ordering. Imported by the drop resolver (eligibility filter
 * and weighted pick) AND by buildMoveBonuses (best-rarity comparison). Do not duplicate.
 */
const rarityRank = { COMMON: 0, UNCOMMON: 1, RARE: 2, LEGENDARY: 3 };

const RARITY_ORDER = ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"];

/**
 * Engine bonusTypes that map to an existing hand-written branch in
 * utils/fightResolution.js resolveRound(). PASSIVE/PROC moves MUST use one of these
 * (validateCatalog enforces it). SIG_* bonusTypes are signature-only — handled by new
 * per-fight signature state, not by this allowlist.
 */
const ENGINE_BONUS_TYPES = new Set([
    "OPPONENT_DAMAGE_REDUCTION",
    "STRIKE_DAMAGE",
    "ALL_STATS",
    "BODY_DAMAGE",
    "SPRAWL_SUCCESS",
    "ESCAPE_PROBABILITY",
    "CLINCH_DAMAGE",
    "STAMINA_DRAIN",
    "GNP_DAMAGE",
    // v2 (move-exclusive; Fight Camp never emits these)
    "TAKEDOWN_SUCCESS",
    "GROUND_DAMAGE_REDUCTION",
    "SUBMISSION_SUCCESS",
    "OPPONENT_STAMINA_DRAIN",
    "FLASH_KO_RESISTANCE",
]);

/**
 * Signature bonusTypes the engine knows how to arm (per-fight one-shot, keyed by moveId in
 * resolveFight's request-local sigState). A SIGNATURE move MUST use one of these.
 */
const SIGNATURE_BONUS_TYPES = new Set([
    "SIG_FINISHER_STRIKE",
    "SIG_IRON_RECOVERY",
    "SIG_KILLER_INSTINCT",
    "SIG_FAST_START",
    "SIG_TAKEDOWN_BLITZ",
    "SIG_SUBMISSION_HUNT",
]);

/**
 * PASSIVE/PROC bonusTypes whose engine read site evaluates EACH entry's triggerCondition
 * (utils/fightResolution.js triggerGatedMoveBonus), and the gates that read site understands.
 * Every other bonusType is read first-match (`.find()`), so it may only ever be paired with ONE
 * triggerCondition across the catalog (validateCatalog enforces both rules).
 */
const MULTI_TRIGGER_BONUS_TYPES = Object.freeze({
    STRIKE_DAMAGE: new Set(["ALWAYS", "OPPONENT_STAMINA_BELOW_70", "LATE_ROUNDS"]),
});

const SPECIAL_MOVES = [
    // ── PASSIVES (always-on flat modifiers, minRarity COMMON) ──────────────────
    {
        id: "GRANITE_JAW",
        name: "Granite Jaw",
        effectType: EFFECT_TYPE.PASSIVE,
        bonusType: "OPPONENT_DAMAGE_REDUCTION",
        triggerCondition: "ALWAYS",
        minRarity: RARITY.COMMON,
        // Trimmed post-QA (2 rounds): always-on passives must each stay ~+3.5pts single-move
        // so a full 3-passive Legendary stack lands in the 5-10pt guardrail. Also collapse-
        // stacks with VETERAN_IQ (same bonusType), so the summed pair stays bounded.
        values: { COMMON: 0.008, UNCOMMON: 0.014, RARE: 0.023, LEGENDARY: 0.03 },
        flavor: "Ten thousand sparring rounds taught this chin to laugh at bad news.",
        art: "granite_jaw",
    },
    {
        id: "HEAVY_HANDS",
        name: "Heavy Hands",
        effectType: EFFECT_TYPE.PASSIVE,
        bonusType: "STRIKE_DAMAGE",
        triggerCondition: "ALWAYS",
        minRarity: RARITY.COMMON,
        // Trimmed post-QA (2 rounds): ~+3.5pt single-move ceiling; also shares the strike
        // lane with THE_FINISHER, compounding hardest on striker mirrors.
        values: { COMMON: 0.009, UNCOMMON: 0.016, RARE: 0.026, LEGENDARY: 0.035 },
        flavor: "Every punch carries bad intentions — opponents feel it before the bell rings.",
        art: "heavy_hands",
    },
    // NOTE: "Complete Package" (ALL_STATS) was CUT from v1. A Monte-Carlo sweep proved
    // ALL_STATS is untunable in this engine — it responds non-monotonically across styles
    // (e.g. +7 on Boxer but ~0 on BJJ at the same value, then spiking with a tiny bump),
    // so no value gives consistent, fair behavior. ALL_STATS is not used by any move. The
    // roster is 24 moves since v2 (8 Passive / 10 Proc / 6 Signature).
    {
        id: "BODY_SNATCHER",
        name: "Body Snatcher",
        effectType: EFFECT_TYPE.PASSIVE,
        bonusType: "BODY_DAMAGE",
        triggerCondition: "ALWAYS",
        minRarity: RARITY.COMMON,
        // Trimmed post-QA (2 rounds): always-on; kept to ~+3.5pt single-move ceiling so it
        // can't combine with other passives past the 3-stack guardrail.
        values: { COMMON: 0.016, UNCOMMON: 0.028, RARE: 0.05, LEGENDARY: 0.065 },
        flavor: "Kill the body — this fighter never forgets where the liver lives.",
        art: "body_snatcher",
    },
    {
        id: "VETERAN_IQ",
        name: "Veteran IQ",
        effectType: EFFECT_TYPE.PASSIVE,
        bonusType: "OPPONENT_DAMAGE_REDUCTION",
        triggerCondition: "ALWAYS",
        minRarity: RARITY.COMMON,
        // Trimmed post-QA (2 rounds): collapse-stacks with GRANITE_JAW (same bonusType);
        // Legendary pair now sums to ~0.058, keeping even the stacked pair inside guardrail.
        values: { COMMON: 0.007, UNCOMMON: 0.012, RARE: 0.02, LEGENDARY: 0.028 },
        flavor: "Ten years of taking a beating taught this fighter how to take less of one.",
        art: "veteran_iq",
    },
    {
        id: "HIGH_GUARD",
        name: "High Guard",
        effectType: EFFECT_TYPE.PASSIVE,
        bonusType: "OPPONENT_DAMAGE_REDUCTION",
        triggerCondition: "ALWAYS",
        minRarity: RARITY.COMMON,
        // Collapse-stacks with GRANITE_JAW / VETERAN_IQ (same bonusType + trigger). Smallest of
        // the three so the worst legal pair stays Granite Jaw + Veteran IQ (v2 spec §5).
        values: { COMMON: 0.006, UNCOMMON: 0.011, RARE: 0.019, LEGENDARY: 0.026 },
        flavor: "Hands high, chin down. Nothing clean gets through.",
        art: "high_guard",
    },
    {
        id: "DOUBLE_LEG_PRECISION",
        name: "Double-Leg Precision",
        effectType: EFFECT_TYPE.PASSIVE,
        bonusType: "TAKEDOWN_SUCCESS",
        triggerCondition: "ALWAYS",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.02, UNCOMMON: 0.035, RARE: 0.06, LEGENDARY: 0.08 },
        flavor: "The shot never misses because it was never sloppy to begin with.",
        art: "double_leg_precision",
    },
    {
        id: "FRAME_AND_BASE",
        name: "Frame & Base",
        effectType: EFFECT_TYPE.PASSIVE,
        bonusType: "GROUND_DAMAGE_REDUCTION",
        triggerCondition: "ALWAYS",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.015, UNCOMMON: 0.026, RARE: 0.044, LEGENDARY: 0.06 },
        flavor: "Flat on the back and still structurally sound. Nothing gets through the frame.",
        art: "frame_and_base",
    },
    {
        id: "PACE_PUSHER",
        name: "Pace Pusher",
        effectType: EFFECT_TYPE.PASSIVE,
        bonusType: "OPPONENT_STAMINA_DRAIN",
        triggerCondition: "ALWAYS",
        minRarity: RARITY.COMMON,
        // v2 spec §5: QUANTIZED lane. The engine rounds opponent stamina to whole points and the
        // per-round drain is an integer 8..13, so this value only does anything in rounds where
        // drain * value >= 0.5. Each rarity sits on a distinct step: 0.04 fires on drain 13 only
        // (1 round in 6), 0.042 on 12-13 (2/6), 0.046 on 11-13 (3/6), 0.05 on 10-13 (4/6).
        // Anything below 0.0385 is dead; 0.0625+ fires every round (the draft 0.16 measured
        // +8.4 pts alone on the Boxer mirror, 0.08/0.06 still +5.3..+6.3). Tune by STEP, not %.
        values: { COMMON: 0.04, UNCOMMON: 0.042, RARE: 0.046, LEGENDARY: 0.05 },
        flavor: "Every exchange costs the other guy a little more than it should.",
        art: "pace_pusher",
    },

    // ── PROCS (fire on a specific fight situation, minRarity COMMON) ────────────
    {
        id: "SPRAWL_INSTINCT",
        name: "Sprawl",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "SPRAWL_SUCCESS",
        triggerCondition: "OPPONENT_SHOOTS_TAKEDOWN",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.05, UNCOMMON: 0.09, RARE: 0.14, LEGENDARY: 0.18 },
        flavor: "The hips snap back before the brain finishes the thought: not today.",
        art: "sprawl_instinct",
    },
    {
        id: "NEVER_TAP",
        name: "Hip Escape",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "ESCAPE_PROBABILITY",
        triggerCondition: "OPPONENT_ATTEMPTS_SUBMISSION",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.04, UNCOMMON: 0.075, RARE: 0.12, LEGENDARY: 0.16 },
        flavor: "Caught in the choke and still calm. One hip escape and the grip is gone.",
        art: "never_tap",
    },
    {
        id: "CLINCH_KILLER",
        name: "Dirty Boxing",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "CLINCH_DAMAGE",
        triggerCondition: "STRIKING_EXCHANGE",
        minRarity: RARITY.COMMON,
        // Trimmed post-QA (2 rounds): a proc, but STRIKING_EXCHANGE fires nearly every round,
        // so it behaves like an always-on passive (+5.1pt single-move) — pulled to the same
        // ~+3.5pt ceiling as the true passives.
        values: { COMMON: 0.035, UNCOMMON: 0.06, RARE: 0.10, LEGENDARY: 0.14 },
        flavor: "Against the fence is exactly where this fighter wants you.",
        art: "clinch_killer",
    },
    {
        id: "SECOND_WIND",
        name: "Second Wind",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "STAMINA_DRAIN",
        triggerCondition: "PLAYER_STAMINA_BELOW_70",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.04, UNCOMMON: 0.07, RARE: 0.12, LEGENDARY: 0.16 },
        flavor: "The tank empties for everyone else. This fighter just finds another one.",
        art: "second_wind",
    },
    {
        id: "MOUNT_REAPER",
        name: "Full Mount",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "GNP_DAMAGE",
        triggerCondition: "PLAYER_TOP_POSITION",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.04, UNCOMMON: 0.07, RARE: 0.13, LEGENDARY: 0.17 },
        flavor: "Once the position is won, the storm doesn't stop until the horn does.",
        art: "mount_reaper",
    },
    {
        id: "SECOND_GEAR",
        name: "Second Gear",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "STRIKE_DAMAGE",
        triggerCondition: "OPPONENT_STAMINA_BELOW_70",
        minRarity: RARITY.COMMON,
        // v2 spec §5: TRIMMED (~half the first draft). Shares the strike lane with HEAVY_HANDS
        // and DEEP_WATERS; the ungated trio measured +10.2 pts at draft values.
        values: { COMMON: 0.005, UNCOMMON: 0.009, RARE: 0.015, LEGENDARY: 0.020 },
        flavor: "A tired man's guard drops an inch. This fighter never misses the inch.",
        art: "second_gear",
    },
    {
        id: "TOP_CONTROL",
        name: "Top Control",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "GNP_DAMAGE",
        triggerCondition: "PLAYER_TOP_POSITION",
        minRarity: RARITY.COMMON,
        // Collapse-stacks with MOUNT_REAPER (same bonusType + trigger); pair measured ~0 swing.
        values: { COMMON: 0.025, UNCOMMON: 0.045, RARE: 0.075, LEGENDARY: 0.10 },
        flavor: "Top position isn't a reward, it's a job. This fighter clocks in.",
        art: "top_control",
    },
    {
        id: "GUILLOTINE_CHOKE",
        name: "Guillotine Choke",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "SUBMISSION_SUCCESS",
        triggerCondition: "PLAYER_ATTEMPTS_SUBMISSION",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.03, UNCOMMON: 0.05, RARE: 0.08, LEGENDARY: 0.11 },
        flavor: "Once the neck is wrapped, it's only a matter of time.",
        art: "guillotine_choke",
    },
    {
        id: "DEEP_WATERS",
        name: "Deep Waters",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "STRIKE_DAMAGE",
        triggerCondition: "LATE_ROUNDS",
        minRarity: RARITY.COMMON,
        // v2 spec §5: TRIMMED (~half the first draft), same strike-lane reason as SECOND_GEAR.
        // Legendary trio sum: .035 + .020 + .033 = .088.
        values: { COMMON: 0.008, UNCOMMON: 0.015, RARE: 0.025, LEGENDARY: 0.033 },
        flavor: "Drag them out past the third round and watch them drown.",
        art: "deep_waters",
    },
    {
        id: "FIGHTING_SPIRIT",
        name: "Fighting Spirit",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "FLASH_KO_RESISTANCE",
        triggerCondition: "PLAYER_HEALTH_BELOW_25",
        minRarity: RARITY.COMMON,
        // v2 spec §5: HALF the drafted values. No precedent for a flash-KO lever anywhere in
        // the bonus system; revisit after a dedicated sweep.
        values: { COMMON: 0.004, UNCOMMON: 0.008, RARE: 0.012, LEGENDARY: 0.018 },
        flavor: "Hurt, not gone. The chin negotiates a longer fight.",
        art: "fighting_spirit",
    },

    // ── SIGNATURES (one higher-impact effect, minRarity RARE) ──────────────────
    {
        id: "THE_FINISHER",
        name: "Overhand Right",
        effectType: EFFECT_TYPE.SIGNATURE,
        bonusType: "SIG_FINISHER_STRIKE",
        triggerCondition: "OPPONENT_HEALTH_BELOW_25",
        minRarity: RARITY.RARE,
        // Trimmed post-QA: feeds the same strike lane as HEAVY_HANDS; pulled down so the
        // striker-mirror worst case lands in-band.
        values: { RARE: 0.08, LEGENDARY: 0.15 },
        flavor: "Smells blood in the water and closes like the cage door just locked.",
        art: "the_finisher",
    },
    {
        id: "IRON_RECOVERY",
        name: "Rubber Guard",
        effectType: EFFECT_TYPE.SIGNATURE,
        bonusType: "SIG_IRON_RECOVERY",
        triggerCondition: "PLAYER_HEALTH_BELOW_25",
        minRarity: RARITY.RARE,
        values: { RARE: 0.10, LEGENDARY: 0.18 },
        flavor: "Hurt should slow a fighter down. This one just resets the clock.",
        art: "iron_recovery",
    },
    {
        id: "KILLER_INSTINCT",
        name: "Crucifix",
        effectType: EFFECT_TYPE.SIGNATURE,
        bonusType: "SIG_KILLER_INSTINCT",
        triggerCondition: "OPPONENT_HEALTH_BELOW_25",
        minRarity: RARITY.RARE,
        values: { RARE: 0.015, LEGENDARY: 0.035 },
        flavor: "The wounded animal makes one last mistake. This fighter is always ready for it.",
        art: "killer_instinct",
    },
    {
        id: "SUPERMAN_PUNCH",
        name: "Superman Punch",
        effectType: EFFECT_TYPE.SIGNATURE,
        bonusType: "SIG_FAST_START",
        triggerCondition: "ROUND_ONE",
        minRarity: RARITY.RARE,
        values: { RARE: 0.10, LEGENDARY: 0.18 },
        flavor: "No feeling-out round. The bell rings and the storm is already here.",
        art: "superman_punch",
    },
    {
        id: "BLAST_DOUBLE",
        name: "Blast Double",
        effectType: EFFECT_TYPE.SIGNATURE,
        bonusType: "SIG_TAKEDOWN_BLITZ",
        triggerCondition: "PLAYER_FIRST_TAKEDOWN_LANDED",
        minRarity: RARITY.RARE,
        values: { RARE: 0.10, LEGENDARY: 0.18 },
        flavor: "The first takedown of the night is a statement, not a formality.",
        art: "blast_double",
    },
    {
        id: "ARM_TRIANGLE",
        name: "Arm Triangle",
        effectType: EFFECT_TYPE.SIGNATURE,
        bonusType: "SIG_SUBMISSION_HUNT",
        triggerCondition: "PLAYER_ACHIEVES_TOP_POSITION",
        minRarity: RARITY.RARE,
        values: { RARE: 0.12, LEGENDARY: 0.20 },
        flavor: "Top position is an invitation. This fighter RSVPs immediately.",
        art: "arm_triangle",
    },
];

const SPECIAL_MOVES_BY_ID = Object.fromEntries(SPECIAL_MOVES.map((m) => [m.id, m]));

/**
 * Equip-slot capacity by promotionTier. DERIVED live from the fighter's tier — never
 * stored on the fighter (mirrors CAMP_SLOT_CONFIG). GCS Contender/GCS do not add a 4th
 * slot; the ceiling is 3 (see spec §2). "Title Fight" is included for parity with camp
 * slot keying even though slots are read off promotionTier, not offerType.
 */
const SPECIAL_MOVE_SLOT_CONFIG = {
    Amateur: 1,
    "Regional Pro": 2,
    National: 3,
    "GCS Contender": 3,
    GCS: 3,
    "Title Fight": 3,
};

/**
 * ⚠️ LEGACY — THE GYM PATH ONLY. Flat 4% chance of a drop per sparring-family gym session
 * (rarity, not chance, scales by gym). Read by `specialMovesService.rollMoveDrop`, which is
 * itself legacy and lives only as long as `services/trainingService.js` does.
 *
 * THE HOME CAMP DOES NOT USE THIS. Camp drops are per-drill (D5): every drill declares its own
 * `dropPct` in `consts/homeCampConfig.js`, and the camp's control arm `open_mat` declares its
 * own 4% in `FALLBACK_DRILL.dropPct` — deliberately duplicated there rather than imported from
 * here, so this constant can die with the gym path without touching the camp.
 *
 * Delete this ONLY in the same change that deletes `trainingService.js` and `rollMoveDrop`.
 */
const DROP_BASE_RATE = 0.04;

/**
 * Rarity distribution GIVEN a drop occurs, keyed by gym tier (`availableFrom`, plus the
 * free Community floor). Weights sum to 100. A better gym does not raise the 4% chance —
 * it shifts the rarity odds upward.
 */
const DROP_RARITY_WEIGHTS = {
    Community: { COMMON: 70, UNCOMMON: 25, RARE: 5, LEGENDARY: 0 },
    Amateur: { COMMON: 60, UNCOMMON: 30, RARE: 9, LEGENDARY: 1 },
    "Regional Pro": { COMMON: 45, UNCOMMON: 35, RARE: 17, LEGENDARY: 3 },
    National: { COMMON: 30, UNCOMMON: 35, RARE: 27, LEGENDARY: 8 },
    "GCS Contender": { COMMON: 15, UNCOMMON: 30, RARE: 40, LEGENDARY: 15 },
};

/** Cash (fighter.iron) awarded when a drop duplicates an already-best-owned move. */
const DUPLICATE_CASH = { COMMON: 100, UNCOMMON: 250, RARE: 600, LEGENDARY: 1500 };

/**
 * Validate the catalog once at module load. Throws loudly on any authoring mistake so a
 * bad edit fails fast at boot rather than silently corrupting drops or fight math.
 */
function validateCatalog() {
    let hasCommonMin = false;
    let hasUncommonValue = false;
    const seenIds = new Set();
    // PASSIVE/PROC bonusType -> Set of triggerConditions it is paired with across the catalog.
    const triggersByBonusType = new Map();

    for (const m of SPECIAL_MOVES) {
        if (!m.id || !m.name) throw new Error(`[specialMovesCatalog] move missing id/name: ${JSON.stringify(m)}`);

        // A duplicate id is silently survivable and therefore genuinely dangerous: the
        // SPECIAL_MOVES_BY_ID map below just keeps the LAST one, so the array and the lookup
        // disagree forever — drops roll the first def's rarity floor and grant the second def's
        // effect. Fail the boot instead.
        //
        // NOTE: there is deliberately NO `SPECIAL_MOVES.length === 12` assertion. Pinning the
        // count would make adding a 13th move a boot failure, which is the opposite of useful.
        if (seenIds.has(m.id)) throw new Error(`[specialMovesCatalog] duplicate move id "${m.id}"`);
        seenIds.add(m.id);
        const minIdx = rarityRank[m.minRarity];
        if (minIdx === undefined) {
            throw new Error(`[specialMovesCatalog] ${m.id}: unknown minRarity ${m.minRarity}`);
        }

        // Dense from minRarity upward, no sub-minRarity keys, no unknown keys, numeric values.
        for (const r of RARITY_ORDER) {
            const present = Object.prototype.hasOwnProperty.call(m.values, r);
            const shouldBePresent = rarityRank[r] >= minIdx;
            if (present !== shouldBePresent) {
                throw new Error(
                    `[specialMovesCatalog] ${m.id}: value key ${r} should ${shouldBePresent ? "" : "NOT "}exist for minRarity ${m.minRarity}`
                );
            }
            if (present && typeof m.values[r] !== "number") {
                throw new Error(`[specialMovesCatalog] ${m.id}: value for ${r} is not a number`);
            }
        }
        for (const k of Object.keys(m.values)) {
            if (rarityRank[k] === undefined) {
                throw new Error(`[specialMovesCatalog] ${m.id}: unknown rarity key ${k} in values`);
            }
        }

        if (m.effectType === EFFECT_TYPE.SIGNATURE) {
            if (m.minRarity !== RARITY.RARE) {
                throw new Error(`[specialMovesCatalog] ${m.id}: SIGNATURE must have minRarity RARE`);
            }
            if (!SIGNATURE_BONUS_TYPES.has(m.bonusType)) {
                throw new Error(`[specialMovesCatalog] ${m.id}: SIGNATURE bonusType ${m.bonusType} is not a known signature branch`);
            }
        } else if (m.effectType === EFFECT_TYPE.PASSIVE || m.effectType === EFFECT_TYPE.PROC) {
            if (!ENGINE_BONUS_TYPES.has(m.bonusType)) {
                throw new Error(`[specialMovesCatalog] ${m.id}: bonusType ${m.bonusType} is not a known engine branch`);
            }
            if (!triggersByBonusType.has(m.bonusType)) triggersByBonusType.set(m.bonusType, new Set());
            triggersByBonusType.get(m.bonusType).add(m.triggerCondition);
        } else {
            throw new Error(`[specialMovesCatalog] ${m.id}: unknown effectType ${m.effectType}`);
        }

        if (m.minRarity === RARITY.COMMON) hasCommonMin = true;
        if (Object.prototype.hasOwnProperty.call(m.values, RARITY.UNCOMMON)) hasUncommonValue = true;
    }

    // Trigger-gate integrity. buildMoveBonuses merges on bonusType|triggerCondition, so two moves
    // sharing a bonusType but not a trigger become SEPARATE entries. That is only safe where the
    // engine read site evaluates every entry's gate (MULTI_TRIGGER_BONUS_TYPES); everywhere else
    // the engine reads first-match and the second entry would be silently ignored.
    for (const [bonusType, triggers] of triggersByBonusType) {
        const allowed = MULTI_TRIGGER_BONUS_TYPES[bonusType];
        if (allowed) {
            for (const t of triggers) {
                if (!allowed.has(t)) {
                    throw new Error(`[specialMovesCatalog] ${bonusType} triggerCondition ${t} is not a gate the engine evaluates`);
                }
            }
        } else if (triggers.size !== 1) {
            throw new Error(`[specialMovesCatalog] ${bonusType} is used with multiple triggerConditions but the engine reads it first-match`);
        }
    }

    // Rarity coverage: at least one move obtainable at COMMON and at least one whose value
    // table spans UNCOMMON. (The roster has no minRarity===UNCOMMON entry, so this is checked
    // as value-table coverage rather than minRarity equality — see backend notes.)
    if (!hasCommonMin) throw new Error("[specialMovesCatalog] no move with minRarity COMMON");
    if (!hasUncommonValue) throw new Error("[specialMovesCatalog] no move offering an UNCOMMON-rarity value");
}

// Run at module load — fail fast on a bad edit.
validateCatalog();

module.exports = {
    RARITY,
    EFFECT_TYPE,
    rarityRank,
    RARITY_ORDER,
    SPECIAL_MOVES,
    SPECIAL_MOVES_BY_ID,
    SPECIAL_MOVE_SLOT_CONFIG,
    DROP_BASE_RATE,
    DROP_RARITY_WEIGHTS,
    DUPLICATE_CASH,
    ENGINE_BONUS_TYPES,
    SIGNATURE_BONUS_TYPES,
    MULTI_TRIGGER_BONUS_TYPES,
    validateCatalog,
};
