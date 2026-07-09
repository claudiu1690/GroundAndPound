import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Lock } from "lucide-react";
import { MoveArt } from "./MoveArt";
import { RarityPips } from "./RarityPips";
import { RARITY_LABELS, EFFECT_TYPE_LABELS } from "../../constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

/**
 * Backend caps always-on passives at 2 equipped (a 3rd slot must hold a Proc
 * or Signature move). A passive-for-passive swap into an occupied passive
 * slot leaves the net passive count unchanged, so only block when equipping
 * `move` into `occupant`'s slot would create a 3rd passive.
 */
function wouldExceedPassiveCap(move, occupant, passiveCount) {
    if (move?.effectType !== "PASSIVE") return false;
    if (occupant?.effectType === "PASSIVE") return false;
    return passiveCount >= 2;
}

function formatRelative(d) {
    if (!d) return "";
    const then = new Date(d).getTime();
    if (!Number.isFinite(then)) return "";
    const diff = Math.max(0, Date.now() - then);
    const days = Math.floor(diff / 86400000);
    if (days < 1) return t("moves.detail.acquiredToday");
    if (days === 1) return t("moves.detail.acquiredDaysAgo", { n: 1 });
    return t("moves.detail.acquiredDaysAgo", { n: days });
}

/**
 * The tall portrait card (2:3), painted-card treatment reused from the
 * sponsor cards — reserved for the detail view and the drop reveal (never
 * the grid/list/equipped tiles, per spec). Rarity is a CSS frame + glow via
 * MoveArt's --rarity-color, never baked into the art.
 */
export function MoveDetailModal({
    move,
    maxSlots,
    slotsUnlocked,
    equippedBySlot, // Map<slotIndex, moveView>
    nextOpenSlot, // first unlocked, unoccupied slotIndex, or null
    passiveCount = 0, // count of currently-equipped PASSIVE moves
    campLocked,
    busy,
    equipError,
    onEquipToSlot,
    onUnequip,
    onClose,
}) {
    useEffect(() => {
        if (!move) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [move, onClose]);

    if (!move) return null;

    return createPortal(
        <div className="move-detail-root" role="dialog" aria-modal="true" aria-label={t("moves.detail.dialogLabel")}>
            <div className="move-detail-backdrop" onClick={onClose} />
            <div className="move-detail-shell">
                <button type="button" className="move-detail-close" onClick={onClose} aria-label={t("moves.detail.closeLabel")}>
                    <X size={18} />
                </button>

                <div className="move-detail-cardwrap">
                    <MoveArt art={move.art} rarity={move.rarity} size="tall" />
                </div>

                <div className="move-detail-name">{move.name}</div>
                <div className="move-detail-meta-row">
                    <span className="move-detail-rarity" data-rarity={move.rarity}>{RARITY_LABELS[move.rarity] || move.rarity}</span>
                    <span className="move-detail-effect-type">{EFFECT_TYPE_LABELS[move.effectType] || move.effectType}</span>
                </div>
                {move.rarity && <RarityPips rarity={move.rarity} />}

                <div className="move-detail-description">{move.description}</div>
                {move.flavor && <div className="move-detail-flavor">&ldquo;{move.flavor}&rdquo;</div>}
                {move.acquiredAt && <div className="move-detail-acquired">{formatRelative(move.acquiredAt)}</div>}

                <div className="move-detail-actions">
                    {campLocked && (
                        <div className="move-detail-camp-lock"><Lock size={12} /> {t("moves.campLockedHint")}</div>
                    )}

                    {move.isEquipped ? (
                        <button
                            type="button"
                            className="btn btn-secondary move-detail-unequip-btn"
                            disabled={campLocked || busy}
                            onClick={() => onUnequip(move.slotIndex)}
                        >
                            {busy ? "…" : t("moves.detail.unequipFromSlot", { n: move.slotIndex + 1 })}
                        </button>
                    ) : (
                        <div className="move-detail-slot-picker">
                            <div className="move-detail-slot-picker-label">{t("moves.detail.equipToSlot")}</div>
                            <div className="move-detail-slot-buttons">
                                {/* Equip slots are a compact, gap-free list on the backend — there is
                                    no way to target "slot 3" specifically while slot 2 sits empty, so
                                    a free slot is offered as a single action rather than N buttons that
                                    would all resolve identically. */}
                                {nextOpenSlot != null && (() => {
                                    const capBlocked = wouldExceedPassiveCap(move, null, passiveCount);
                                    return (
                                        <button
                                            type="button"
                                            className="move-detail-slot-btn move-detail-slot-btn--open"
                                            disabled={campLocked || busy || capBlocked}
                                            title={capBlocked ? t("moves.detail.passiveCapBlocked") : undefined}
                                            onClick={() => onEquipToSlot(nextOpenSlot)}
                                        >
                                            {busy ? "…" : t("moves.detail.equipOpenSlot")}
                                        </button>
                                    );
                                })()}

                                {Array.from({ length: maxSlots }, (_, i) => i).map((slotIndex) => {
                                    const locked = slotIndex >= slotsUnlocked;
                                    const occupant = equippedBySlot.get(slotIndex);
                                    if (locked) {
                                        return (
                                            <div className="move-detail-slot-locked-note" key={slotIndex}>
                                                <Lock size={11} /> {t("moves.detail.slotLocked", { n: slotIndex + 1 })}
                                            </div>
                                        );
                                    }
                                    if (!occupant) return null; // covered by the single "open slot" button above
                                    const capBlocked = wouldExceedPassiveCap(move, occupant, passiveCount);
                                    return (
                                        <button
                                            type="button"
                                            key={slotIndex}
                                            className="move-detail-slot-btn"
                                            disabled={campLocked || busy || capBlocked}
                                            title={capBlocked ? t("moves.detail.passiveCapBlocked") : undefined}
                                            onClick={() => onEquipToSlot(slotIndex)}
                                        >
                                            {t("moves.detail.slotSwap", { n: slotIndex + 1, name: occupant.name })}
                                        </button>
                                    );
                                })}
                            </div>
                            {move.effectType === "PASSIVE" && passiveCount >= 2 && (
                                <div className="move-detail-passive-cap-note">{t("moves.detail.passiveCapBlocked")}</div>
                            )}
                        </div>
                    )}

                    {equipError && <div className="move-detail-error">{equipError}</div>}
                </div>
            </div>
        </div>,
        document.body
    );
}
