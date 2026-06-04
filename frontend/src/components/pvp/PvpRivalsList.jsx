import { memo, useCallback, useEffect, useState } from "react";
import { Swords, Flame } from "lucide-react";
import { api } from "../../api";
import { STYLE_COLORS } from "../fights/FighterReport";
import { PvpChallengeFlow } from "./PvpChallengeFlow";

/**
 * Rivals view (contract §3.2 GET /pvp/rivalries). Head-to-head record, heat,
 * grudge / nemesis badges, and a Challenge action that opens PvpChallengeFlow
 * (revenge context when `revenge_available`). Every field guarded.
 *
 * Row: { fighterId, name, ovr, style, head_to_head:{my_wins,their_wins,draws},
 *        leader:"me"|"them"|"tied", heat, is_grudge, is_nemesis,
 *        last_method, last_fought_at, revenge_available, attackable, block_reason }
 *
 * Props: fighter, onMessage, onRefreshFighter
 */

const DEFAULT_STYLE_COLOR = { label: "#94a3b8" };
const LIMIT = 25;

const BLOCK_REASON_LABEL = {
    target_recovering: "They're recovering",
    out_of_bracket: "Out of range (±8 OVR)",
    target_not_attackable: "Unavailable right now",
    self: "That's you",
    daily_pvp_cap_reached: "No attacks left today",
};

/** Heat → a 0–4+ flame meter. */
function HeatMeter({ heat }) {
    const h = heat ?? 0;
    const isGrudge = h >= 4;
    return (
        <span className={`pvp-rival-heat${isGrudge ? " pvp-rival-heat--grudge" : ""}`} title={`Heat ${h}`}>
            <Flame size={11} /> {h}
        </span>
    );
}

function RivalRow({ row, onChallenge }) {
    const styleColor = STYLE_COLORS[row.style] ?? DEFAULT_STYLE_COLOR;
    const h2h = row.head_to_head || {};
    const my = h2h.my_wins ?? 0;
    const their = h2h.their_wins ?? 0;
    const draws = h2h.draws ?? 0;
    const attackable = row.attackable !== false;
    const blockLabel = row.block_reason ? (BLOCK_REASON_LABEL[row.block_reason] || "Unavailable") : null;
    const leaderCls = row.leader === "me" ? "pvp-rival-h2h--up" : row.leader === "them" ? "pvp-rival-h2h--down" : "";

    return (
        <div className={`pvp-rival-row${row.is_nemesis ? " pvp-rival-row--nemesis" : ""}`}>
            <div className="pvp-rival-id">
                <div className="pvp-rival-name">
                    {row.name || "Unknown"}
                    {row.is_grudge && <span className="pvp-badge pvp-rival-badge-grudge">GRUDGE</span>}
                    {row.is_nemesis && <span className="pvp-badge pvp-rival-badge-nemesis">NEMESIS</span>}
                </div>
                <div className="pvp-rival-sub">
                    {row.style && <span style={{ color: styleColor.label }}>{row.style}</span>}
                    {row.ovr != null && <span className="pvp-rival-ovr">{row.ovr} OVR</span>}
                </div>
            </div>

            <div className={`pvp-rival-h2h ${leaderCls}`} title="Your head-to-head record">
                <span className="pvp-rival-h2h-rec">{my}-{their}{draws ? `-${draws}` : ""}</span>
                <span className="pvp-rival-h2h-label">vs you</span>
            </div>

            <HeatMeter heat={row.heat} />

            <div className="pvp-rival-action">
                {row.revenge_available && attackable ? (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm pvp-rival-btn pvp-rival-btn--revenge"
                        onClick={() => onChallenge(row, true)}
                    >
                        <Swords size={11} /> Revenge
                    </button>
                ) : attackable ? (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm pvp-rival-btn"
                        onClick={() => onChallenge(row, false)}
                    >
                        Challenge
                    </button>
                ) : (
                    <button type="button" className="btn btn-secondary btn-sm pvp-rival-btn" disabled title={blockLabel}>
                        Challenge
                    </button>
                )}
            </div>
        </div>
    );
}

export const PvpRivalsList = memo(function PvpRivalsList({ fighter, onMessage, onRefreshFighter }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [challenge, setChallenge] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getPvpRivalries({ limit: String(LIMIT) });
            setData(res);
        } catch (e) {
            setError(e?.message || "Failed to load rivalries.");
            setData(null);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openChallenge = useCallback((row, revenge) => {
        setChallenge({
            defenderId: row.fighterId,
            preview: { name: row.name, ovr: row.ovr, style: row.style },
            context: revenge ? "revenge" : undefined,
        });
    }, []);

    const handleResolved = useCallback((result) => {
        setChallenge(null);
        if (result?.fighter && onRefreshFighter && fighter?._id) {
            onRefreshFighter(fighter._id, { clearMessage: false });
        }
        load();
    }, [fighter?._id, onRefreshFighter, load]);

    const rows = data?.rows || [];

    return (
        <div className="pvp-rivals">
            {loading && <div className="pvp-loading">Loading rivalries…</div>}

            {!loading && error && (
                <div className="pvp-error">
                    {error}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Retry</button>
                </div>
            )}

            {!loading && !error && rows.length === 0 && (
                <div className="pvp-empty">
                    No rivalries yet. Fight the same opponents and the heat will build.
                </div>
            )}

            {!loading && !error && rows.length > 0 && (
                <div className="pvp-rival-list">
                    {rows.map((row) => (
                        <RivalRow key={row.fighterId} row={row} onChallenge={openChallenge} />
                    ))}
                </div>
            )}

            {challenge && (
                <PvpChallengeFlow
                    fighter={fighter}
                    defenderId={challenge.defenderId}
                    defenderPreview={challenge.preview}
                    context={challenge.context}
                    onClose={() => setChallenge(null)}
                    onResolved={handleResolved}
                    onMessage={onMessage}
                />
            )}
        </div>
    );
});

export default PvpRivalsList;
