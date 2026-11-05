/**
 * Special Moves — frontend display constants only.
 *
 * Move definitions (names, values, flavor, art) come entirely from the API
 * (`GET /fighters/:id/moves`, `MoveView`). This file mirrors ONLY the
 * display enums needed to render the API's response — rarity ladder,
 * rarity frame/glow colors, effect-type labels, and slot-unlock tier
 * labels (matching the promotion-tier gating described in the GDD).
 * No business logic — slot-unlock truth comes from the API's
 * `slotsUnlocked`/`nextSlotUnlocksAt` fields, not from this file.
 */

/** Rarity ladder, low → high. */
export const RARITY = ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"];

export const RARITY_LABELS = {
    COMMON: "Common",
    UNCOMMON: "Uncommon",
    RARE: "Rare",
    LEGENDARY: "Legendary",
};

/**
 * Frame + glow color per rarity — applied as a CSS custom property
 * (`--rarity-color`) on the card/tile wrapper, never baked into art.
 * Mirrors the app's existing dark-theme palette (App.css :root) rather
 * than introducing new hex values:
 *   COMMON    -> var(--c-text-2)    (#888888, gray)
 *   UNCOMMON  -> var(--green-bright)(#22c55e)
 *   RARE      -> var(--blue-bright) (#3b82f6)
 *   LEGENDARY -> var(--gold-bright) (#D4A820)
 */
export const RARITY_COLORS = {
    COMMON: "#888888",
    UNCOMMON: "#22c55e",
    RARE: "#3b82f6",
    LEGENDARY: "#D4A820",
};

export const EFFECT_TYPE_LABELS = {
    PASSIVE: "Passive",
    PROC: "Proc",
    SIGNATURE: "Signature",
};

/**
 * Scale word per rarity — the qualitative carrier for a move's magnitude
 * ("Brutal" reads; "0.8%" doesn't). Shown next to the rarity pips; the exact
 * math stays in the description's parenthetical.
 */
export const RARITY_SCALE_WORDS = {
    COMMON: "Slight",
    UNCOMMON: "Solid",
    RARE: "Heavy",
    LEGENDARY: "Brutal",
};

/** Display-only labels for each of the 3 equip slots' unlock tier (GDD §2). */
export const SLOT_TIER_LABELS = ["Amateur", "Regional Pro", "National"];

export function rarityIndex(rarity) {
    return RARITY.indexOf(rarity);
}

/**
 * Display-only mirror of the backend trigger conditions in plain words (fight reveal cards and the
 * fight report). Unknown conditions fall back to no text.
 */
export const TRIGGER_WORDS = {
    ALWAYS: "Always on",
    OPPONENT_SHOOTS_TAKEDOWN: "When they shoot a takedown",
    OPPONENT_ATTEMPTS_SUBMISSION: "When they go for a submission",
    STRIKING_EXCHANGE: "In a striking exchange",
    PLAYER_STAMINA_BELOW_70: "When your tank drops under 70%",
    PLAYER_TOP_POSITION: "From top position",
    OPPONENT_STAMINA_BELOW_70: "When they tire under 70%",
    PLAYER_ATTEMPTS_SUBMISSION: "When you go for a submission",
    LATE_ROUNDS: "In the late rounds",
    PLAYER_HEALTH_BELOW_75: "When you're hurt, under 75%",
    OPPONENT_HEALTH_BELOW_75: "When they're under 75% health",
    PLAYER_ON_BOTTOM: "The first time you're on your back",
    OPPONENT_HEALTH_BELOW_50: "When they're under 50% health",
    ROUND_ONE: "Round one, opening exchange",
    PLAYER_FIRST_TAKEDOWN_LANDED: "Your first takedown of the night",
    FIRST_SUBMISSION_FROM_TOP: "Your first submission from top",
};
