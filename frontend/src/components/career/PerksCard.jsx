import { ChevronRight } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * The perks this fighter permanently holds.
 *
 * These are Rank-4 coach rewards with real mechanical effects (an extra fight-camp slot, a
 * match-status floor, a bigger escape bonus), but they were rendered NOWHERE in the app —
 * the only place a perk appeared was inside the selected coach's Development Track on the
 * camp screen, so a player who had claimed one could not find out what they owned.
 * `perksOwned` arrives on the fighter payload already resolved to name + effect by
 * fighterService, so this card never restates a number.
 *
 * ⚠️ STRUCTURE MIRRORS EquippedMovesCard: `p-card` + `p-card-lbl` with a `loadout-manage`
 * link, all scoped under `.career-page`. The first version of this card invented its own
 * `profile-card*` class names, none of which existed in the stylesheet, so it rendered with
 * no background, border or padding at all. Match the neighbours — don't invent a wrapper.
 *
 * Rendered on the owner's own profile only; shown even when empty so the ladder to Rank 4
 * is discoverable rather than invisible.
 */
export function PerksCard({ fighter, onNavigate }) {
    const perks = Array.isArray(fighter?.perksOwned) ? fighter.perksOwned : [];

    return (
        <div className="p-card">
            <div className="p-card-lbl loadout-lbl">
                {t("career.perks.title")}
                <button type="button" className="loadout-manage" onClick={() => onNavigate?.("camp")}>
                    {t("career.perks.manage")} <ChevronRight size={12} />
                </button>
            </div>

            {perks.length === 0 ? (
                <div className="career-empty">{t("career.perks.empty")}</div>
            ) : (
                <div className="perk-list">
                    {perks.map((p) => (
                        <div key={p.key} className="perk-row">
                            <span className="perk-name">{p.name}</span>
                            <span className="perk-effect">{p.effect}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
