import { Award, ChevronRight } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * The perks this fighter permanently holds.
 *
 * These are Rank-4 coach rewards with real mechanical effects (an extra fight-camp slot, a
 * match-status floor, a bigger escape bonus), but until now they were rendered NOWHERE in
 * the app — the only place a perk appeared was inside the selected coach's Development
 * Track on the camp screen, which meant a player who had claimed one could not find out
 * what they owned. `perksOwned` arrives on the fighter payload already resolved to
 * name + effect by fighterService, so this card never restates a number.
 *
 * Rendered on the owner's own profile only; shown even when empty so the ladder to Rank 4
 * is discoverable rather than invisible.
 */
export function PerksCard({ fighter, onNavigate }) {
    const perks = Array.isArray(fighter?.perksOwned) ? fighter.perksOwned : [];

    return (
        <div className="profile-card perks-card">
            <div className="profile-card-head">
                <div className="profile-card-title">
                    <Award size={13} /> {t("career.perks.title")}
                </div>
                <button type="button" className="perks-card-link" onClick={() => onNavigate?.("camp")}>
                    {t("career.perks.manage")} <ChevronRight size={12} />
                </button>
            </div>

            {perks.length === 0 ? (
                <div className="perks-empty">{t("career.perks.empty")}</div>
            ) : (
                <ul className="perks-list">
                    {perks.map((p) => (
                        <li key={p.key} className="perk-row">
                            <span className="perk-name">{p.name}</span>
                            <span className="perk-effect">{p.effect}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
