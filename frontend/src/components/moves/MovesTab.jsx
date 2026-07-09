import { useCallback, useMemo, useState } from "react";
import { LayoutGrid, List, Lock } from "lucide-react";
import { useSpecialMoves } from "../../hooks/useSpecialMoves";
import { EquippedSlots } from "./EquippedSlots";
import { MoveGrid } from "./MoveGrid";
import { MoveList } from "./MoveList";
import { MoveDetailModal } from "./MoveDetailModal";
import { t } from "@/lib/i18n";

const VIEW_KEY = "gnp_moves_view";

function loadView() {
    try {
        const v = localStorage.getItem(VIEW_KEY);
        return v === "list" ? "list" : "grid";
    } catch {
        return "grid";
    }
}

/**
 * Special Moves page. Consumes GET /fighters/:id/moves via useSpecialMoves
 * and renders: slot summary, EquippedSlots, and the owned-move collection
 * (grid/list toggle, remembered in localStorage). Tapping any move opens
 * MoveDetailModal. All three async states (loading/success/error) are
 * handled here; equip/unequip patch state from the endpoint's own returned
 * payload so nothing flickers on click-resolve.
 */
export function MovesTab({ fighter, onMessage }) {
    const fighterId = fighter?._id;
    const { data, loading, error, actionError, equip, unequip, refetch } = useSpecialMoves(fighterId);

    const [view, setView] = useState(loadView);
    const [selectedMoveId, setSelectedMoveId] = useState(null);
    const [busySlot, setBusySlot] = useState(null);
    const [busyMoveId, setBusyMoveId] = useState(null);

    const setViewPersist = useCallback((v) => {
        setView(v);
        try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore storage errors */ }
    }, []);

    const equippedBySlot = useMemo(
        () => new Map((data?.equipped || []).map((m) => [m.slotIndex, m])),
        [data?.equipped]
    );

    // Backend caps always-on passives at 2 equipped — a 3rd slot must hold a
    // Proc or Signature move. Computed client-side from the current loadout
    // so the UI can block a doomed equip before it round-trips, while the
    // 400's own message still backstops it (see useSpecialMoves.actionError).
    const passiveCount = useMemo(
        () => (data?.equipped || []).filter((m) => m.effectType === "PASSIVE").length,
        [data?.equipped]
    );

    const nextOpenSlot = useMemo(() => {
        if (!data) return null;
        for (let i = 0; i < data.slotsUnlocked; i++) {
            if (!equippedBySlot.has(i)) return i;
        }
        return null;
    }, [data, equippedBySlot]);

    const selectedMove = useMemo(
        () => (selectedMoveId ? (data?.owned || []).find((m) => m.moveId === selectedMoveId) || null : null),
        [selectedMoveId, data?.owned]
    );

    const handleUnequip = useCallback(async (slotIndex) => {
        setBusySlot(slotIndex);
        const res = await unequip(slotIndex);
        setBusySlot(null);
        if (!res.ok) onMessage?.(res.error);
    }, [unequip, onMessage]);

    const handleEquip = useCallback(async (moveId, slotIndex) => {
        setBusyMoveId(moveId);
        const res = await equip(moveId, slotIndex);
        setBusyMoveId(null);
        return res;
    }, [equip]);

    const handleQuickEquip = useCallback(async (move) => {
        if (nextOpenSlot == null) return;
        const res = await handleEquip(move.moveId, nextOpenSlot);
        if (!res.ok) onMessage?.(res.error);
    }, [nextOpenSlot, handleEquip, onMessage]);

    if (loading && !data) {
        return (
            <section className="moves-tab">
                <div className="moves-loading">{t("moves.loading")}</div>
            </section>
        );
    }

    if (error && !data) {
        return (
            <section className="moves-tab">
                <div className="moves-error">
                    <span>{error}</span>
                    <button type="button" className="btn btn-secondary" onClick={() => refetch()}>
                        {t("moves.retry")}
                    </button>
                </div>
            </section>
        );
    }

    if (!data) return null;

    const { slotsUnlocked, maxSlots, nextSlotUnlocksAt, campLocked, equipped, owned } = data;

    return (
        <section className="moves-tab">
            <header className="page-header">
                <div className="page-header-left">
                    <div className="page-eyebrow">{t("moves.header.eyebrow")}</div>
                    <h1 className="page-title">{t("moves.header.title")}</h1>
                </div>
                <div className="slots-badge">
                    <span className="slots-label">{t("moves.header.slotsLabel")}</span>
                    <span className="slots-val">{slotsUnlocked} / {maxSlots}</span>
                    {nextSlotUnlocksAt && (
                        <span className="slots-hint">{t("moves.header.slotsHint", { tier: nextSlotUnlocksAt })}</span>
                    )}
                </div>
            </header>

            {campLocked && (
                <div className="moves-camp-lock-banner">
                    <Lock size={13} /> {t("moves.campLockedHint")}
                </div>
            )}

            <div className="moves-body">
                <div className="moves-slots-block">
                    <EquippedSlots
                        equipped={equipped}
                        maxSlots={maxSlots}
                        slotsUnlocked={slotsUnlocked}
                        campLocked={campLocked}
                        busySlot={busySlot}
                        onUnequip={handleUnequip}
                        onSelect={(m) => setSelectedMoveId(m.moveId)}
                    />
                    <div className="moves-passive-cap-hint">{t("moves.slots.passiveCapHint")}</div>
                </div>

                <div className="moves-collection">
                    <div className="moves-collection-header">
                        <div className="col-label">{t("moves.collection.label")}</div>
                        <div className="moves-view-toggle" role="group" aria-label={t("moves.collection.viewToggleAria")}>
                            <button
                                type="button"
                                className={`moves-view-btn${view === "grid" ? " active" : ""}`}
                                onClick={() => setViewPersist("grid")}
                                aria-pressed={view === "grid"}
                            >
                                <LayoutGrid size={13} /> {t("moves.collection.grid")}
                            </button>
                            <button
                                type="button"
                                className={`moves-view-btn${view === "list" ? " active" : ""}`}
                                onClick={() => setViewPersist("list")}
                                aria-pressed={view === "list"}
                            >
                                <List size={13} /> {t("moves.collection.list")}
                            </button>
                        </div>
                    </div>

                    {owned.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-state-text">{t("moves.collection.empty")}</span>
                        </div>
                    ) : view === "grid" ? (
                        <MoveGrid moves={owned} onSelect={(m) => setSelectedMoveId(m.moveId)} />
                    ) : (
                        <MoveList
                            moves={owned}
                            onSelect={(m) => setSelectedMoveId(m.moveId)}
                            onQuickEquip={handleQuickEquip}
                            nextOpenSlot={nextOpenSlot}
                            campLocked={campLocked}
                            busyMoveId={busyMoveId}
                            passiveCount={passiveCount}
                        />
                    )}
                </div>
            </div>

            <MoveDetailModal
                move={selectedMove}
                maxSlots={maxSlots}
                slotsUnlocked={slotsUnlocked}
                equippedBySlot={equippedBySlot}
                nextOpenSlot={nextOpenSlot}
                passiveCount={passiveCount}
                campLocked={campLocked}
                busy={busyMoveId === selectedMove?.moveId || (selectedMove?.isEquipped && busySlot === selectedMove.slotIndex)}
                equipError={selectedMove ? actionError : ""}
                onEquipToSlot={(slotIndex) => handleEquip(selectedMove.moveId, slotIndex)}
                onUnequip={(slotIndex) => handleUnequip(slotIndex)}
                onClose={() => setSelectedMoveId(null)}
            />
        </section>
    );
}
