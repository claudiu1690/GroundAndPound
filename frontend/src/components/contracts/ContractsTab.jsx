import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";

function formatIron(n) {
    if (n == null) return "0";
    return n.toLocaleString();
}

function formatRelative(d) {
    if (!d) return "";
    const then = new Date(d).getTime();
    if (!Number.isFinite(then)) return "";
    const diff = Math.max(0, Date.now() - then);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

/** Future-facing countdown — "in 3d", "in 5h", "in 12m", or "any moment". */
function formatCountdown(d) {
    if (!d) return "";
    const target = new Date(d).getTime();
    if (!Number.isFinite(target)) return "";
    const diff = target - Date.now();
    if (diff <= 0) return "any moment";
    const m = Math.floor(diff / 60000);
    if (m < 1) return "in <1m";
    if (m < 60) return `in ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h}h`;
    return `in ${Math.floor(h / 24)}d`;
}

function statusTone(status) {
    if (status === "completed") return "pos";
    if (status === "broken" || status === "dropped") return "neg";
    if (status === "expired") return "neu";
    return "active";
}

function statusLabel(status) {
    return { active: "Active", completed: "Completed", broken: "Broken", expired: "Expired", dropped: "Dropped" }[status] || status;
}

export function ContractsTab({ fighter, onMessage, onRefreshFighter }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    /** Contract currently queued for drop confirmation (full object, or null). */
    const [dropCandidate, setDropCandidate] = useState(null);

    const fighterId = fighter?._id;

    const load = useCallback(async () => {
        if (!fighterId) return;
        setLoading(true);
        try {
            const res = await api.getSponsorships(fighterId);
            setData(res);
        } catch (e) {
            onMessage?.(e.message || "Could not load contracts");
            setData(null);
        }
        setLoading(false);
    }, [fighterId, onMessage]);

    useEffect(() => { load(); }, [load]);

    const handleAccept = useCallback(async (sponsorId) => {
        if (!fighterId) return;
        setBusyId(sponsorId);
        try {
            await api.acceptSponsor(fighterId, sponsorId);
            onMessage?.("Contract signed.");
            await load();
            if (onRefreshFighter) onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || "Could not accept contract");
        }
        setBusyId(null);
    }, [fighterId, load, onMessage, onRefreshFighter]);

    const requestDrop = useCallback((contract) => {
        setDropCandidate(contract);
    }, []);

    const cancelDrop = useCallback(() => {
        setDropCandidate(null);
    }, []);

    const confirmDrop = useCallback(async () => {
        if (!fighterId || !dropCandidate) return;
        const sponsorshipId = dropCandidate.id;
        setBusyId(sponsorshipId);
        setDropCandidate(null);
        try {
            await api.dropSponsor(fighterId, sponsorshipId);
            onMessage?.("Contract dropped.");
            await load();
            if (onRefreshFighter) onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || "Could not drop contract");
        }
        setBusyId(null);
    }, [fighterId, dropCandidate, load, onMessage, onRefreshFighter]);

    if (loading || !data) {
        return (
            <section className="contracts-tab">
                <div className="contracts-loading">Loading contracts…</div>
            </section>
        );
    }

    const { available, active, history } = data;
    const fameTier = fighter?.notoriety?.peakTier || "UNKNOWN";

    return (
        <section className="contracts-tab">
            <header className="contracts-header">
                <h2>Contracts</h2>
                <div className="contracts-slots">
                    Slots used: <strong>{available?.slots?.used ?? 0} / {available?.slots?.max ?? 0}</strong>
                    <span className="contracts-slots-hint">
                        {" "}— raise your fame tier to unlock more.
                    </span>
                </div>
            </header>

            <div className="contracts-cols">
                {/* ── ACTIVE ────────────────────────────────────── */}
                <section className="contracts-col">
                    <h3 className="contracts-col-title">Active</h3>
                    {active.length === 0 && (
                        <div className="contracts-empty">
                            No active contracts. Pick one from the offers to start earning on every fight.
                        </div>
                    )}
                    {active.map((c) => (
                        <ActiveCard
                            key={c.id}
                            contract={c}
                            onDrop={() => requestDrop(c)}
                            busy={busyId === c.id}
                        />
                    ))}
                </section>

                {/* ── AVAILABLE ─────────────────────────────────── */}
                <section className="contracts-col">
                    <h3 className="contracts-col-title">
                        Available
                        <span className="contracts-col-sub">
                            {available?.rotationEndsAt
                                ? ` · new offers ${formatCountdown(available.rotationEndsAt)}`
                                : ""}
                        </span>
                    </h3>

                    {fameTier === "UNKNOWN" && (
                        <div className="contracts-empty">
                            Reach <strong>Prospect</strong> fame tier to attract your first sponsors.
                        </div>
                    )}

                    {fameTier !== "UNKNOWN" && available.offers.length === 0 && (
                        <div className="contracts-empty">
                            No new offers right now. Sponsors you've already signed, dropped,
                            or broken this week won't re-appear until the pool refreshes
                            {available?.rotationEndsAt
                                ? ` ${formatCountdown(available.rotationEndsAt)}.`
                                : " next week."}
                        </div>
                    )}

                    {available.offers.map((o) => (
                        <OfferCard
                            key={o.id}
                            offer={o}
                            onAccept={() => handleAccept(o.id)}
                            busy={busyId === o.id}
                            slotsFull={(available.slots.used >= available.slots.max) && available.slots.max > 0}
                        />
                    ))}
                </section>

                {/* ── HISTORY ───────────────────────────────────── */}
                <section className="contracts-col">
                    <h3 className="contracts-col-title">History</h3>
                    {history.length === 0 && (
                        <div className="contracts-empty">No completed contracts yet.</div>
                    )}
                    {history.map((c) => (
                        <HistoryCard key={c.id} contract={c} />
                    ))}
                </section>
            </div>

            <DropContractConfirm
                contract={dropCandidate}
                onCancel={cancelDrop}
                onConfirm={confirmDrop}
            />
        </section>
    );
}

// ───────────────────────────────────────────────────────────────
// Drop-contract confirmation modal
// ───────────────────────────────────────────────────────────────

function DropContractConfirm({ contract, onCancel, onConfirm }) {
    // Close on Escape
    useEffect(() => {
        if (!contract) return;
        const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [contract, onCancel]);

    if (!contract) return null;

    // Backend applies Math.round(famePenaltyOnBreak / 2) on a manual drop.
    const penalty = Math.round((contract.famePenaltyOnBreak || 0) / 2);

    return (
        <div className="drop-confirm-root" role="dialog" aria-modal="true" aria-label="Drop contract">
            <div className="drop-confirm-backdrop" onClick={onCancel} />
            <div className="drop-confirm-shell">
                <header className="drop-confirm-header">
                    <h3>Drop this contract?</h3>
                    <button type="button" className="drop-confirm-close" onClick={onCancel} aria-label="Close">✕</button>
                </header>

                <div className="drop-confirm-body">
                    <div className="drop-confirm-brand">
                        <div className="drop-confirm-brand-name">{contract.brand}</div>
                        <div className="drop-confirm-brand-tagline">{contract.tagline}</div>
                    </div>

                    <div className="drop-confirm-clause">{contract.clauseText}</div>

                    <div className="drop-confirm-penalty">
                        <div className="drop-confirm-penalty-label">Fame penalty</div>
                        <div className="drop-confirm-penalty-value">−{penalty.toLocaleString()} fame</div>
                        <div className="drop-confirm-penalty-hint">
                            Half of the break penalty ({contract.famePenaltyOnBreak} fame). You'll still
                            keep any iron already earned on this contract.
                        </div>
                    </div>

                    {contract.totals?.ironEarned > 0 && (
                        <div className="drop-confirm-earned">
                            Earned so far: <strong>+{(contract.totals.ironEarned || 0).toLocaleString()} ⊗</strong>
                        </div>
                    )}
                </div>

                <footer className="drop-confirm-footer">
                    <button type="button" className="btn btn-secondary" onClick={onCancel}>
                        Keep contract
                    </button>
                    <button type="button" className="btn btn-danger" onClick={onConfirm}>
                        Drop — lose {penalty.toLocaleString()} fame
                    </button>
                </footer>
            </div>
        </div>
    );
}

function ActiveCard({ contract, onDrop, busy }) {
    return (
        <article className="contract-card contract-card-active">
            <header className="contract-head">
                <div>
                    <div className="contract-brand">{contract.brand}</div>
                    <div className="contract-tagline">{contract.tagline}</div>
                </div>
                <span className={`contract-status status-active`}>Active</span>
            </header>

            <div className="contract-clause">{contract.clauseText}</div>
            <div className="contract-progress">
                <div className="contract-progress-bar">
                    <ProgressFill contract={contract} />
                </div>
                <div className="contract-progress-label">{contract.progressText}</div>
            </div>

            <div className="contract-rewards">
                <div><span>Per fight</span><strong>+{formatIron(contract.rewardPerFight)} ⊗</strong></div>
                <div><span>On complete</span><strong>+{formatIron(contract.rewardBonus)} ⊗ · +{contract.fameBonusOnComplete} fame</strong></div>
                <div><span>If broken</span><strong className="neg">−{contract.famePenaltyOnBreak} fame</strong></div>
            </div>

            <footer className="contract-foot">
                <div className="contract-totals">
                    Earned so far: <strong>+{formatIron(contract.totals?.ironEarned || 0)} ⊗</strong>
                </div>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onDrop}
                    disabled={busy}
                >
                    {busy ? "…" : "Drop"}
                </button>
            </footer>
        </article>
    );
}

function OfferCard({ offer, onAccept, busy, slotsFull }) {
    return (
        <article className="contract-card contract-card-offer">
            <header className="contract-head">
                <div>
                    <div className="contract-brand">{offer.brand}</div>
                    <div className="contract-tagline">{offer.tagline}</div>
                </div>
                <span className={`contract-tier-tag tier-${offer.unlockTier}`}>
                    {offer.unlockTier.replace("_", " ")}
                </span>
            </header>

            <div className="contract-clause">{offer.clauseText}</div>

            <div className="contract-rewards">
                <div><span>Per fight</span><strong>+{formatIron(offer.rewardPerFight)} ⊗</strong></div>
                <div><span>On complete</span><strong>+{formatIron(offer.rewardBonus)} ⊗ · +{offer.fameBonusOnComplete} fame</strong></div>
                <div><span>If broken</span><strong className="neg">−{offer.famePenaltyOnBreak} fame</strong></div>
                <div><span>Duration</span><strong>{offer.durationFights} fights</strong></div>
            </div>

            <footer className="contract-foot">
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={onAccept}
                    disabled={busy || slotsFull}
                    title={slotsFull ? "No sponsor slots available" : undefined}
                >
                    {busy ? "…" : slotsFull ? "Slots full" : "Sign contract"}
                </button>
            </footer>
        </article>
    );
}

function HistoryCard({ contract }) {
    const tone = statusTone(contract.status);
    return (
        <article className={`contract-card contract-card-history contract-history-${tone}`}>
            <header className="contract-head">
                <div>
                    <div className="contract-brand">{contract.brand}</div>
                    <div className="contract-tagline">{contract.tagline}</div>
                </div>
                <span className={`contract-status status-${contract.status}`}>
                    {statusLabel(contract.status)}
                </span>
            </header>
            <div className="contract-clause">{contract.clauseText}</div>
            {contract.breakReason && (
                <div className="contract-break-reason">{contract.breakReason}</div>
            )}
            <div className="contract-totals-row">
                <span>+{formatIron(contract.totals?.ironEarned || 0)} ⊗ earned</span>
                {contract.totals?.fameEarned ? <span>+{contract.totals.fameEarned} fame</span> : null}
                {contract.resolvedAt && <span className="muted">{formatRelative(contract.resolvedAt)}</span>}
            </div>
        </article>
    );
}

function ProgressFill({ contract }) {
    const params = contract.clause?.params || {};
    const p = contract.progress || {};
    const total = params.n || contract.durationFights || 1;
    let done = 0;
    if (contract.clause?.type === "WIN_NEXT_N" || contract.clause?.type === "WIN_ANY_N") done = p.wins || 0;
    else if (contract.clause?.type === "FINISH_NEXT_N") done = p.finishes || 0;
    else if (contract.clause?.type === "NO_WEIGHT_MISS" || contract.clause?.type === "NO_FINISH_LOSS") done = p.fights || 0;
    else if (contract.clause?.type === "LAND_ONE_KO") done = Math.min(1, p.kos || 0);
    const pct = Math.max(0, Math.min(100, (done / total) * 100));
    return <div className="contract-progress-fill" style={{ width: `${pct}%` }} />;
}
