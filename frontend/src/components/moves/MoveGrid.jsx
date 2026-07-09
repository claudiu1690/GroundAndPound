import { memo } from "react";
import { MoveArt } from "./MoveArt";

/**
 * Default collection view — small square art icons, rarity by frame + corner
 * dot, name underneath. Dense (~6-7 per row via CSS auto-fill) so a large
 * collection stays a few rows, not endless scroll. Tap -> detail modal.
 */
export const MoveGrid = memo(function MoveGrid({ moves, onSelect }) {
    return (
        <div className="move-grid">
            {moves.map((m) => (
                <button
                    type="button"
                    key={m.moveId}
                    className={`move-grid-item${m.isEquipped ? " is-equipped" : ""}`}
                    onClick={() => onSelect(m)}
                >
                    <MoveArt art={m.art} rarity={m.rarity} size="sm" showDot />
                    <span className="move-grid-item-name">{m.name}</span>
                </button>
            ))}
        </div>
    );
});
