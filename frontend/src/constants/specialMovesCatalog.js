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
