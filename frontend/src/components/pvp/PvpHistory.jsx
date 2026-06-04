import { memo, useCallback, useEffect, useState } from "react";
import { api } from "../../api";

const LIMIT = 20;

const OUTCOME_META = {
    win: { label: "W", cls: "pvp-outcome-win" },
    loss: { label: "L", cls: "pvp-outcome-loss" },
    draw: { label: "D", cls: "pvp-outcome-draw" },
};

function formatDate(iso) {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
            " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (_) {
        return "";
    }
}

/**
 * Per-row tags (contract §3.6 additive enrichment): revenge ★ / streak ⚡ /
 * rivalry heat 🔥N. All optional — render nothing when `tags` is absent.
 */
function HistoryTags({ tags }) {
    if (!tags) return null;
    const heat = tags.rivalry_heat;
    const hasHeat = heat != null && heat > 0;
    if (!tags.revenge && !tags.streak && !hasHeat) return null;
    return (
        <span className="phr-tags">
            {tags.revenge && <span className="phr-tag phr-tag--revenge" title="Revenge win">★</span>}
            {tags.streak && <span className="phr-tag phr-tag--streak" title="Win-streak fight">⚡</span>}
            {hasHeat && <span className="phr-tag phr-tag--heat" title={`Rivalry heat ${heat}`}>🔥{heat}</span>}
        </span>
    );
}

function HistoryRow({ row }) {
    const meta = OUTCOME_META[row.outcome] || { label: "?", cls: "" };
    const delta = row.rank_points_delta ?? 0;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const deltaCls = delta > 0 ? "pvp-delta-pos" : delta < 0 ? "pvp-delta-neg" : "pvp-delta-zero";

    return (
        <div className="pvp-history-row">
            <div className={`phr-outcome ${meta.cls}`}>{meta.label}</div>
            <div className="phr-opponent">
                {row.opponent?.name || "Unknown"}
                {row.belt_changed && <span className="pvp-badge pvp-badge-champ">BELT</span>}
                <HistoryTags tags={row.tags} />
            </div>
            <div className="phr-method">
                {row.method}{row.round ? ` · R${row.round}` : ""}
            </div>
            <div className={`phr-delta ${deltaCls}`}>{deltaStr} pts</div>
            <div className="phr-iron">+{row.iron_earned ?? 0} ⊗</div>
            <div className="phr-date">{formatDate(row.fought_at)}</div>
        </div>
    );
}

export const PvpHistory = memo(function PvpHistory({ onMessage }) {
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getPvpHistory({ page: String(page), limit: String(LIMIT) });
            setData(res);
        } catch (e) {
            setError(e.message || "Failed to load PvP history.");
            onMessage?.(e.message || "Failed to load PvP history.");
            setData(null);
        }
        setLoading(false);
    }, [page, onMessage]);

    useEffect(() => { load(); }, [load]);

    const rows = data?.rows || [];
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / LIMIT));

    return (
        <div className="pvp-history">
            {loading && <div className="pvp-loading">Loading history…</div>}

            {!loading && error && (
                <div className="pvp-error">
                    {error}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Retry</button>
                </div>
            )}

            {!loading && !error && data && rows.length === 0 && (
                <div className="pvp-empty">No PvP fights yet. Challenge someone on the Ladder.</div>
            )}

            {!loading && !error && rows.length > 0 && (
                <>
                    <div className="pvp-history-list">
                        {rows.map((row) => (
                            <HistoryRow key={row.pvpFightId} row={row} />
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="pvp-pager">
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                ◀ Prev
                            </button>
                            <span className="pvp-pager-label">Page {page} / {totalPages}</span>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                Next ▶
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
});

export default PvpHistory;
