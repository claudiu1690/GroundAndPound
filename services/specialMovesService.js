/**
 * Special Moves (v1 + v2 roster) — service layer (no HTTP concerns).
 *
 * Owns: slot derivation, the equip/unequip/collection views, the read-only Catalog view
 * (buildCatalog), the drop roll (weighted by gym tier), grant/upgrade/duplicate ownership
 * resolution, and building the per-fight `moveBonuses` array consumed by
 * utils/fightResolution.js.
 *
 * INVARIANT: grantOrUpgrade is the SOLE writer of fighter.specialMovesOwned — at most one
 * entry per moveId, kept at the best-pulled rarity.
 */

const Fighter = require("../models/fighterModel");
const config = require("../config");
const {
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
} = require("../consts/specialMovesCatalog");
// No require cycle: homeCampConfig requires only consts, never a service.
const {
    MOVE_DOMAIN,
    MOVE_TEACH_SLOT,
    DISCIPLINE_LABELS,
    COACH_ARCHETYPES,
    ARCHETYPE_KEYS,
} = require("../consts/homeCampConfig");

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
            // Three moves share this bonusType on different gates (engine: triggerGatedMoveBonus),
            // so the text must say WHEN it applies or Heavy Hands / Second Gear / Deep Waters read alike.
            if (def.triggerCondition === "OPPONENT_STAMINA_BELOW_70") {
                return fmt("+{r} Power Rating once your opponent tires below 70% stamina. (+{p}% strike damage)",
                    "Raises your Power Rating once your opponent tires.");
            }
            if (def.triggerCondition === "LATE_ROUNDS") {
                return fmt("+{r} Power Rating in the late rounds, once the fight passes halfway. (+{p}% strike damage)",
                    "Raises your Power Rating in the late rounds.");
            }
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
        case "TAKEDOWN_SUCCESS":
            return fmt("+{r} Takedown Rating when you shoot for a takedown. (+{p}% takedown success)",
                "Raises your Takedown Rating when you shoot for a takedown.");
        case "GROUND_DAMAGE_REDUCTION":
            return fmt("+{r} Ground Defense Rating while you're stuck on your back. ({p}% less ground-and-pound damage taken)",
                "Raises your Ground Defense Rating while you're stuck on your back.");
        case "SUBMISSION_SUCCESS":
            return fmt("+{r} Submission Rating whenever you attempt a submission. (+{p}% submission finish chance)",
                "Raises your Submission Rating whenever you attempt a submission.");
        case "OPPONENT_STAMINA_DRAIN":
            return fmt("+{r} Pressure Rating: your opponent burns more gas every round. (+{p}% opponent stamina drain)",
                "Raises your Pressure Rating: your opponent burns more gas every round.");
        case "FLASH_KO_RESISTANCE":
            return fmt("+{r} Grit Rating once you drop below 25% health. (-{p}% flash-KO chance against you)",
                "Raises your Grit Rating once you're badly hurt.");
        case "SIG_FAST_START":
            return fmt("Signature: +{r} Blitz Rating on your opening exchange in round 1, once per fight. (+{p}% strike damage that exchange)",
                "Signature: a first-round power surge on your opening exchange.");
        case "SIG_TAKEDOWN_BLITZ":
            return fmt("Signature: +{r} Slam Rating on the first takedown you land, once per fight. (+{p}% ground-and-pound damage that round)",
                "Signature: your first takedown of the night hits harder.");
        case "SIG_SUBMISSION_HUNT":
            return fmt("Signature: +{r} Hunter Rating the first time you take top position, once per fight. (+{p}% submission finish chance that round)",
                "Signature: the first time you get on top, you hunt the tap.");
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

/**
 * The per-bonusType unit word each describeMove template prints after "+{r}". Lifted verbatim
 * from the templates above so the Catalog ladder ("+26 Power Rating") and the card text can
 * never disagree; a test asserts describeMove(def, v) contains `+${rating} ${unit}` for every
 * rung of every move. If a template's unit word changes, change it HERE too (not the reverse).
 */
const RATING_UNIT_BY_BONUS_TYPE = Object.freeze({
    OPPONENT_DAMAGE_REDUCTION: "Defense Rating",
    STRIKE_DAMAGE: "Power Rating", // all three triggers (ALWAYS / OPPONENT_STAMINA_BELOW_70 / LATE_ROUNDS)
    ALL_STATS: "All-Round Rating",
    BODY_DAMAGE: "Body-Shot Rating",
    SPRAWL_SUCCESS: "Sprawl Rating",
    ESCAPE_PROBABILITY: "Escape Rating",
    CLINCH_DAMAGE: "Clinch Rating",
    STAMINA_DRAIN: "Cardio Rating",
    GNP_DAMAGE: "Ground-and-Pound Rating",
    TAKEDOWN_SUCCESS: "Takedown Rating",
    GROUND_DAMAGE_REDUCTION: "Ground Defense Rating",
    SUBMISSION_SUCCESS: "Submission Rating",
    OPPONENT_STAMINA_DRAIN: "Pressure Rating",
    FLASH_KO_RESISTANCE: "Grit Rating",
    SIG_FAST_START: "Blitz Rating",
    SIG_TAKEDOWN_BLITZ: "Slam Rating",
    SIG_SUBMISSION_HUNT: "Hunter Rating",
    SIG_FINISHER_STRIKE: "Finisher Rating",
    SIG_IRON_RECOVERY: "Recovery Rating",
    SIG_KILLER_INSTINCT: "KO Rating",
});

/** Unit word for a move's Rating, or the generic "Rating" for an unmapped bonusType. */
function ratingUnitFor(def) {
    const bt = def && def.bonusType;
    return typeof bt === "string" && Object.prototype.hasOwnProperty.call(RATING_UNIT_BY_BONUS_TYPE, bt)
        ? RATING_UNIT_BY_BONUS_TYPE[bt]
        : "Rating";
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

// ── Catalog (read-only view of the whole roster) ─────────────────────────────

/** Type order inside a discipline: Passive, Proc, Signature (matches the Library table). */
const CATALOG_TYPE_ORDER = Object.freeze([EFFECT_TYPE.PASSIVE, EFFECT_TYPE.PROC, EFFECT_TYPE.SIGNATURE]);

/**
 * Every catalog id in display order: discipline (ARCHETYPE_KEYS order), then type
 * (CATALOG_TYPE_ORDER), then SPECIAL_MOVES index. Computed once at load from consts.
 * INTERNAL: always map over it, never hand it out (callers could mutate the shared order).
 * A move with no discipline sorts last; buildCatalog skips it (rule 14 makes that unreachable).
 */
const CATALOG_ORDER = Object.freeze((() => {
    const rankOf = (arr, v) => {
        const i = arr.indexOf(v);
        return i === -1 ? arr.length : i;
    };
    return SPECIAL_MOVES
        .map((def, index) => ({
            id: def.id,
            domainRank: rankOf(ARCHETYPE_KEYS, MOVE_DOMAIN[def.id]),
            typeRank: rankOf(CATALOG_TYPE_ORDER, def.effectType),
            index,
        }))
        .sort((a, b) => a.domainRank - b.domainRank || a.typeRank - b.typeRank || a.index - b.index)
        .map((x) => x.id);
})());

// Player-facing "How to get it" copy. Server-generated so the client never re-derives a rule.
// {coach} = COACH_ARCHETYPES[domain].label verbatim, {rank} = the slot's teach rank.
// NO EM DASHES in any of these strings (player-facing copy rule).
const TEACH_TEXT_BY_MIN_RARITY = Object.freeze({
    COMMON: "Taught by a {coach}: any rarity, at Rank {rank}.",
    UNCOMMON: "Taught by an Uncommon-or-better {coach}, at Rank {rank}.",
    RARE: "Taught by a Rare-or-better {coach}, at Rank {rank}.",
    LEGENDARY: "Legendary {coach} only, at Rank {rank}.",
});
/** Teaching line while CAMP_TEACH_CHANNEL is off. */
const TEACH_OFF_TEXT = "Not currently teachable. Train for it instead.";

/** Fill a copy template. Function replacers so a `$` in a label can never act as a pattern. */
function fillCopy(template, coachLabel, rank) {
    return template.replace("{coach}", () => String(coachLabel)).replace("{rank}", () => String(rank));
}

/** Teaching line for a live `teach` block, or TEACH_OFF_TEXT if its rarity has no template. */
function teachTextFor(teach) {
    const tpl = Object.prototype.hasOwnProperty.call(TEACH_TEXT_BY_MIN_RARITY, teach.minCoachRarity)
        ? TEACH_TEXT_BY_MIN_RARITY[teach.minCoachRarity]
        : null;
    if (!tpl) {
        console.warn(`[specialMoves] no teach copy for coach rarity "${teach.minCoachRarity}"; showing the off text`);
        return TEACH_OFF_TEXT;
    }
    return fillCopy(tpl, teach.coachLabel, teach.rank);
}

/**
 * Training line (decision D1, Variant B). Same for every move of a discipline; never a
 * percentage. Gyms are retired, so the gym sparring drop path is deliberately not named.
 */
function trainTextFor(coachLabel) {
    return `Also drops from the flagship session of any ${coachLabel} who knows it, and from Open Mat Sparring: a chance, more rounds, better odds. Your camp's tier decides how rare a drop can be, not how often one happens.`;
}

/**
 * One rung of a move's rarity ladder.
 * @typedef {Object} CatalogLadderRung
 * @property {"COMMON"|"UNCOMMON"|"RARE"|"LEGENDARY"} rarity
 * @property {number} value   raw engine fraction at that rarity (e.g. 0.026)
 * @property {number} rating  player-facing integer, Math.round(value * 1000)
 * @property {string} unit    per-bonusType unit word, e.g. "Power Rating"
 */

/**
 * SINGLE DEFINITION of a Catalog entry (GET /fighters/:id/moves/catalog -> moves[]).
 * The first 14 fields are EXACTLY the buildMoveView shape used by GET /fighters/:id/moves and
 * GET /fighters/:id/moves/:moveId, so the client can reuse its move card/modal as-is.
 *
 * @typedef {Object} CatalogMove
 * @property {string} moveId
 * @property {string} name
 * @property {?string} rarity             owned (best-pulled) rarity, null when not owned
 * @property {"PASSIVE"|"PROC"|"SIGNATURE"} effectType
 * @property {string} bonusType
 * @property {string} triggerCondition
 * @property {?number} value              value at the owned rarity, null when not owned
 * @property {string} description          owned: describeMove at the owned rarity; unowned:
 *                                         the numberless describeMove(def, null). Never
 *                                         persona-adjusted.
 * @property {string} flavor
 * @property {string} art
 * @property {?(Date|string)} acquiredAt   null when not owned
 * @property {boolean} owned
 * @property {boolean} isEquipped          only ever true for an OWNED move
 * @property {?number} slotIndex           equipped slot, null when not equipped
 * @property {"COMMON"|"RARE"} minRarity   lowest rarity the move exists at (Signatures RARE)
 * @property {"STRIKING"|"WRESTLING"|"BJJ"|"CONDITIONING"} domain
 * @property {string} domainLabel          "Striking" | "Wrestling" | "BJJ" | "Conditioning"
 * @property {CatalogLadderRung[]} ladder  dense from minRarity upward, in rarity order
 *                                         (4 rungs, or 2 for a Signature); never padded
 * @property {{
 *   teach: ?{ slotIndex: number, minCoachRarity: "COMMON"|"UNCOMMON"|"RARE"|"LEGENDARY", rank: number, coachLabel: string },
 *   teachText: string,
 *   trainText: string
 * }} howToGet                             teach is null (and teachText the off text) while
 *                                         CAMP_TEACH_CHANNEL is off
 */

/**
 * @typedef {Object} MovesCatalogResponse
 * @property {boolean} teachChannel        CAMP_TEACH_CHANNEL as of this request
 * @property {CatalogMove[]} moves         every catalog move, in catalog display order
 */

/**
 * The full read-only Catalog for a fighter. Pure view: never mutates the fighter, never
 * persona-adjusts a number, and builds every nested object FRESH per call so nothing a
 * request handler does to one response can leak into the next.
 *
 * The CAMP_TEACH_CHANNEL flag is read on EVERY call (never cached at load), so flipping the
 * kill switch changes the next response without a restart of this module.
 *
 * @param {object} fighter
 * @returns {MovesCatalogResponse}
 */
function buildCatalog(fighter) {
    const teachChannel = !!config.features.campTeachChannel;
    const moves = [];
    for (const id of CATALOG_ORDER) {
        const def = SPECIAL_MOVES_BY_ID[id];
        const domain = Object.prototype.hasOwnProperty.call(MOVE_DOMAIN, id) ? MOVE_DOMAIN[id] : null;
        if (!def || !domain) {
            console.warn(`[specialMoves] buildCatalog: ${id} has no catalog def or discipline; omitting`);
            continue;
        }
        const ownedEntry = ownedEntryFor(fighter, id);
        // Only an OWNED move can read as equipped: a corrupt equipped-but-unowned id must never
        // render a slot badge on a locked tile.
        const base = buildMoveView(fighter, def, ownedEntry, ownedEntry ? equippedIndexOf(fighter, id) : -1);

        const coachLabel = COACH_ARCHETYPES[domain].label;
        const unit = ratingUnitFor(def);
        const ladder = RARITY_ORDER
            .filter((r) => Object.prototype.hasOwnProperty.call(def.values, r))
            .map((r) => ({ rarity: r, value: def.values[r], rating: toRating(def.values[r]), unit }));

        const slot = MOVE_TEACH_SLOT[id];
        const teach = teachChannel && slot
            ? { slotIndex: slot.teachSlotIndex, minCoachRarity: slot.minTeachCoachRarity, rank: slot.teachRank, coachLabel }
            : null;

        moves.push({
            ...base,
            minRarity: def.minRarity,
            domain,
            domainLabel: DISCIPLINE_LABELS[domain],
            ladder,
            howToGet: {
                teach,
                teachText: teach ? teachTextFor(teach) : TEACH_OFF_TEXT,
                trainText: trainTextFor(coachLabel),
            },
        });
    }
    return { teachChannel, moves };
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

/**
 * @deprecated THE GYM PATH ONLY — flat `DROP_BASE_RATE` (4%), rarity by gym tier. The Home Camp
 * uses `rollCampMoveDrop` below (per-drill odds, D5).
 *
 * ⚠️ NOT DELETED, AND NOT DELETABLE YET. It is still LIVE while `GYMS_RETIRED` is false, and the
 * cutover is a flag flip precisely so it can be flipped BACK without a deploy. Removing this
 * would take the gym training path down with no way to restore it.
 *
 * Delete it only in the same change that deletes `services/trainingService.js` and
 * `DROP_BASE_RATE` — after the cutover has been observed for a full week.
 */
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

/**
 * Home Camp drop roll (D5: per-drill odds replace the flat 4%). ADDITIVE — rollMoveDrop(fighter,
 * gym) above is untouched and still owns the gym path until Phase 2 retires it. Both funnel
 * ownership through grantOrUpgrade, which remains the SOLE writer of specialMovesOwned.
 *
 * Never throws (a mid-training crash must not lose the player's session). Mutates
 * specialMovesOwned/iron via grantOrUpgrade; the caller saves.
 *
 * @param {object} fighter
 * @param {Object}   opts
 * @param {number}   opts.dropRate         0..1 chance this session drops at all (drill.dropPct/100)
 * @param {string}   opts.rarityWeightsKey key into DROP_RARITY_WEIGHTS (the camp tier's dropKey)
 * @param {string[]} [opts.poolMoveIds]    the coach's domain teach pool — the bias target
 * @param {number}   [opts.poolBias=0]     0..1 chance to draw from poolMoveIds instead of the full
 *                                         eligible set. 0 = unbiased (identical content to a gym
 *                                         drop). PHASE 0 passes 0; the knob exists so tuning the
 *                                         bias later needs no call-site change.
 * @returns {object|null} the grantOrUpgrade result, or null
 */
function rollCampMoveDrop(fighter, { dropRate, rarityWeightsKey, poolMoveIds = [], poolBias = 0 } = {}) {
    try {
        const rate = Number(dropRate);
        if (!(rate > 0)) return null;
        if (Math.random() >= rate) return null;

        const weights = DROP_RARITY_WEIGHTS[rarityWeightsKey];
        if (!weights) {
            console.warn(`[specialMoves] no drop rarity weights for key "${rarityWeightsKey}"; skipping camp drop`);
            return null;
        }

        const rolledRarity = weightedRarityPick(weights);
        if (!rolledRarity) return null;

        const rolledRank = rarityRank[rolledRarity];
        const eligible = SPECIAL_MOVES.filter((c) => rarityRank[c.minRarity] <= rolledRank);
        if (eligible.length === 0) {
            console.warn(`[specialMoves] no eligible moves for rolled rarity ${rolledRarity}; skipping camp drop`);
            return null;
        }

        // Optional pool bias — only when the pool actually has eligible members.
        let candidates = eligible;
        const bias = Number(poolBias) || 0;
        if (bias > 0 && Array.isArray(poolMoveIds) && poolMoveIds.length > 0 && Math.random() < bias) {
            const poolSet = new Set(poolMoveIds);
            const biased = eligible.filter((c) => poolSet.has(c.id));
            if (biased.length > 0) candidates = biased;
        }

        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        return grantOrUpgrade(fighter, picked.id, rolledRarity);
    } catch (e) {
        console.error("[specialMoves] rollCampMoveDrop failed:", e.message);
        return null;
    }
}

// ── Fight integration ────────────────────────────────────────────────────────

/**
 * Build the per-fight moveBonuses array from the fighter's equipped moves, shaped like
 * campService.buildSessionBonuses entries. Returns FRESH objects every call (the array is
 * mutated during resolution — no state may leak across fights).
 *
 * COLLAPSE RULE: PASSIVE/PROC entries that share BOTH bonusType AND triggerCondition are merged
 * into ONE entry with SUMMED effectiveValue (triggerBonus/getBonusValue use first-match .find()).
 * Entries with the same bonusType but a different triggerCondition stay SEPARATE, because each
 * carries its own gate; that only happens for bonusTypes in the catalog's
 * MULTI_TRIGGER_BONUS_TYPES (today STRIKE_DAMAGE: Heavy Hands / Second Gear / Deep Waters), whose
 * engine read site (triggerGatedMoveBonus) evaluates every entry. validateCatalog guarantees
 * every other bonusType has exactly one triggerCondition, so for them this is still "one entry
 * per bonusType" and the v1 output is byte-identical. SIGNATURE (SIG_*) entries are NEVER
 * merged — each fires independently, keyed by moveId downstream.
 *
 * Never emits NaN (R5): an equipped move with a missing owned entry / catalog def / value is
 * skipped and logged, never thrown.
 */
function buildMoveBonuses(fighter) {
    const equipped = fighter.specialMovesEquipped || [];
    const ownedById = {};
    for (const o of fighter.specialMovesOwned || []) ownedById[o.moveId] = o;

    const mergedByKey = {}; // `${bonusType}|${triggerCondition}` -> merged PASSIVE/PROC entry
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
            continue;
        }
        const mergeKey = `${def.bonusType}|${def.triggerCondition}`;
        if (mergedByKey[mergeKey]) {
            mergedByKey[mergeKey].effectiveValue += value; // collapse: sum
        } else {
            mergedByKey[mergeKey] = {
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

    return [...Object.values(mergedByKey), ...signatures];
}

/**
 * Persona (Boogeyman) damage-reduction merge. Applied at the fight RESOLVE read-site on the
 * FRESH moveBonuses copy — NEVER baked into the frozen snapshot.
 *
 * COLLAPSE INVARIANT: the engine reads OPPONENT_DAMAGE_REDUCTION via the FIRST `.find()`
 * match, so a persona bonus MUST be SUMMED into any existing same-bonusType entry rather than
 * appended (an appended second entry would be silently ignored). When no such entry exists,
 * we push one shaped like a merged PASSIVE entry so downstream trigger/getBonusValue reads it.
 *
 * Since v2 buildMoveBonuses merges on bonusType|triggerCondition, so "the first same-bonusType
 * entry" is only guaranteed to be THE entry for bonusTypes with a single triggerCondition
 * catalog-wide (validateCatalog enforces that for everything outside MULTI_TRIGGER_BONUS_TYPES).
 * OPPONENT_DAMAGE_REDUCTION qualifies: Granite Jaw, Veteran IQ and High Guard are all ALWAYS and
 * collapse into one entry. Do NOT call this with a MULTI_TRIGGER bonusType (e.g. STRIKE_DAMAGE):
 * the first match could be a gated entry such as Second Gear.
 *
 * No-op when `value` is falsy/non-positive or `moveBonuses` is not an array. Mutates in place.
 */
function mergePersonaBonus(moveBonuses, bonusType, value) {
    if (!Array.isArray(moveBonuses)) return moveBonuses;
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return moveBonuses;
    const existing = moveBonuses.find((b) => b.bonusType === bonusType);
    if (existing) {
        existing.effectiveValue = (existing.effectiveValue || 0) + value;
    } else {
        moveBonuses.push({
            moveId: `persona:${bonusType}`,
            bonusType,
            effectiveValue: value,
            triggerCondition: null,
            effectType: EFFECT_TYPE.PASSIVE,
            triggered: false,
            triggerCount: 0,
        });
    }
    return moveBonuses;
}

/**
 * PROC bonusTypes the Boogeyman AMBUSH signature is allowed to scale. SPRAWL_SUCCESS is
 * DELIBERATELY excluded (over-swings sprawl-heavy loadouts) and left untouched.
 *
 * v2 adds STRIKE_DAMAGE (Second Gear / Deep Waters; scaleProcs only touches PROC entries, so the
 * PASSIVE Heavy Hands entry is never scaled), SUBMISSION_SUCCESS (Guillotine Choke) and
 * FLASH_KO_RESISTANCE (Fighting Spirit). The AMBUSH_PROC_ABS_CAP still bounds every one of them.
 */
const AMBUSH_SCALABLE_PROCS = new Set([
    "ESCAPE_PROBABILITY", "CLINCH_DAMAGE", "STAMINA_DRAIN", "GNP_DAMAGE",
    "STRIKE_DAMAGE", "SUBMISSION_SUCCESS", "FLASH_KO_RESISTANCE",
]);

/** Absolute ceiling on how much AMBUSH may add to a single proc value (future-proof guard). */
const AMBUSH_PROC_ABS_CAP = 0.02;

/**
 * Persona (Boogeyman AMBUSH signature) proc scaling. Multiplies the effectiveValue of equipped
 * PROC entries by `mult`, but ONLY for the whitelisted bonusTypes (SPRAWL_SUCCESS excluded), and
 * never by more than AMBUSH_PROC_ABS_CAP absolute (`boosted = min(value*mult, value+0.02)`).
 * Applied at the resolve read-site on the FRESH moveBonuses copy — NEVER baked into the frozen
 * snapshot. No-op when mult is 1/falsy or not an array.
 */
function scaleProcs(moveBonuses, mult) {
    if (!Array.isArray(moveBonuses)) return moveBonuses;
    if (typeof mult !== "number" || Number.isNaN(mult) || mult === 1) return moveBonuses;
    for (const b of moveBonuses) {
        if (b.effectType !== EFFECT_TYPE.PROC) continue;
        if (!AMBUSH_SCALABLE_PROCS.has(b.bonusType)) continue;
        if (typeof b.effectiveValue !== "number") continue;
        const boosted = Math.min(b.effectiveValue * mult, b.effectiveValue + AMBUSH_PROC_ABS_CAP);
        b.effectiveValue = boosted;
    }
    return moveBonuses;
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
    buildCatalog,
    equipMove,
    unequipMove,
    grantOrUpgrade,
    rollMoveDrop,
    rollCampMoveDrop,
    dropRarityWeightsForGym,
    buildMoveBonuses,
    buildMoveBonusesSnapshot,
    // persona resolve-site helpers (never touch the frozen snapshot)
    mergePersonaBonus,
    scaleProcs,
    // display helpers (Catalog ladder)
    toRating,
    ratingUnitFor,
    RATING_UNIT_BY_BONUS_TYPE,
    // exported for tests
    describeMove,
    weightedRarityPick,
};
