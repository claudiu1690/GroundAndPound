import { Lock, Plus, ChevronRight } from "lucide-react";
import { useSpecialMoves } from "../../hooks/useSpecialMoves";
import { MoveArt } from "../moves/MoveArt";
import { RARITY_COLORS, RARITY_LABELS, EFFECT_TYPE_LABELS, SLOT_TIER_LABELS } from "@/constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

/**
 * Read-only "Loadout" strip on the Profile — mirrors the fighter's equipped
 * Special Moves next to the Championship Belts (the identity / show-off angle),
 * with a link into the Moves tab to actually change them.
 *
 * OWNER-ONLY: GET /fighters/:id/moves is guarded to the fighter's owner, so this
 * card is rendered only when ProfilePane is NOT in readOnly (other-profile) mode.
 */
export function EquippedMovesCard({ fighterId, onNavigate }) {
    const { data, loading } = useSpecialMoves(fighterId);

    const goManage = () => onNavigate?.("moves");

    const slotsUnlocked = data?.slotsUnlocked ?? 1;
    const maxSlots = data?.maxSlots ?? 3;
    const bySlot = new Map((data?.equipped ?? []).map((m) => [m.slotIndex, m]));

    return (
        <div className="p-card">
            <div className="p-card-lbl loadout-lbl">
                {t("career.loadout.cardLabel")}
                <button type="button" className="loadout-manage" onClick={goManage}>
                    {t("career.loadout.manage")} <ChevronRight size={12} />
                </button>
            </div>

            {loading ? (
                <div className="career-empty">{t("career.loadout.loading")}</div>
            ) : (
                <div className="loadout-slots">
                    {Array.from({ length: maxSlots }, (_, i) => i).map((i) => {
                        const move = bySlot.get(i);
                        const locked = i >= slotsUnlocked;

                        if (move) {
                            return (
                                <button
                                    type="button"
                                    key={i}
                                    className="loadout-slot loadout-slot--filled"
                                    onClick={goManage}
                                    style={{ "--rarity-color": RARITY_COLORS[move.rarity] || RARITY_COLORS.COMMON }}
                                    title={move.description || move.name}
                                >
                                    <MoveArt art={move.art} rarity={move.rarity} size="thumb" />
                                    <div className="loadout-slot-info">
                                        <div className="loadout-slot-name">{move.name}</div>
                                        <div className="loadout-slot-meta">
                                            {RARITY_LABELS[move.rarity] || move.rarity} · {EFFECT_TYPE_LABELS[move.effectType] || move.effectType}
                                        </div>
                                    </div>
                                </button>
                            );
                        }

                        if (locked) {
                            const tier = SLOT_TIER_LABELS[i];
                            return (
                                <div key={i} className="loadout-slot loadout-slot--locked">
                                    <div className="loadout-slot-icon"><Lock size={14} /></div>
                                    <div className="loadout-slot-meta">
                                        {tier ? t("career.loadout.unlocksAt", { tier }) : t("career.loadout.locked")}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <button type="button" key={i} className="loadout-slot loadout-slot--empty" onClick={goManage}>
                                <div className="loadout-slot-icon"><Plus size={16} /></div>
                                <div className="loadout-slot-meta">{t("career.loadout.empty")}</div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
