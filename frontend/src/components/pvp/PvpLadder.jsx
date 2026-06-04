import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Target } from "lucide-react";
import { api } from "../../api";
import { PvpChallengeFlow } from "./PvpChallengeFlow";
import { PvpRivalsList } from "./PvpRivalsList";
import { PvpSeasonBadge } from "./PvpSeasonBadge";
import { PvpPostBountyModal } from "./PvpPostBountyModal";

const LIMIT = 25;

/** Human-readable disabled reason per the §7.3 block_reason table. */
const BLOCK_REASON_LABEL = {
    target_recovering: "This fighter is recovering.",
    out_of_bracket: "Outside your range (±8 OVR)",
    self: "That's you.",
};

function LadderRow({ row, onChallenge, onPostBounty }) {
    const isChampion = !!row.is_champion;
    const isMe = !!row.is_me;
    const inZone = !!row.in_challenge_zone;
    const attackable = row.attackable === true;
    const blockLabel = row.block_reason ? BLOCK_REASON_LABEL[row.block_reason] : null;

    const classes = [
        "pvp-row",
        isChampion ? "is-champion" : "",
        isMe ? "is-me" : "",
        inZone ? "in-zone" : "",
        !attackable && !isMe ? "is-blocked" : "",
    ].filter(Boolean).join(" ");

    // Open iron bounty on this fighter's head (graceful blank when 0 / absent).
    const bountyOnHead = row.bounty_on_head ?? row.bounty_total ?? 0;

    return (
        <div className={classes}>
            <div className="p-rank">
                {isChampion ? "👑" : row.ladder_rank != null ? `#${row.ladder_rank}` : "—"}
            </div>
            <div className="p-name">
                {row.name}
                {isChampion && <span className="pvp-badge pvp-badge-champ">CHAMPION</span>}
                {isMe && <span className="pvp-badge pvp-badge-you">YOU</span>}
                {bountyOnHead > 0 && (
                    <span className="pvp-bounty-tag" title={`${Number(bountyOnHead).toLocaleString()} iron in open bounties`}>
                        <Target size={9} /> {Number(bountyOnHead).toLocaleString()}
                    </span>
                )}
            </div>
            <div className="p-record">{row.record}</div>
            <div className="p-points">{row.rank_points}</div>
            <div className="p-ovr">{row.ovr}</div>
            <div className="p-style">{row.style}</div>
            {/* Division badge — lit in v1.2 from the per-row `division`. */}
            <div className="p-division"><PvpSeasonBadge division={row.division} size="sm" /></div>
            <div className="p-action">
                {isMe ? (
                    <span className="pvp-row-note">—</span>
                ) : (
                    <div className="pvp-row-actions">
                        {attackable ? (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm pvp-challenge-btn"
                                onClick={() => onChallenge(row)}
                            >
                                Challenge
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm pvp-challenge-btn"
                                disabled
                                title={blockLabel || "Unavailable"}
                            >
                                Challenge
                            </button>
                        )}
                        {onPostBounty && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm pvp-row-bounty-btn"
                                onClick={() => onPostBounty(row)}
                                title="Post an iron bounty on this fighter"
                            >
                                <Target size={11} /> Bounty
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export const PvpLadder = memo(function PvpLadder({ fighter, onMessage, onRefreshFighter }) {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // The row currently being challenged (opens PvpChallengeFlow).
    const [challengeRow, setChallengeRow] = useState(null);
    // The row a bounty is being posted on (opens PvpPostBountyModal).
    const [bountyTarget, setBountyTarget] = useState(null);

    // Rivals filter: "all" (full ladder table) | "rivals" (the rich rivalries view).
    const [view, setView] = useState("all");
    const onSelectView = useCallback((next) => setView(next), []);

    // Division scope: "global" (full ladder) | "mine" (only my division's rows).
    const [divScope, setDivScope] = useState("global");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = { page: String(page), limit: String(LIMIT) };
            if (search) params.search = search;
            const res = await api.getPvpLadder(params);
            setData(res);
        } catch (e) {
            setError(e.message || "Failed to load the ladder.");
            setData(null);
        }
        setLoading(false);
    }, [page, search]);

    useEffect(() => { load(); }, [load]);

    const onSearchSubmit = useCallback((e) => {
        e.preventDefault();
        setPage(1);
        setSearch(searchInput.trim());
    }, [searchInput]);

    const openPostBounty = useCallback((row) => {
        setBountyTarget({
            fighterId: row.fighterId,
            name: row.name,
            ovr: row.ovr,
            style: row.style,
            // Tier purse cap hints if the ladder row carries them (graceful blank).
            max_bounty: row.max_bounty ?? row.signing_fee ?? row.signingFee,
        });
    }, []);

    const handleBountyPosted = useCallback((res) => {
        setBountyTarget(null);
        onMessage?.(`Bounty posted${res?.amount_posted ? ` — ${Number(res.amount_posted).toLocaleString()} iron` : ""}.`);
        if (onRefreshFighter && fighter?._id) onRefreshFighter(fighter._id, { clearMessage: false });
        load();
    }, [onMessage, onRefreshFighter, fighter?._id, load]);

    const handleChallengeDone = useCallback((result) => {
        // Refresh the fighter (energy/iron) from the attack response, then
        // re-pull the ladder so ranks/cooldowns reflect the resolved fight.
        setChallengeRow(null);
        if (result?.fighter && onRefreshFighter && fighter?._id) {
            // We have the fresh fighter inline, but the simplest correct hop is
            // to ask App to reload from the canonical id (one hop, per §7.4).
            onRefreshFighter(fighter._id, { clearMessage: false });
        }
        load();
    }, [fighter?._id, onRefreshFighter, load]);

    const me = data?.me || null;
    const champion = data?.champion || null;
    const allRows = data?.rows || [];
    const rivalsActive = view === "rivals";

    // Viewer's division (from me) drives the "My Division" filter. Only offered
    // when we actually know it — otherwise the toggle is hidden (graceful blank).
    const myDivision = me?.division || null;
    const rows = useMemo(() => {
        if (divScope !== "mine" || !myDivision) return allRows;
        return allRows.filter((r) => r.division === myDivision || r.is_me);
    }, [allRows, divScope, myDivision]);
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / LIMIT));
    const capReached = me && me.attacks_today >= me.attack_cap;

    // The champion is pinned at the top of the list. The backend may or may not
    // also include the champion in `rows`; de-dupe by fighterId when present.
    const championInRows = champion && rows.some((r) => r.fighterId === champion.fighterId);

    return (
        <div className="pvp-ladder">
            {/* Daily-cap banner */}
            {capReached && (
                <div className="pvp-cap-banner">
                    PvP attacks used today ({me.attacks_today}/{me.attack_cap}). Resets at midnight.
                </div>
            )}

            {/* Own standing summary */}
            {me && (
                <div className="pvp-me-summary">
                    <span>Your rank: <strong>{me.is_ranked && me.ladder_rank != null ? `#${me.ladder_rank}` : "Unranked"}</strong></span>
                    <span>Points: <strong>{me.rank_points}</strong></span>
                    <span>OVR: <strong>{me.ovr}</strong></span>
                    <span>Attacks: <strong>{me.attacks_today}/{me.attack_cap}</strong></span>
                </div>
            )}

            {/* Filters: rivals toggle (All / Rivals) + division scope (Global / My Division). */}
            <div className="pvp-ladder-filters">
                <div className="pvp-ladder-toggle" role="group" aria-label="Ladder view">
                    <button
                        type="button"
                        className={`pvp-ladder-toggle-btn ${view === "all" ? "active" : ""}`}
                        onClick={() => onSelectView("all")}
                    >
                        All
                    </button>
                    <button
                        type="button"
                        className={`pvp-ladder-toggle-btn ${view === "rivals" ? "active" : ""}`}
                        onClick={() => onSelectView("rivals")}
                    >
                        Rivals
                    </button>
                </div>

                {/* Division toggle — only when we know the viewer's division. */}
                {!rivalsActive && myDivision && (
                    <div className="pvp-ladder-toggle pvp-division-toggle" role="group" aria-label="Division scope">
                        <button
                            type="button"
                            className={`pvp-ladder-toggle-btn ${divScope === "global" ? "active" : ""}`}
                            onClick={() => setDivScope("global")}
                        >
                            Global
                        </button>
                        <button
                            type="button"
                            className={`pvp-ladder-toggle-btn ${divScope === "mine" ? "active" : ""}`}
                            onClick={() => setDivScope("mine")}
                            title={`Show only ${myDivision}`}
                        >
                            My Division
                        </button>
                    </div>
                )}
            </div>

            {rivalsActive && (
                <PvpRivalsList
                    fighter={fighter}
                    onMessage={onMessage}
                    onRefreshFighter={onRefreshFighter}
                />
            )}

            {!rivalsActive && (
            <>
            <form className="pvp-search" onSubmit={onSearchSubmit}>
                <input
                    type="text"
                    className="pvp-search-input"
                    placeholder="Search fighters…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary btn-sm">Search</button>
                {search && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
                    >
                        Clear
                    </button>
                )}
            </form>

            {loading && <div className="pvp-loading">Loading ladder…</div>}

            {!loading && error && (
                <div className="pvp-error">
                    {error}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Retry</button>
                </div>
            )}

            {!loading && !error && data && (
                <>
                    <div className="pvp-table">
                        <div className="pvp-row pvp-head">
                            <div className="p-rank">#</div>
                            <div className="p-name">Fighter</div>
                            <div className="p-record">Record</div>
                            <div className="p-points">Pts</div>
                            <div className="p-ovr">OVR</div>
                            <div className="p-style">Style</div>
                            <div className="p-division">Div</div>
                            <div className="p-action"></div>
                        </div>

                        {/* Champion pinned at top (only on page 1, only if not already in rows) */}
                        {page === 1 && champion && !championInRows && (
                            <LadderRow
                                row={{
                                    fighterId: champion.fighterId,
                                    ladder_rank: champion.ladder_rank,
                                    name: champion.name,
                                    record: champion.record,
                                    rank_points: champion.rank_points,
                                    ovr: champion.ovr,
                                    style: champion.style,
                                    is_champion: true,
                                    is_me: me && champion.fighterId === me.fighterId,
                                    in_challenge_zone: true,
                                    // The champion row at the top is informational; row-level
                                    // attackability still applies once it appears in `rows`.
                                    attackable: false,
                                    block_reason: me && champion.fighterId === me.fighterId ? "self" : null,
                                }}
                                onChallenge={setChallengeRow}
                                onPostBounty={openPostBounty}
                            />
                        )}

                        {rows.length === 0 ? (
                            <div className="pvp-empty">
                                {search
                                    ? "No fighters match your search."
                                    : divScope === "mine" && myDivision
                                        ? `No other fighters in ${myDivision} on this page. Switch to Global to see the full ladder.`
                                        : "No ranked fighters yet — be the first to climb the ladder."}
                            </div>
                        ) : (
                            rows.map((row) => (
                                <LadderRow
                                    key={row.fighterId}
                                    row={row}
                                    onChallenge={setChallengeRow}
                                    onPostBounty={openPostBounty}
                                />
                            ))
                        )}
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
            </>
            )}

            {challengeRow && (
                <PvpChallengeFlow
                    fighter={fighter}
                    defenderId={challengeRow.fighterId}
                    defenderPreview={challengeRow}
                    onClose={() => setChallengeRow(null)}
                    onResolved={handleChallengeDone}
                    onViewLadder={() => setChallengeRow(null)}
                    onMessage={onMessage}
                />
            )}

            {bountyTarget && (
                <PvpPostBountyModal
                    target={bountyTarget}
                    playerIron={fighter?.iron ?? 0}
                    onClose={() => setBountyTarget(null)}
                    onPosted={handleBountyPosted}
                />
            )}
        </div>
    );
});

export default PvpLadder;
