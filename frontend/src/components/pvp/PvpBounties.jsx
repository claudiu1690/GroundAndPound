import { memo, useCallback, useEffect, useState } from "react";
import { Coins, Clock, Swords } from "lucide-react";
import { api } from "../../api";
import { PvpChallengeFlow } from "./PvpChallengeFlow";
import { formatSeasonCountdown } from "./pvpSeasonUtil";

/**
 * Bounties sub-tab (contract §7.6 / §7.7). Three scoped lists from
 * GET /pvp/bounties?scope=:
 *   - Collectable : open bounties on attackable targets → one-tap Challenge.
 *   - Posted by me: my open/active postings (status + expiry + refund-on-expiry).
 *   - On my head  : iron other players posted against me (the tense hook).
 *
 * Collectable rows open PvpChallengeFlow with the TARGET's fighterId; winning
 * in-bracket settles the escrow (the summary shows the collected line).
 *
 * Every field is guarded so a missing backend (v1.2 may not be merged) renders
 * a clean empty state, never a crash.
 *
 * Props: fighter, onMessage, onRefreshFighter
 */

const SCOPES = [
    { key: "collectable", label: "Collectable" },
    { key: "posted", label: "Posted by me" },
    { key: "on_me", label: "On my head" },
];

const STATUS_LABEL = {
    open: "Open",
    collected: "Collected",
    expired: "Expired",
    refunded: "Refunded",
};

const BLOCK_REASON_LABEL = {
    target_recovering: "They're recovering",
    out_of_bracket: "Out of range (±8 OVR)",
    target_not_attackable: "Unavailable right now",
    self: "That's you",
    daily_pvp_cap_reached: "No attacks left today",
};

const METHOD_LABEL = {
    any: "Any method",
    KO: "KO/TKO only",
    Submission: "Submission only",
    Decision: "Decision only",
};

/** Pull a fighter-ish display object off a bounty row, scope-aware. */
function partyOf(row, which) {
    // `which` = "target" | "poster". Tolerant of nested object or flat fields.
    const obj = row?.[which] || {};
    return {
        fighterId: obj.fighterId ?? row?.[`${which}_id`] ?? null,
        name: obj.name ?? row?.[`${which}_name`] ?? "Unknown",
        ovr: obj.ovr ?? row?.[`${which}_ovr`] ?? null,
        style: obj.style ?? row?.[`${which}_style`] ?? null,
    };
}

function ExpiryChip({ expiresAt }) {
    const cd = formatSeasonCountdown(expiresAt); // reuses the d/h/m formatter
    if (!cd) return null;
    return (
        <span className="pvp-bounty-expiry" title={`Expires ${new Date(expiresAt).toLocaleString()}`}>
            <Clock size={10} /> {cd === "ending" ? "expiring" : cd}
        </span>
    );
}

function AmountChip({ row }) {
    // Prefer the live escrow (what a collector actually receives); fall back to posted.
    const amount = row?.escrow_amount ?? row?.amount_posted ?? row?.amount ?? null;
    if (amount == null) return null;
    return (
        <span className="pvp-bounty-amount" title="Iron in escrow on this bounty">
            <Coins size={11} /> {Number(amount).toLocaleString()}
        </span>
    );
}

function CollectableRow({ row, onChallenge }) {
    const target = partyOf(row, "target");
    const attackable = row.attackable !== false;
    const blockLabel = row.block_reason ? (BLOCK_REASON_LABEL[row.block_reason] || "Unavailable") : null;
    const method = row.method_required || "any";

    return (
        <div className={`pvp-bounty-row${attackable ? "" : " pvp-bounty-row--blocked"}`}>
            <div className="pvp-bounty-id">
                <div className="pvp-bounty-name">{target.name}</div>
                <div className="pvp-bounty-sub">
                    {target.style && <span>{target.style}</span>}
                    {target.ovr != null && <span className="pvp-bounty-ovr">{target.ovr} OVR</span>}
                    <span className="pvp-bounty-method">{METHOD_LABEL[method] || method}</span>
                </div>
            </div>
            <div className="pvp-bounty-meta">
                <AmountChip row={row} />
                <ExpiryChip expiresAt={row.expires_at} />
            </div>
            <div className="pvp-bounty-action">
                {attackable ? (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm pvp-bounty-btn"
                        onClick={() => onChallenge(target)}
                    >
                        <Swords size={11} /> Challenge
                    </button>
                ) : (
                    <button type="button" className="btn btn-secondary btn-sm pvp-bounty-btn" disabled title={blockLabel}>
                        Challenge
                    </button>
                )}
            </div>
        </div>
    );
}

function StandingRow({ row, party }) {
    const who = partyOf(row, party);
    const status = row.status || "open";
    const method = row.method_required || "any";
    const collectedBy = row.collected_by?.name ?? row.collected_by_name ?? null;

    return (
        <div className={`pvp-bounty-row pvp-bounty-row--standing pvp-bounty-row--${status}`}>
            <div className="pvp-bounty-id">
                <div className="pvp-bounty-name">{who.name}</div>
                <div className="pvp-bounty-sub">
                    {who.style && <span>{who.style}</span>}
                    {who.ovr != null && <span className="pvp-bounty-ovr">{who.ovr} OVR</span>}
                    <span className="pvp-bounty-method">{METHOD_LABEL[method] || method}</span>
                </div>
            </div>
            <div className="pvp-bounty-meta">
                <AmountChip row={row} />
                {status === "open" && <ExpiryChip expiresAt={row.expires_at} />}
            </div>
            <div className="pvp-bounty-status-wrap">
                <span className={`pvp-bounty-status pvp-bounty-status--${status}`}>
                    {STATUS_LABEL[status] || status}
                </span>
                {status === "collected" && collectedBy && (
                    <span className="pvp-bounty-collected-by">by {collectedBy}</span>
                )}
            </div>
        </div>
    );
}

export const PvpBounties = memo(function PvpBounties({ fighter, onMessage, onRefreshFighter }) {
    const [scope, setScope] = useState("collectable");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [challenge, setChallenge] = useState(null); // collectable → challenge flow

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.getPvpBounties({ scope });
            setData(res);
        } catch (e) {
            setError(e?.message || "Failed to load bounties.");
            setData(null);
        }
        setLoading(false);
    }, [scope]);

    useEffect(() => { load(); }, [load]);

    const rows = data?.rows || data?.bounties || [];

    const openChallenge = useCallback((target) => {
        if (!target?.fighterId) return;
        setChallenge({
            defenderId: target.fighterId,
            preview: { name: target.name, ovr: target.ovr, style: target.style },
        });
    }, []);

    const handleResolved = useCallback((result) => {
        setChallenge(null);
        if (result?.fighter && onRefreshFighter && fighter?._id) {
            onRefreshFighter(fighter._id, { clearMessage: false });
        }
        load();
    }, [fighter?._id, onRefreshFighter, load]);

    const emptyCopy = scope === "collectable"
        ? "No collectable bounties right now. Post one on a rival to start the hunt."
        : scope === "posted"
            ? "You haven't posted any bounties. Put iron on a rival's head from the ladder or rivals list."
            : "Nobody's posted iron on your head — yet. Keep climbing and that'll change.";

    return (
        <div className="pvp-bounties">
            <div className="pvp-bounty-scopes" role="group" aria-label="Bounty scope">
                {SCOPES.map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        className={`pvp-ladder-toggle-btn ${scope === s.key ? "active" : ""}`}
                        onClick={() => setScope(s.key)}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {loading && <div className="pvp-loading">Loading bounties…</div>}

            {!loading && error && (
                <div className="pvp-error">
                    {error}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Retry</button>
                </div>
            )}

            {!loading && !error && rows.length === 0 && (
                <div className="pvp-empty">{emptyCopy}</div>
            )}

            {!loading && !error && rows.length > 0 && (
                <div className="pvp-bounty-list">
                    {rows.map((row, i) => {
                        const key = row.bountyId ?? row._id ?? row.id ?? `${scope}-${i}`;
                        if (scope === "collectable") {
                            return <CollectableRow key={key} row={row} onChallenge={openChallenge} />;
                        }
                        // posted → show the TARGET; on_me → show the POSTER.
                        return <StandingRow key={key} row={row} party={scope === "posted" ? "target" : "poster"} />;
                    })}
                </div>
            )}

            {challenge && (
                <PvpChallengeFlow
                    fighter={fighter}
                    defenderId={challenge.defenderId}
                    defenderPreview={challenge.preview}
                    onClose={() => setChallenge(null)}
                    onResolved={handleResolved}
                    onMessage={onMessage}
                />
            )}
        </div>
    );
});

export default PvpBounties;
