import { RARITY, RARITY_LABELS, RARITY_COLORS } from "@/constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

/**
 * Sits inside the Sparring Ring, above the cards. Two-layer answer to
 * "will I find one?" (qualitative — the exact base rate is deliberately
 * NOT shown) then "how good will it be?" (rarity split, as real
 * percentages on a stacked bar).
 *
 * Renders nothing when dropRarityWeights is null (backend hasn't attached
 * the tier's weights yet) — the odds box is a bonus, not a hard requirement.
 */
export function LootOddsBox({ dropRarityWeights, isFreeGym }) {
    if (!dropRarityWeights) return null;

    const total = RARITY.reduce((sum, r) => sum + (dropRarityWeights[r] || 0), 0);
    if (total <= 0) return null;

    const pcts = RARITY.reduce((acc, r) => {
        acc[r] = Math.round(((dropRarityWeights[r] || 0) / total) * 100);
        return acc;
    }, {});

    return (
        <div className="loot-box">
            <div className="loot-line1">
                {isFreeGym ? t("gym.loot.line1Free") : t("gym.loot.line1")}
            </div>
            <span className="loot-lbl">{t("gym.loot.rarityLabel")}</span>
            <div className="loot-bar">
                {RARITY.map((r) => (
                    pcts[r] > 0 && (
                        <div
                            key={r}
                            className="loot-seg"
                            style={{ flex: pcts[r], background: RARITY_COLORS[r] }}
                        >
                            {pcts[r] >= 8 ? `${pcts[r]}%` : ""}
                        </div>
                    )
                ))}
            </div>
            <div className="loot-legend">
                {RARITY.map((r) => (
                    r === "LEGENDARY" && isFreeGym ? (
                        <span key={r} className="loot-legend-lock">
                            <i style={{ background: RARITY_COLORS[r] }} />
                            {t("gym.loot.legendaryNeverDrops")}
                        </span>
                    ) : (
                        <span key={r}>
                            <i style={{ background: RARITY_COLORS[r] }} />
                            {t("gym.loot.legendItem", { label: RARITY_LABELS[r], pct: pcts[r] })}
                        </span>
                    )
                ))}
            </div>
        </div>
    );
}
