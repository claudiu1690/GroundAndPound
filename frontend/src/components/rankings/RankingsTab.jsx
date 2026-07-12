import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { api } from "../../api";
import { bannerRowBackground, bannerAccentColor } from "../banner/bannerCatalog";
import { t } from "@/lib/i18n";

const TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];

/** Two-letter initials for the ladder portrait circles. */
function initialsOf(name) {
    return (name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

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

            {!loading && data && (() => {
                // Partition the display list into the ladder's sections.
                const champion = displayList.find((r) => r.isChampion) || null;
                const zoneRows = displayList.filter((r) => !r.isChampion && r.rank != null && r.rank <= 4);
                const lowerRows = displayList.filter((r) => !r.isChampion && r.rank != null && r.rank > 4);
                const unrankedRows = displayList.filter((r) => !r.isChampion && r.rank == null);
                const isOwnTier = tier === playerTier;
                const spotsToZone = playerRow?.rank != null && playerRow.rank > 4 ? playerRow.rank - 4 : 0;

                const rung = (row) => {
                    const isPlayer = row.isPlayer;
                    const isUnranked = row.__unranked || row.isUnranked;
                    return (
                        <div
                            key={row.id}
                            className={`rl-rung${isPlayer ? " rl-rung--me" : ""}${isUnranked ? " rl-rung--unranked" : ""}`}
                            data-rank={isUnranked ? "—" : row.rank}
                            // Your rung wears your banner composition (dark-veiled)
                            // and your accent colors the "you" markers (spine dot,
                            // border, name, badge) via --rung-accent; green fallback.
                            style={isPlayer ? {
                                background: bannerRowBackground(fighter?.banner),
                                "--rung-accent": bannerAccentColor(fighter?.banner) || undefined,
                            } : undefined}
                        >
                            <span className="rl-port">{initialsOf(row.name)}</span>
                            <span className="rl-name">
                                {row.nickname ? `${row.name} "${row.nickname}"` : row.name}
                                {isPlayer && <span className="rank-you-badge">{t("rankings.you")}</span>}
                            </span>
                            <span className="rl-style">{row.style}</span>
                            <span className="rl-ovr">{row.ovr}</span>
                            <span className="rl-rec">{row.record}</span>
                        </div>
                    );
                };

                return (
                    <div className="rl-lane" data-tut="rankings-table">
                        {champion && (
                            <div className="rl-champ">
                                <span className="rl-champ-port">{initialsOf(champion.name)}</span>
                                <div className="rl-champ-id">
                                    <div className="rl-champ-name">
                                        {champion.nickname ? `${champion.name} "${champion.nickname}"` : champion.name}
                                    </div>
                                    <div className="rl-champ-sub">{champion.record} · {champion.style}</div>
                                </div>
                                <div className="rl-champ-ovr">
                                    <div className="rl-champ-ovr-val">{champion.ovr}</div>
                                    <div className="rl-champ-ovr-lbl">{t("rankings.table.colOvr")}</div>
                                </div>
                            </div>
                        )}

                        {zoneRows.length > 0 && (
                            <div className="rl-zone">
                                <span className="rl-zone-lbl">{t("rankings.zoneLabel")}</span>
                                {zoneRows.map(rung)}
                            </div>
                        )}

                        {lowerRows.map((row) => (
                            <div key={row.id}>
                                {rung(row)}
                                {row.isPlayer && isOwnTier && spotsToZone > 0 && (
                                    <div className="rl-path">
                                        <span className="rl-path-chip">
                                            ▲ {t("rankings.pathChip", { n: spotsToZone, plural: spotsToZone === 1 ? "" : "s" })}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}

                        {unrankedRows.map(rung)}
                        {isOwnTier && playerRow && (playerRow.rank == null) && (
                            <div className="rl-pool-note">{t("rankings.unrankedNote")}</div>
                        )}
                    </div>
                );
            })()}

            {!loading && tier !== playerTier && (
                <div className="rank-foreign-note">{t("rankings.foreignNote", { tier: playerTier })}</div>
            )}
        </div>
    );
}

export default memo(RankingsTab);
