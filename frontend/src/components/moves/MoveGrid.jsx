import { memo } from "react";
import { MoveArt } from "./MoveArt";
import { t } from "@/lib/i18n";

/**
 * Default collection view — small square art icons, rarity by frame + corner
 * dot, name underneath. Dense (~6-7 per row via CSS auto-fill) so a large
 * collection stays a few rows, not endless scroll. Tap -> detail modal.
 *
 * Also doubles as the Catalog view's grid: an entry with `owned === false`
 * (strict check — My Moves entries are always `owned: true` and unaffected)
 * renders locked via MoveArt.
 */
export const MoveGrid = memo(function MoveGrid({ moves, onSelect }) {
    return (
        <div className="move-grid">
            {moves.map((m) => {
                const locked = m.owned === false;
                return (
                    <button
                        type="button"
                        key={m.moveId}
                        className={`move-grid-item${m.isEquipped ? " is-equipped" : ""}${locked ? " is-locked" : ""}`}
                        aria-label={locked ? t("moves.catalog.notOwnedAria", { name: m.name }) : undefined}
                        onClick={() => onSelect(m)}
                    >
                        <MoveArt art={m.art} rarity={m.rarity} size="sm" showDot locked={locked} />
                        <span className="move-grid-item-name">{m.name}</span>
                    </button>
                );
            })}
        </div>
    );
});
