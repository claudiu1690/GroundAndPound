import { RARITY, RARITY_LABELS } from "@/constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

const TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];

function rarityPct(weights, rarity) {
    if (!weights) return null;
    const total = RARITY.reduce((sum, r) => sum + (weights[r] || 0), 0);
    if (total <= 0) return null;
    return Math.round(((weights[rarity] || 0) / total) * 100);
}

/**
 * Sidebar panel for the FREE gym — no ranks to show, so instead the panel
 * sells the specialty gym system: per-tier weekly cost, XP multiplier, and
 * loot ceiling (rare/legendary odds), derived from the other gyms already
 * in `allGyms`.
 */
export function SpecialtyPitchPanel({ allGyms }) {
    const specialtyGyms = (allGyms || []).filter((g) => !g.isFreeGym);
    const tiers = TIER_ORDER
        .map((tier) => specialtyGyms.filter((g) => g.availableFrom === tier))
        .filter((group) => group.length > 0);

    if (tiers.length === 0) return null;

    return (
        <div className="gym-panel">
            <div className="gym-panel-title">{t("gym.specialtyPitch.title")}</div>
            <div className="elsewhere">
                {tiers.map((group) => {
                    const tier = group[0].availableFrom;
                    const weeklyCost = Math.min(...group.map((g) => g.weeklyCost || 0));
                    const focusMult = group[0].focusXpMultiplier;
                    const rarePct = rarityPct(group[0].dropRarityWeights, "RARE");
                    const legPct = rarityPct(group[0].dropRarityWeights, "LEGENDARY");

                    return (
                        <div key={tier}>
                            <div className="else-row">
                                <b>{tier}</b>
                                <span>{t("gym.specialtyPitch.perWeek", { cost: weeklyCost.toLocaleString() })}</span>
                            </div>
                            <p className="sub-line">
                                {t("gym.specialtyPitch.xpMult", { mult: focusMult })}
                                {rarePct != null && legPct != null && (
                                    <> · {t("gym.specialtyPitch.oddsPair", {
                                        rareLabel: RARITY_LABELS.RARE,
                                        rarePct,
                                        legLabel: RARITY_LABELS.LEGENDARY,
                                        legPct,
                                    })}</>
                                )}
                            </p>
                        </div>
                    );
                })}
            </div>
            <div className="side-note">{t("gym.specialtyPitch.footerNote")}</div>
        </div>
    );
}
