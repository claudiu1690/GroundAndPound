import { ladderCells } from "./catalogModel";
import { RARITY_COLORS, RARITY_LABELS } from "../../constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

/**
 * The move's full rarity ladder (dense from `minRarity`, ascending — see
 * docs/special-moves-catalog-spec.md §3), with the player's best-pulled
 * rarity (if any) highlighted. Always renders 4 cells (ladderCells pads to
 * RARITY order) so a 2-rung Signature and a 4-rung Passive/Proc never
 * reflow differently. Detail-modal only; the modal is portaled to
 * document.body, so its CSS must stay unscoped (App.css).
 */
export function RarityLadder({ ladder, ownedRarity }) {
    const cells = ladderCells(ladder);
    const unit = ladder?.[0]?.unit;

    return (
        <div className="move-ladder" aria-label={t("moves.catalog.ladder.aria")}>
            {unit && <div className="move-ladder-unit">{unit}</div>}
            <div className="move-ladder-row">
                {cells.map(({ rarity, rung }) => {
                    const isEmpty = !rung;
                    const isOwned = !isEmpty && rarity === ownedRarity;
                    return (
                        <div
                            key={rarity}
                            className={`move-ladder-cell${isEmpty ? " is-empty" : ""}${isOwned ? " is-owned" : ""}`}
                            style={{ "--rarity-color": RARITY_COLORS[rarity] }}
                            aria-label={isEmpty ? t("moves.catalog.ladder.notAvailable", { rarity: RARITY_LABELS[rarity] }) : undefined}
                        >
                            <span className="move-ladder-rarity">{RARITY_LABELS[rarity]}</span>
                            <span className="move-ladder-rating">{isEmpty ? "" : `+${rung.rating}`}</span>
                            {isOwned && <span className="move-ladder-owned-tag">{t("moves.catalog.ladder.yours")}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
