/**
 * Special Moves catalog (Special Moves v1 — trimmed scope).
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
]);

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
    // so no value gives consistent, fair behavior. The roster is intentionally 12 moves
    // (4 Passive / 5 Proc / 3 Signature); ALL_STATS is not used by any move.
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

    // ── PROCS (fire on a specific fight situation, minRarity COMMON) ────────────
    {
        id: "SPRAWL_INSTINCT",
        name: "Sprawl Instinct",
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
        name: "Never Tap",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "ESCAPE_PROBABILITY",
        triggerCondition: "OPPONENT_ATTEMPTS_SUBMISSION",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.04, UNCOMMON: 0.075, RARE: 0.12, LEGENDARY: 0.16 },
        flavor: "Caught, cranked, and still smiling — some limbs refuse to listen to logic.",
        art: "never_tap",
    },
    {
        id: "CLINCH_KILLER",
        name: "Clinch Killer",
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
        name: "Mount Reaper",
        effectType: EFFECT_TYPE.PROC,
        bonusType: "GNP_DAMAGE",
        triggerCondition: "PLAYER_TOP_POSITION",
        minRarity: RARITY.COMMON,
        values: { COMMON: 0.04, UNCOMMON: 0.07, RARE: 0.13, LEGENDARY: 0.17 },
        flavor: "Once the position is won, the storm doesn't stop until the horn does.",
        art: "mount_reaper",
    },

    // ── SIGNATURES (one higher-impact effect, minRarity RARE) ──────────────────
    {
        id: "THE_FINISHER",
        name: "The Finisher",
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
        name: "Iron Recovery",
        effectType: EFFECT_TYPE.SIGNATURE,
        bonusType: "SIG_IRON_RECOVERY",
        triggerCondition: "PLAYER_HEALTH_BELOW_25",
        minRarity: RARITY.RARE,
        values: { RARE: 0.10, LEGENDARY: 0.18 },
        flavor: "Hurt should slow a fighter down — this one just resets the clock.",
        art: "iron_recovery",
    },
    {
        id: "KILLER_INSTINCT",
        name: "Killer Instinct",
        effectType: EFFECT_TYPE.SIGNATURE,
        bonusType: "SIG_KILLER_INSTINCT",
        triggerCondition: "OPPONENT_HEALTH_BELOW_25",
        minRarity: RARITY.RARE,
        values: { RARE: 0.015, LEGENDARY: 0.035 },
        flavor: "The wounded animal makes one last mistake. This fighter is always ready for it.",
        art: "killer_instinct",
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

/** Flat 4% chance of A drop per sparring-family session (rarity, not chance, scales by gym). */
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

    for (const m of SPECIAL_MOVES) {
        if (!m.id || !m.name) throw new Error(`[specialMovesCatalog] move missing id/name: ${JSON.stringify(m)}`);
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
        } else if (m.effectType === EFFECT_TYPE.PASSIVE || m.effectType === EFFECT_TYPE.PROC) {
            if (!ENGINE_BONUS_TYPES.has(m.bonusType)) {
                throw new Error(`[specialMovesCatalog] ${m.id}: bonusType ${m.bonusType} is not a known engine branch`);
            }
        } else {
            throw new Error(`[specialMovesCatalog] ${m.id}: unknown effectType ${m.effectType}`);
        }

        if (m.minRarity === RARITY.COMMON) hasCommonMin = true;
        if (Object.prototype.hasOwnProperty.call(m.values, RARITY.UNCOMMON)) hasUncommonValue = true;
    }

    // Rarity coverage: at least one move obtainable at COMMON and at least one whose value
    // table spans UNCOMMON. (The 13-move roster has no minRarity===UNCOMMON entry, so this
    // is checked as value-table coverage rather than minRarity equality — see backend notes.)
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
    validateCatalog,
};
