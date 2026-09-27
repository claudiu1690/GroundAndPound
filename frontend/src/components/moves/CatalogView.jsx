import { useMemo, useState } from "react";
import { MoveGrid } from "./MoveGrid";
import {
    FILTER_ALL,
    TYPE_FILTERS,
    OWNERSHIP_FILTERS,
    disciplineOptions,
    filterCatalog,
    groupByDomain,
    collectedCount,
} from "./catalogModel";
import { EFFECT_TYPE_LABELS } from "../../constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

/**
 * Read-only Special Moves Catalog (docs/special-moves-catalog-spec.md):
 * every one of the 24 moves, owned or not, grouped by discipline with
 * client-side Discipline/Type/Ownership filters. Consumes the
 * catalog/catalogLoading/catalogError trio from useSpecialMoves (parent
 * fetches lazily via ensureCatalog) — this component only renders the three
 * async states and the filtered/grouped body.
 */
export function CatalogView({ catalog, loading, error, onRetry, onSelect }) {
    const [domain, setDomain] = useState(FILTER_ALL);
    const [effectType, setEffectType] = useState(FILTER_ALL);
    const [ownership, setOwnership] = useState(FILTER_ALL);

    const disciplines = useMemo(() => disciplineOptions(catalog?.moves || []), [catalog?.moves]);

    const groups = useMemo(
        () => groupByDomain(filterCatalog(catalog?.moves || [], { domain, effectType, ownership })),
        [catalog?.moves, domain, effectType, ownership]
    );

    const clearFilters = () => {
        setDomain(FILTER_ALL);
        setEffectType(FILTER_ALL);
        setOwnership(FILTER_ALL);
    };

    if (loading && !catalog) {
        return <div className="moves-loading">{t("moves.catalog.loading")}</div>;
    }

    if (error && !catalog) {
        return (
            <div className="moves-error">
                <span>{error}</span>
                <button type="button" className="btn btn-secondary" onClick={onRetry}>
                    {t("moves.retry")}
                </button>
            </div>
        );
    }

    if (!catalog) return null;

    const { owned, total } = collectedCount(catalog.moves || []);
    const isEmpty = groups.length === 0;

    return (
        <div className="moves-catalog">
            <div className="moves-catalog-summary">{t("moves.catalog.collected", { owned, total })}</div>

            <div className="moves-catalog-filters">
                <div className="moves-view-toggle" role="group" aria-label={t("moves.catalog.filters.disciplineAria")}>
                    <button
                        type="button"
                        className={`moves-view-btn${domain === FILTER_ALL ? " active" : ""}`}
                        aria-pressed={domain === FILTER_ALL}
                        onClick={() => setDomain(FILTER_ALL)}
                    >
                        {t("moves.catalog.filters.all")}
                    </button>
                    {disciplines.map((d) => (
                        <button
                            type="button"
                            key={d.value}
                            className={`moves-view-btn${domain === d.value ? " active" : ""}`}
                            aria-pressed={domain === d.value}
                            onClick={() => setDomain(d.value)}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>

                <div className="moves-view-toggle" role="group" aria-label={t("moves.catalog.filters.typeAria")}>
                    {TYPE_FILTERS.map((tf) => (
                        <button
                            type="button"
                            key={tf}
                            className={`moves-view-btn${effectType === tf ? " active" : ""}`}
                            aria-pressed={effectType === tf}
                            onClick={() => setEffectType(tf)}
                        >
                            {tf === FILTER_ALL ? t("moves.catalog.filters.all") : (EFFECT_TYPE_LABELS[tf] || tf)}
                        </button>
                    ))}
                </div>

                <div className="moves-view-toggle" role="group" aria-label={t("moves.catalog.filters.ownershipAria")}>
                    {OWNERSHIP_FILTERS.map((opt) => (
                        <button
                            type="button"
                            key={opt}
                            className={`moves-view-btn${ownership === opt ? " active" : ""}`}
                            aria-pressed={ownership === opt}
                            onClick={() => setOwnership(opt)}
                        >
                            {opt === FILTER_ALL
                                ? t("moves.catalog.filters.all")
                                : opt === "OWNED"
                                    ? t("moves.catalog.filters.owned")
                                    : t("moves.catalog.filters.notOwned")}
                        </button>
                    ))}
                </div>
            </div>

            {isEmpty ? (
                <div className="empty-state">
                    <span className="empty-state-text">{t("moves.catalog.emptyFiltered")}</span>
                    <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                        {t("moves.catalog.clearFilters")}
                    </button>
                </div>
            ) : (
                groups.map((g, i) => (
                    <section className="moves-catalog-group" key={`${g.domain}-${i}`}>
                        <div className="col-label">{g.label}</div>
                        <MoveGrid moves={g.moves} onSelect={onSelect} />
                    </section>
                ))
            )}
        </div>
    );
}
