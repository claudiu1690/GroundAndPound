import { memo, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { PvpIdentityHeader } from "./PvpIdentityHeader";
import { PvpYard } from "./PvpYard";
import { PvpLadder } from "./PvpLadder";
import { PvpHistory } from "./PvpHistory";
import { PvpBounties } from "./PvpBounties";
import { PvpSeasonResultsModal } from "./PvpSeasonResultsModal";

/**
 * "The Circuit" PvP hub (v1.1). A persistent identity header + four sub-sections:
 *   Yard (default) · Ladder · Bounties (Coming soon placeholder) · History.
 *
 * Fetches GET /pvp/hub once on mount and passes slices down. The hub feeds the
 * identity header and the Yard; Ladder/History fetch their own paginated data.
 * Loading / error / empty states are handled at the header + Yard level so a slow
 * or failed hub never crashes the tab (CLAUDE.md: every backend call → 3 states).
 *
 * v1.2: Bounties is now a live sub-tab (three scoped lists), the identity header
 * shows the real division badge + season countdown (from GET /pvp/season), and
 * an end-of-season results modal fires once when `ended_results` is present.
 *
 * Props: fighter, onMessage, onRefreshFighter
 */
const SECTIONS = [
    { key: "yard", label: "The Yard" },
    { key: "ladder", label: "Ladder" },
    { key: "bounties", label: "Bounties" },
    { key: "history", label: "History" },
];

export const PvpTab = memo(function PvpTab({ fighter, onMessage, onRefreshFighter }) {
    const [section, setSection] = useState("yard");

    const [hub, setHub] = useState(null);
    const [hubLoading, setHubLoading] = useState(true);
    const [hubError, setHubError] = useState(null);

    // Season state (countdown + division + one-shot end-of-season results).
    const [season, setSeason] = useState(null);
    const [seasonResults, setSeasonResults] = useState(null); // gated by season_number_seen, shown once
    const mountedRef = useRef(true);

    useEffect(() => () => { mountedRef.current = false; }, []);

    const loadHub = useCallback(async () => {
        setHubLoading(true);
        setHubError(null);
        try {
            const res = await api.getPvpHub();
            if (mountedRef.current) setHub(res);
        } catch (e) {
            if (mountedRef.current) {
                setHubError(e?.message || "Failed to load the PvP hub.");
                setHub(null);
            }
        } finally {
            if (mountedRef.current) setHubLoading(false);
        }
    }, []);

    useEffect(() => { loadHub(); }, [loadHub]);

    // Season — independent of the hub so a season fetch failure never blocks the
    // Yard. ended_results is shown ONCE; markPvpSeasonSeen fires on dismiss.
    const loadSeason = useCallback(async () => {
        try {
            const res = await api.getPvpSeason();
            if (!mountedRef.current) return;
            setSeason(res);
            if (res?.ended_results) setSeasonResults(res);
        } catch {
            // Soft-fail: the header simply omits the countdown / division fallback.
            if (mountedRef.current) setSeason(null);
        }
    }, []);

    useEffect(() => { loadSeason(); }, [loadSeason]);

    const dismissSeasonResults = useCallback(() => setSeasonResults(null), []);
    const markSeasonSeen = useCallback(async () => {
        try { await api.markPvpSeasonSeen(); } catch { /* best-effort */ }
    }, []);

    const goLadder = useCallback(() => setSection("ladder"), []);

    return (
        <div className="pvp-tab pvp-hub" data-tut="pvp-tab">
            <header className="pvp-header pvp-hub-header">
                <h2 className="pvp-title">{"⚔"} The Circuit</h2>
                <div className="pvp-subtabs">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            className={`pvp-subtab ${section === s.key ? "active" : ""}`}
                            onClick={() => setSection(s.key)}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* Persistent identity header — always on screen. */}
            <PvpIdentityHeader identity={hub?.identity} loading={hubLoading} season={season} />

            {/* Hub-level error only blocks the Yard (which depends on the hub feed).
                Ladder/History fetch independently and stay usable. */}
            {section === "yard" && (
                hubError ? (
                    <div className="pvp-error">
                        {hubError}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={loadHub}>Retry</button>
                    </div>
                ) : hubLoading && !hub ? (
                    <div className="pvp-loading">Loading the Yard…</div>
                ) : (
                    <PvpYard
                        hub={hub}
                        fighter={fighter}
                        onMessage={onMessage}
                        onRefreshFighter={onRefreshFighter}
                        onRefetchHub={loadHub}
                        onViewLadder={goLadder}
                    />
                )
            )}

            {section === "ladder" && (
                <PvpLadder
                    fighter={fighter}
                    onMessage={onMessage}
                    onRefreshFighter={onRefreshFighter}
                />
            )}

            {section === "bounties" && (
                <PvpBounties
                    fighter={fighter}
                    onMessage={onMessage}
                    onRefreshFighter={onRefreshFighter}
                />
            )}

            {section === "history" && (
                <PvpHistory
                    fighter={fighter}
                    onMessage={onMessage}
                />
            )}

            {/* End-of-season results — shown once (gated by season_number_seen). */}
            {seasonResults && (
                <PvpSeasonResultsModal
                    season={seasonResults}
                    onDismiss={dismissSeasonResults}
                    onMarkSeen={markSeasonSeen}
                />
            )}
        </div>
    );
});

export default PvpTab;
