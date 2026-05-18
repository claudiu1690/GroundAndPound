import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";

const TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];

/**
 * Rankings tab — fixed-roster leaderboard per (tier, weightClass).
 *
 * Defaults to showing the player's current tier + weight class. A tier selector
 * lets the player view other tiers (read-only — no player row appears there).
 * Player's weight class is fixed for their career so we don't expose a wc switcher.
 */
export function RankingsTab({ fighter, onMessage }) {
    const playerTier = fighter?.promotionTier;
    const playerWc = fighter?.weightClass;
    const [tier, setTier] = useState(playerTier || "Amateur");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    // Sync tier selection if the player promotes while on this tab.
    useEffect(() => { if (playerTier) setTier(playerTier); }, [playerTier]);

    const load = useCallback(async () => {
        if (!fighter?._id || !playerWc) return;
        setLoading(true);
        try {
            const res = await api.getRankings(tier, playerWc, fighter._id);
            setData(res);
        } catch (e) {
            onMessage?.(e.message || "Failed to load rankings");
            setData(null);
        }
        setLoading(false);
    }, [tier, playerWc, fighter?._id, onMessage]);

    useEffect(() => { load(); }, [load]);

    const roster = data?.roster || [];
    const playerRow = data?.player || null;

    // Build the final display list: NPC roster sorted by rank, then player row (if any
    // and not already in the roster — player is appended for visual emphasis).
    const displayList = useMemo(() => {
        const out = [...roster];
        if (playerRow) {
            if (playerRow.rank == null) {
                // Unranked — append at the end as a special row
                out.push({ ...playerRow, __unranked: true });
            } else {
                // Ranked — slot in at their position (push everyone below down by 1 visually).
                // We don't actually displace NPC ranks; we just sort by rank and let player render in-line.
                out.push({ ...playerRow });
                out.sort((a, b) => {
                    if (a.rank == null) return 1;
                    if (b.rank == null) return -1;
                    return a.rank - b.rank;
                });
            }
        }
        return out;
    }, [roster, playerRow]);

    const titleShotAvailable = playerRow && playerRow.rank != null && playerRow.rank >= 2 && playerRow.rank <= 5;

    return (
        <div className="rankings-tab" data-tut="rankings-tab">
            <header className="rankings-header">
                <h2 className="rankings-title">▲ Rankings</h2>
                <div className="rankings-wc">{playerWc}</div>
            </header>

            <div className="rankings-tier-tabs">
                {TIER_ORDER.map((t) => (
                    <button
                        key={t}
                        type="button"
                        className={`rankings-tier-tab ${t === tier ? "active" : ""} ${t === playerTier ? "is-player-tier" : ""}`}
                        onClick={() => setTier(t)}
                    >
                        {t}
                        {t === playerTier && <span className="rankings-tier-you">YOU</span>}
                    </button>
                ))}
            </div>

            {titleShotAvailable && tier === playerTier && (
                <div className="rankings-title-shot-pill">
                    🏆 Title Shot Zone — you're in the top 5
                </div>
            )}

            {loading && <div className="rankings-loading">Loading roster…</div>}

            {!loading && data && (
                <div className="rankings-table" data-tut="rankings-table">
                    <div className="rankings-row rankings-head">
                        <div className="r-rank">#</div>
                        <div className="r-name">Fighter</div>
                        <div className="r-ovr">OVR</div>
                        <div className="r-style">Style</div>
                        <div className="r-record">Record</div>
                    </div>
                    {displayList.map((row, i) => {
                        const isChampion = row.isChampion;
                        const isPlayer = row.isPlayer;
                        const isTopFive = row.rank != null && row.rank >= 2 && row.rank <= 5;
                        const isUnranked = row.__unranked || row.isUnranked;
                        return (
                            <div
                                key={row.id || `row-${i}`}
                                className={`rankings-row ${isChampion ? "is-champion" : ""} ${isPlayer ? "is-player" : ""} ${isTopFive ? "is-top5" : ""} ${isUnranked ? "is-unranked" : ""}`}
                            >
                                <div className="r-rank">
                                    {isChampion ? "👑" : isUnranked ? "—" : `#${row.rank}`}
                                </div>
                                <div className="r-name">
                                    {row.nickname ? `${row.name} "${row.nickname}"` : row.name}
                                    {isChampion && <span className="rankings-badge rankings-badge-champ">CHAMPION</span>}
                                    {isPlayer && <span className="rankings-badge rankings-badge-you">YOU</span>}
                                </div>
                                <div className="r-ovr">{row.ovr}</div>
                                <div className="r-style">{row.style}</div>
                                <div className="r-record">{row.record}</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && tier !== playerTier && (
                <div className="rankings-foreign-tier-note">
                    Viewing another tier — your row only appears in your current tier ({playerTier}).
                </div>
            )}
        </div>
    );
}

export default memo(RankingsTab);
