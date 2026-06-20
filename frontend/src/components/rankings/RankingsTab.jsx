import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { api } from "../../api";
import { t } from "@/lib/i18n";

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
            onMessage?.(e.message || t("rankings.loadError"));
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
                    // Champion (rank null + isChampion) always sits at the very top,
                    // above the #1 contender — never sorted to the bottom.
                    if (a.isChampion && !b.isChampion) return -1;
                    if (b.isChampion && !a.isChampion) return 1;
                    // Any remaining null-rank row (e.g. an unranked entry) sinks to the bottom.
                    if (a.rank == null && b.rank == null) return 0;
                    if (a.rank == null) return 1;
                    if (b.rank == null) return -1;
                    return a.rank - b.rank;
                });
            }
        }
        return out;
    }, [roster, playerRow]);

    // Title-shot zone = champion + top 4 contenders. Player can never be champion in
    // their current tier's roster (becoming champion = promoting), so we just check
    // display rank 1-4 (4 contenders directly below the champion).
    const titleShotAvailable = playerRow && playerRow.rank != null && playerRow.rank >= 1 && playerRow.rank <= 4;

    return (
        <div className="rankings-tab" data-tut="rankings-tab">
            <div className="rank-header">
                <div className="rank-header-top">
                    <div className="rank-title-row">
                        <h2 className="rank-title">{t("rankings.title")}</h2>
                        <span className="rank-division">{playerWc}</span>
                    </div>
                </div>
                <div className="tier-tabs">
                    {TIER_ORDER.map((tr) => (
                        <button key={tr} type="button"
                            className={`tier-tab ${tr === tier ? "active" : ""} ${tr === playerTier ? "is-player-tier" : ""}`}
                            onClick={() => setTier(tr)}>
                            {tr}{tr === playerTier && <span className="you-dot">{t("rankings.tiers.youLabel")}</span>}
                        </button>
                    ))}
                </div>
                {titleShotAvailable && tier === playerTier && (
                    <div className="rank-title-shot"><Trophy size={13} strokeWidth={2.5} aria-hidden="true" /> {t("rankings.titleShotBanner")}</div>
                )}
            </div>

            {loading && <div className="rank-loading">{t("rankings.loading")}</div>}

            {!loading && data && (
                <div className="rank-table" data-tut="rankings-table">
                    <div className="rank-table-header">
                        <div className="th">{t("rankings.table.colRank")}</div>
                        <div className="th">{t("rankings.table.colFighter")}</div>
                        <div className="th right">{t("rankings.table.colOvr")}</div>
                        <div className="th">{t("rankings.table.colStyle")}</div>
                        <div className="th right">{t("rankings.table.colRecord")}</div>
                    </div>
                    {(() => {
                        const showDividers = tier === playerTier;
                        let titleShotEmitted = false, rankedEmitted = false;
                        const out = [];
                        displayList.forEach((row, i) => {
                            const rank = row.rank;
                            const isRanked = rank != null;
                            if (showDividers && isRanked) {
                                if (!titleShotEmitted && rank >= 4) { out.push(<div className="rank-section-div" key="div-ts"><span className="rank-section-div-label">{t("rankings.dividers.titleShot")}</span></div>); titleShotEmitted = true; }
                                if (!rankedEmitted && rank >= 6) {
                                    if (!titleShotEmitted) { out.push(<div className="rank-section-div" key="div-ts"><span className="rank-section-div-label">{t("rankings.dividers.titleShot")}</span></div>); titleShotEmitted = true; }
                                    out.push(<div className="rank-section-div" key="div-ranked"><span className="rank-section-div-label">{t("rankings.dividers.ranked")}</span></div>); rankedEmitted = true;
                                }
                            }
                            const isChampion = row.isChampion;
                            const isPlayer = row.isPlayer;
                            const isUnranked = row.__unranked || row.isUnranked;
                            const isTop3 = isChampion || (rank != null && rank >= 1 && rank <= 3);
                            out.push(
                                <div key={row.id || `row-${i}`} className={`rank-row ${isTop3 ? "top3" : ""} ${isPlayer ? "my-row" : ""} ${isUnranked ? "unranked" : ""}`}>
                                    <div className={`rank-num ${(isChampion || rank === 1) ? "top1" : isTop3 ? "top3" : ""} ${isPlayer ? "mine" : ""}`}>{isChampion ? "C" : isUnranked ? "—" : rank}</div>
                                    <div className="rank-fighter">
                                        <span className={`rank-fighter-name ${isPlayer ? "mine" : ""}`}>{row.nickname ? `${row.name} "${row.nickname}"` : row.name}</span>
                                        {isChampion && <span className="rank-champ-badge">{t("rankings.champion")}</span>}
                                        {isPlayer && <span className="rank-you-badge">{t("rankings.you")}</span>}
                                    </div>
                                    <div className={`rank-ovr ${isPlayer ? "mine" : ""}`}>{row.ovr}</div>
                                    <div className="rank-style">{row.style}</div>
                                    <div className="rank-record">{row.record}</div>
                                </div>
                            );
                        });
                        return out;
                    })()}
                </div>
            )}

            {!loading && tier !== playerTier && (
                <div className="rank-foreign-note">{t("rankings.foreignNote", { tier: playerTier })}</div>
            )}
        </div>
    );
}

export default memo(RankingsTab);
