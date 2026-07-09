import { memo } from "react";
import { Check, Lock } from "lucide-react";
import { MoveArt } from "./MoveArt";
import { RARITY_LABELS } from "../../constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

/**
 * List view — one row per move (thumb + name + effect + rarity + Equip).
 * The row's Equip button quick-equips into the next open unlocked slot
 * (slot picking for a full loadout happens in the detail modal); tapping
 * anywhere else on the row opens MoveDetailModal.
 */
export const MoveList = memo(function MoveList({ moves, onSelect, onQuickEquip, nextOpenSlot, campLocked, busyMoveId, passiveCount = 0 }) {
    return (
        <div className="move-list">
            {moves.map((m) => {
                // Quick-equip always targets the next OPEN (unoccupied) slot, so
                // a passive move quick-equipped here is always a net-new passive —
                // block it once 2 are already equipped (see MovesTab.passiveCount).
                const blockedByPassiveCap = m.effectType === "PASSIVE" && passiveCount >= 2;
                const canQuickEquip = !m.isEquipped && nextOpenSlot != null && !campLocked && !blockedByPassiveCap;
                const busy = busyMoveId === m.moveId;
                return (
                    <div key={m.moveId} className="move-list-row" onClick={() => onSelect(m)}>
                        <MoveArt art={m.art} rarity={m.rarity} size="thumb" showDot />
                        <div className="move-list-info">
                            <div className="move-list-name">{m.name}</div>
                            <div className="move-list-desc">{m.description}</div>
                        </div>
                        <span className="move-list-rarity" data-rarity={m.rarity}>
                            {RARITY_LABELS[m.rarity] || m.rarity}
                        </span>
                        {m.isEquipped ? (
                            <span className="move-list-equipped-badge"><Check size={11} /> {t("moves.list.equipped")}</span>
                        ) : (
                            <button
                                type="button"
                                className="move-list-equip-btn"
                                disabled={!canQuickEquip || busy}
                                title={
                                    campLocked ? t("moves.campLockedHint")
                                        : blockedByPassiveCap ? t("moves.list.passiveCapBlocked")
                                            : nextOpenSlot == null ? t("moves.list.noOpenSlot")
                                                : undefined
                                }
                                onClick={(e) => { e.stopPropagation(); onQuickEquip(m); }}
                            >
                                {!campLocked && (nextOpenSlot == null || blockedByPassiveCap) ? <Lock size={11} /> : null}
                                {busy ? "…" : t("moves.list.equip")}
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
});
