/**
 * Special Moves v1 — service layer (no HTTP concerns).
 *
 * Owns: slot derivation, the equip/unequip/collection views, the drop roll (weighted by
 * gym tier), grant/upgrade/duplicate ownership resolution, and building the per-fight
 * `moveBonuses` array consumed by utils/fightResolution.js.
 *
 * INVARIANT: grantOrUpgrade is the SOLE writer of fighter.specialMovesOwned — at most one
 * entry per moveId, kept at the best-pulled rarity.
 */

const Fighter = require("../models/fighterModel");
const {
    RARITY,
    EFFECT_TYPE,
    rarityRank,
    SPECIAL_MOVES,
    SPECIAL_MOVES_BY_ID,
    SPECIAL_MOVE_SLOT_CONFIG,
    DROP_BASE_RATE,
    DROP_RARITY_WEIGHTS,
    DUPLICATE_CASH,
} = require("../consts/specialMovesCatalog");

const MAX_SLOTS = 3;

// At most 2 always-on PASSIVE moves may be equipped at once. Passives fire every round with
// no condition, so three stacked Legendary passives compound past the balance guardrail on
// lopsided styles (Capoeira/BJJ mirrors hit ~65-70%). Capping passives at 2 forces slot 3 to
// be a Proc or Signature and keeps the worst-case loadout in the 5-10pt guardrail band.
const MAX_PASSIVES = 2;

// Tier at which the NEXT slot unlocks (for the "nextSlotUnlocksAt" hint). Derived, not stored.
const NEXT_SLOT_TIER = { Amateur: "Regional Pro", "Regional Pro": "National" };

// ── Display helpers ──────────────────────────────────────────────────────────

/** Format a 0..1 fraction as a trimmed percentage string (0.035 -> "3.5", 0.02 -> "2"). */
function formatPct(value) {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    return String(parseFloat((value * 100).toFixed(2)));
}

/**
 * Convert the internal 0..1 fraction into the player-facing integer "Rating".
 * DISPLAY-ONLY rebase: rating = fraction x 1000 (0.008 -> 8, 0.05 -> 50, 0.18 -> 180).
 * The engine always consumes the raw fraction; this multiplier is a presentation
 * contract — NEVER change it once shipped, or every card's numbers silently inflate.
 */
const RATING_SCALE = 1000;
function toRating(value) {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    return Math.round(value * RATING_SCALE);
}

/**
 * Human-readable effect text for a move: leads with a chunky integer Rating in a
 * per-bonusType flavored unit, keeps the exact percentage as a trailing parenthetical
 * so spreadsheet-minded players still get the real math. `value` may be null
 * (unowned preview), in which case the numeric portion is omitted.
 */
function describeMove(def, value) {
    const r = toRating(value);
    const p = formatPct(value);
    const fmt = (withNum, withoutNum) =>
        r != null ? withNum.replace("{r}", String(r)).replace("{p}", p) : withoutNum;
    switch (def.bonusType) {
        case "OPPONENT_DAMAGE_REDUCTION":
            return fmt("+{r} Defense Rating — shrugs off incoming strikes. ({p}% less strike damage taken)",
                "Raises your Defense Rating — shrugs off incoming strikes.");
        case "STRIKE_DAMAGE":
            return fmt("+{r} Power Rating — every punch lands heavier. (+{p}% strike damage)",
                "Raises your Power Rating — every punch lands heavier.");
        case "ALL_STATS":
            return fmt("+{r} All-Round Rating — lifts every attribute for the whole fight. (+{p}% to all stats)",
                "Raises your All-Round Rating — lifts every attribute for the whole fight.");
        case "BODY_DAMAGE":
            return fmt("+{r} Body-Shot Rating — digs deeper to the ribs and liver. (+{p}% body damage)",
                "Raises your Body-Shot Rating — digs deeper to the ribs and liver.");
        case "SPRAWL_SUCCESS":
            return fmt("+{r} Sprawl Rating when the opponent shoots a takedown. (+{p}% sprawl success)",
                "Raises your Sprawl Rating when the opponent shoots a takedown.");
        case "ESCAPE_PROBABILITY":
            return fmt("+{r} Escape Rating when caught in a submission. (+{p}% escape chance)",
                "Raises your Escape Rating when caught in a submission.");
        case "CLINCH_DAMAGE":
            return fmt("+{r} Clinch Rating — punishes them against the fence. (+{p}% clinch damage)",
                "Raises your Clinch Rating — punishes them against the fence.");
        case "STAMINA_DRAIN":
            return fmt("+{r} Cardio Rating once you tire below 70% stamina. ({p}% less stamina drain)",
                "Raises your Cardio Rating once you tire.");
        case "GNP_DAMAGE":
            return fmt("+{r} Ground-and-Pound Rating from top position. (+{p}% ground strikes damage)",
                "Raises your Ground-and-Pound Rating from top position.");
        case "SIG_FINISHER_STRIKE":
            return fmt("Signature — +{r} Finisher Rating for the round the opponent first drops below 25% health, once per fight. (+{p}% strike damage that round)",
                "Signature — a once-per-fight Finisher Rating surge when the opponent is badly hurt.");
        case "SIG_IRON_RECOVERY":
            return fmt("Signature — +{r} Recovery Rating for the rest of the fight after you first drop below 25% health, once per fight. ({p}% less stamina drain)",
                "Signature — a once-per-fight Recovery Rating surge after you're badly hurt.");
        case "SIG_KILLER_INSTINCT":
            return fmt("Signature — +{r} KO Rating once the opponent first drops below 25% health, for the rest of the fight. (+{p}% flash-KO chance)",
                "Signature — a KO Rating surge once the opponent is badly hurt.");
        default:
            return def.flavor || "";
    }
}

// ── Slots ────────────────────────────────────────────────────────────────────

function deriveSlots(fighter) {
    const tier = fighter.promotionTier || "Amateur";
    const slotsUnlocked = SPECIAL_MOVE_SLOT_CONFIG[tier] ?? 1;
    let nextSlotUnlocksAt = null;
    if (slotsUnlocked < MAX_SLOTS) nextSlotUnlocksAt = NEXT_SLOT_TIER[tier] || null;
    return { slotsUnlocked, maxSlots: MAX_SLOTS, nextSlotUnlocksAt };
}

// ── Views ────────────────────────────────────────────────────────────────────

function ownedEntryFor(fighter, moveId) {
    return (fighter.specialMovesOwned || []).find((o) => o.moveId === moveId) || null;
}

function equippedIndexOf(fighter, moveId) {
    return (fighter.specialMovesEquipped || []).indexOf(moveId);
}

function buildMoveView(fighter, def, ownedEntry, equippedIndex) {
    const isEquipped = typeof equippedIndex === "number" && equippedIndex >= 0;
    const rarity = ownedEntry ? ownedEntry.rarity : null;
    const value = ownedEntry ? def.values[ownedEntry.rarity] : null;
    return {
        moveId: def.id,
        name: def.name,
        rarity,
        effectType: def.effectType,
        bonusType: def.bonusType,
        triggerCondition: def.triggerCondition,
        value: typeof value === "number" ? value : null,
        description: describeMove(def, value),
        flavor: def.flavor,
        art: def.art,
        acquiredAt: ownedEntry ? ownedEntry.acquiredAt : null,
        owned: !!ownedEntry,
        isEquipped,
        slotIndex: isEquipped ? equippedIndex : null,
    };
}

function buildEquippedView(fighter) {
    const equipped = fighter.specialMovesEquipped || [];
    const out = [];
    for (let i = 0; i < equipped.length; i++) {
        const moveId = equipped[i];
        const def = SPECIAL_MOVES_BY_ID[moveId];
        const ownedEntry = ownedEntryFor(fighter, moveId);
        // Defensive: an equipped move must be owned + in-catalog. Skip (never throw) if not.
        if (!def || !ownedEntry) {
            console.warn(`[specialMoves] equipped slot ${i} references invalid move ${moveId}; omitting from view`);
            continue;
        }
        const value = def.values[ownedEntry.rarity];
        out.push({
            slotIndex: i,
            moveId,
            name: def.name,
            rarity: ownedEntry.rarity,
            effectType: def.effectType,
            bonusType: def.bonusType,
            value: typeof value === "number" ? value : null,
            description: describeMove(def, value),
            art: def.art,
        });
    }
    return out;
}

function listMoves(fighter) {
    const slots = deriveSlots(fighter);
    const ownedViews = (fighter.specialMovesOwned || [])
        .map((o) => {
            const def = SPECIAL_MOVES_BY_ID[o.moveId];
            if (!def) return null; // stale id no longer in catalog — omit
            return buildMoveView(fighter, def, o, equippedIndexOf(fighter, o.moveId));
        })
        .filter(Boolean);

    return {
        slotsUnlocked: slots.slotsUnlocked,
        maxSlots: slots.maxSlots,
        nextSlotUnlocksAt: slots.nextSlotUnlocksAt,
        campLocked: !!fighter.acceptedFightId,
        equipped: buildEquippedView(fighter),
        owned: ownedViews,
    };
}

function getMoveDetail(fighter, moveId) {
    const def = SPECIAL_MOVES_BY_ID[moveId];
    if (!def) {
        const err = new Error("Unknown move");
        err.notFound = true;
        throw err;
    }
    const ownedEntry = ownedEntryFor(fighter, moveId);
    return buildMoveView(fighter, def, ownedEntry, equippedIndexOf(fighter, moveId));
}

// ── Equip / Unequip ──────────────────────────────────────────────────────────

/**
 * Equip an owned move into a slot.
 *
 * Slot semantics: specialMovesEquipped is a COMPACT, slot-ordered array (no gaps).
 * slotIndex < equipped.length replaces that slot; slotIndex >= equipped.length appends into
 * the next free compact slot (still must be < slotsUnlocked). This keeps slotIndex stable
 * and the array hole-free. Persists and returns the listMoves shape.
 */
async function equipMove(fighter, moveId, slotIndex) {
    if (fighter.acceptedFightId) throw new Error("Cannot change moves during an active fight camp");

    const def = SPECIAL_MOVES_BY_ID[moveId];
    if (!def) throw new Error("Unknown move");

    if (!ownedEntryFor(fighter, moveId)) throw new Error("You don't own that move");

    const { slotsUnlocked } = deriveSlots(fighter);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotsUnlocked) {
        throw new Error("Slot not unlocked yet");
    }

    const equipped = Array.isArray(fighter.specialMovesEquipped) ? [...fighter.specialMovesEquipped] : [];
    const existingIdx = equipped.indexOf(moveId);
    if (existingIdx !== -1 && existingIdx !== slotIndex) {
        throw new Error("Move already equipped");
    }

    // Passive cap: at most MAX_PASSIVES always-on passives equipped at once. Count what the
    // loadout would hold AFTER this equip — a replace drops whatever move currently sits in
    // the target slot, an append adds without dropping anything.
    if (def.effectType === EFFECT_TYPE.PASSIVE) {
        const isPassive = (id) => SPECIAL_MOVES_BY_ID[id]?.effectType === EFFECT_TYPE.PASSIVE;
        const replacedId = slotIndex < equipped.length ? equipped[slotIndex] : null;
        const passivesAfter =
            equipped.filter(isPassive).length - (replacedId && isPassive(replacedId) ? 1 : 0) + 1;
        if (passivesAfter > MAX_PASSIVES) {
            throw new Error("Only 2 always-on passives can be equipped — that slot needs a Proc or Signature move");
        }
    }

    if (slotIndex < equipped.length) {
        equipped[slotIndex] = moveId; // replace whatever occupied this slot
    } else {
        equipped.push(moveId); // append into the next free compact slot
    }

    fighter.specialMovesEquipped = equipped;
    await fighter.save();
    return listMoves(fighter);
}

async function unequipMove(fighter, slotIndex) {
    if (fighter.acceptedFightId) throw new Error("Cannot change moves during an active fight camp");

    const equipped = Array.isArray(fighter.specialMovesEquipped) ? [...fighter.specialMovesEquipped] : [];
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= equipped.length) {
        throw new Error("No move in that slot");
    }

    equipped.splice(slotIndex, 1); // re-compacts
    fighter.specialMovesEquipped = equipped;
    await fighter.save();
    return listMoves(fighter);
}

// ── Ownership resolution (SOLE writer of specialMovesOwned) ───────────────────

/**
 * Grant a dropped move, or upgrade/duplicate-cash it if already owned. Does NOT save —
 * the caller (training flow) persists on its existing fighter.save().
 *
 * Outcomes:
 *   NEW       — not previously owned; pushed at rolledRarity.
 *   UPGRADE   — owned at a strictly LOWER rarity; rarity bumped in place (acquiredAt kept).
 *   DUPLICATE — owned at rolledRarity or higher; no ownership change, DUPLICATE_CASH awarded.
 */
function grantOrUpgrade(fighter, moveId, rolledRarity) {
    const def = SPECIAL_MOVES_BY_ID[moveId];
    if (!def) {
        // Should never happen (callers pass catalog ids). Guard rather than corrupt state.
        console.warn(`[specialMoves] grantOrUpgrade called with unknown moveId ${moveId}`);
        return null;
    }
    if (!Array.isArray(fighter.specialMovesOwned)) fighter.specialMovesOwned = [];

    const base = {
        moveId,
        name: def.name,
        effectType: def.effectType,
        art: def.art,
        rarity: rolledRarity,
        // Effect text at the rolled rarity + flavor, denormalized so the drop-reveal card
        // can show what the move does without a second fetch (same reasoning as name/art).
        description: describeMove(def, def.values[rolledRarity]),
        flavor: def.flavor,
    };
    const existing = fighter.specialMovesOwned.find((o) => o.moveId === moveId);

    if (!existing) {
        fighter.specialMovesOwned.push({ moveId, rarity: rolledRarity, acquiredAt: new Date() });
        return { outcome: "NEW", ...base, isUpgrade: false };
    }

    const ownedRank = rarityRank[existing.rarity] ?? -1;
    const rolledRank = rarityRank[rolledRarity] ?? -1;

    if (ownedRank < rolledRank) {
        const fromRarity = existing.rarity;
        existing.rarity = rolledRarity; // upgrade in place; keep acquiredAt
        return { outcome: "UPGRADE", ...base, isUpgrade: true, fromRarity, toRarity: rolledRarity };
    }

    // Duplicate (owned rank >= rolled): cash out, no ownership change.
    const cashAwarded = DUPLICATE_CASH[rolledRarity] || 0;
    fighter.iron = (fighter.iron || 0) + cashAwarded;
    return { outcome: "DUPLICATE", ...base, isUpgrade: false, cashAwarded, newBalance: fighter.iron };
}

// ── Drop roll ────────────────────────────────────────────────────────────────

function weightedRarityPick(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const [rarity, w] of entries) {
        roll -= w;
        if (roll < 0) return rarity;
    }
    return entries[entries.length - 1][0];
}

/**
 * Roll for a special-move drop at the end of a sparring-family training session.
 * Never throws (a mid-training crash must not lose the player's session). Returns the
 * moveDrop object or null. Mutates fighter.specialMovesOwned/iron via grantOrUpgrade; the
 * caller saves.
 */
/**
 * PURE helper: return the drop rarity-weight table for a gym, as a fresh shallow copy so
 * callers can't mutate the shared catalog constant. Uses the "Community" table for free gyms,
 * otherwise keys off gym.availableFrom. Returns null (never throws) when gym is null/undefined
 * or its tier has no modeled weights.
 */
function dropRarityWeightsForGym(gym) {
    if (!gym) return null;
    const tierKey = gym.isFreeGym ? "Community" : gym.availableFrom;
    const weights = DROP_RARITY_WEIGHTS[tierKey];
    if (!weights) return null;
    return { ...weights };
}

function rollMoveDrop(fighter, gym) {
    if (Math.random() >= DROP_BASE_RATE) return null;

    const tierKey = gym && gym.isFreeGym ? "Community" : gym && gym.availableFrom;
    const weights = DROP_RARITY_WEIGHTS[tierKey];
    if (!weights) {
        console.warn(`[specialMoves] no drop rarity weights for gym tier "${tierKey}"; skipping drop`);
        return null;
    }

    const rolledRarity = weightedRarityPick(weights);
    if (!rolledRarity) return null;

    const rolledRank = rarityRank[rolledRarity];
    const eligible = SPECIAL_MOVES.filter((c) => rarityRank[c.minRarity] <= rolledRank);
    if (eligible.length === 0) {
        console.warn(`[specialMoves] no eligible moves for rolled rarity ${rolledRarity}; skipping drop`);
        return null;
    }

    const picked = eligible[Math.floor(Math.random() * eligible.length)];
    return grantOrUpgrade(fighter, picked.id, rolledRarity);
}

// ── Fight integration ────────────────────────────────────────────────────────

/**
 * Build the per-fight moveBonuses array from the fighter's equipped moves, shaped like
 * campService.buildSessionBonuses entries. Returns FRESH objects every call (the array is
 * mutated during resolution — no state may leak across fights).
 *
 * COLLAPSE RULE: PASSIVE/PROC entries that share a bonusType are merged into ONE entry with
 * SUMMED effectiveValue (triggerBonus/getBonusValue use first-match .find()). SIGNATURE
 * (SIG_*) entries are NEVER merged — each fires independently, keyed by moveId downstream.
 *
 * Never emits NaN (R5): an equipped move with a missing owned entry / catalog def / value is
 * skipped and logged, never thrown.
 */
function buildMoveBonuses(fighter) {
    const equipped = fighter.specialMovesEquipped || [];
    const ownedById = {};
    for (const o of fighter.specialMovesOwned || []) ownedById[o.moveId] = o;

    const mergedByType = {}; // bonusType -> merged PASSIVE/PROC entry
    const signatures = [];

    for (const moveId of equipped) {
        const ownedEntry = ownedById[moveId];
        if (!ownedEntry) {
            console.warn(`[specialMoves] buildMoveBonuses: equipped ${moveId} not owned; skipping`);
            continue;
        }
        const def = SPECIAL_MOVES_BY_ID[moveId];
        if (!def) {
            console.warn(`[specialMoves] buildMoveBonuses: equipped ${moveId} not in catalog; skipping`);
            continue;
        }
        const value = def.values[ownedEntry.rarity];
        if (typeof value !== "number" || Number.isNaN(value)) {
            console.warn(`[specialMoves] buildMoveBonuses: ${moveId} has no value for rarity ${ownedEntry.rarity}; skipping`);
            continue;
        }

        if (def.effectType === EFFECT_TYPE.SIGNATURE) {
            signatures.push({
                moveId,
                bonusType: def.bonusType,
                effectiveValue: value,
                triggerCondition: def.triggerCondition,
                effectType: def.effectType,
                triggered: false,
                triggerCount: 0,
            });
        } else if (mergedByType[def.bonusType]) {
            mergedByType[def.bonusType].effectiveValue += value; // collapse: sum
        } else {
            mergedByType[def.bonusType] = {
                moveId,
                bonusType: def.bonusType,
                effectiveValue: value,
                triggerCondition: def.triggerCondition,
                effectType: def.effectType,
                triggered: false,
                triggerCount: 0,
            };
        }
    }

    return [...Object.values(mergedByType), ...signatures];
}

/**
 * Load a fighter by id and build the FROZEN moveBonuses snapshot (used at camp finalise).
 * Returns [] for a missing fighter. Never throws.
 */
async function buildMoveBonusesSnapshot(fighterId) {
    try {
        const fighter = await Fighter.findById(fighterId).select("specialMovesOwned specialMovesEquipped");
        if (!fighter) return [];
        return buildMoveBonuses(fighter);
    } catch (e) {
        console.error("[specialMoves] buildMoveBonusesSnapshot failed:", e.message);
        return [];
    }
}

module.exports = {
    deriveSlots,
    listMoves,
    getMoveDetail,
    equipMove,
    unequipMove,
    grantOrUpgrade,
    rollMoveDrop,
    dropRarityWeightsForGym,
    buildMoveBonuses,
    buildMoveBonusesSnapshot,
    // exported for tests
    describeMove,
    weightedRarityPick,
};
