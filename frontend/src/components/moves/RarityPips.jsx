import { RARITY, RARITY_COLORS, RARITY_SCALE_WORDS, rarityIndex } from "../../constants/specialMovesCatalog";

/**
 * Rarity magnitude pips + scale word ("Slight / Solid / Heavy / Brutal").
 * The qualitative carrier for how big a move's effect is — the exact numbers
 * live in the move description. Filled pips = rarity rank + 1, tinted with
 * the rarity color; empty pips stay neutral.
 */
export function RarityPips({ rarity, showWord = true }) {
    const idx = rarityIndex(rarity);
    if (idx < 0) return null;
    const color = RARITY_COLORS[rarity];
    return (
        <span className="rarity-pips" style={{ "--rarity-color": color }} aria-label={RARITY_SCALE_WORDS[rarity]}>
            {RARITY.map((r, i) => (
                <span key={r} className={`rarity-pip${i <= idx ? " is-filled" : ""}`} aria-hidden="true" />
            ))}
            {showWord && <span className="rarity-pips-word">{RARITY_SCALE_WORDS[rarity]}</span>}
        </span>
    );
}
