import { memo } from "react";
import { Lock, X } from "lucide-react";
import { MoveArt } from "./MoveArt";
import { SLOT_TIER_LABELS } from "../../constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

/**
 * Up to 3 compact horizontal tiles — the active loadout at a glance.
 * Locked slots (index >= slotsUnlocked) render as a disabled placeholder
 * naming the tier that unlocks them. Presentational only: unequip goes
 * through the parent's mutator (useSpecialMoves), which already handles the
 * loading/error states for that call.
 */
export const EquippedSlots = memo(function EquippedSlots({
    equipped,
    maxSlots,
    slotsUnlocked,
    campLocked,
    busySlot,
    onUnequip,
    onSelect,
}) {
    const bySlot = new Map((equipped || []).map((m) => [m.slotIndex, m]));

    return (
        <div className="equipped-slots" data-tut="equipped-slots">
            {Array.from({ length: maxSlots }, (_, i) => i).map((slotIndex) => {
                const locked = slotIndex >= slotsUnlocked;
                const move = bySlot.get(slotIndex);

                if (locked) {
                    return (
                        <div key={slotIndex} className="equip-tile equip-tile--locked">
                            <div className="equip-tile-lock-icon"><Lock size={13} /></div>
                            <div className="equip-tile-lock-text">
                                {t("moves.slots.unlocksAt", { tier: SLOT_TIER_LABELS[slotIndex] || "?" })}
                            </div>
                        </div>
                    );
                }

                if (!move) {
                    return (
                        <div key={slotIndex} className="equip-tile equip-tile--empty">
                            <div className="equip-tile-empty-text">{t("moves.slots.empty")}</div>
                        </div>
                    );
                }

                return (
                    <div
                        key={slotIndex}
                        className="equip-tile equip-tile--filled"
                        onClick={() => onSelect?.(move)}
                        role="button"
                        tabIndex={0}
                    >
                        <MoveArt art={move.art} rarity={move.rarity} size="thumb" />
                        <div className="equip-tile-body">
                            <div className="equip-tile-name">{move.name}</div>
                            <div className="equip-tile-desc">{move.description}</div>
                        </div>
                        <button
                            type="button"
                            className="equip-tile-unequip"
                            disabled={campLocked || busySlot === slotIndex}
                            title={campLocked ? t("moves.campLockedHint") : t("moves.slots.unequip")}
                            aria-label={t("moves.slots.unequip")}
                            onClick={(e) => { e.stopPropagation(); onUnequip?.(slotIndex); }}
                        >
                            <X size={13} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
});
