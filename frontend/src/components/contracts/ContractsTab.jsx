import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, Lock, FileX } from "lucide-react";
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

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!fighterId) return;
        // Silent refresh (after accept/drop) updates the data in place without
        // flipping to the full-section "Loading…" placeholder, so the grid never
        // unmounts and the page doesn't visibly re-render.
        if (!silent) setLoading(true);
        try {
            const res = await api.getSponsorships(fighterId);
            setData(res);
        } catch (e) {
            onMessage?.(e.message || "Could not load contracts");
            if (!silent) setData(null);
        }
        if (!silent) setLoading(false);
    }, [fighterId, onMessage]);

    useEffect(() => { load(); }, [load]);

    const handleAccept = useCallback(async (sponsorId) => {
        if (!fighterId) return;
        setBusyId(sponsorId);
        try {
            await api.acceptSponsor(fighterId, sponsorId);
            onMessage?.("Contract signed.");
            // Signing creates a sponsorship only — it never changes the fighter's
            // cash/energy/fame, so we skip the global fighter refresh (which would
            // re-render the whole app) and just silently refresh the contracts data.
            await load({ silent: true });
        } catch (e) {
            onMessage?.(e.message || "Could not accept contract");
        }
        setBusyId(null);
    }, [fighterId, load, onMessage]);

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
            await load({ silent: true });
            // Dropping applies a fame penalty, so the fighter (sidebar fame) does
            // need refreshing here — unlike accepting.
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
    const slotsFull = (available.slots.used >= available.slots.max) && available.slots.max > 0;

    return (
        <section className="contracts-tab">
            <header className="page-header">
                <div className="page-header-left">
                    <div className="page-eyebrow">Sponsorships</div>
                    <h1 className="page-title">Contracts</h1>
                </div>
                <div className="slots-badge">
                    <span className="slots-label">Slots Used</span>
                    <span className="slots-val">{available?.slots?.used ?? 0} / {available?.slots?.max ?? 0}</span>
                    <span className="slots-hint">Raise your fame tier to unlock more</span>
                </div>
            </header>

            <div className="contracts-grid">
                {/* ── ACTIVE ────────────────────────────────────── */}
                <section className="contracts-col">
                    <div className="col-label">Active</div>
                    {active.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-state-text">No active contracts. Pick one from the offers to start earning on every fight.</span>
                        </div>
                    ) : active.map((c) => (
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
                    <div className="col-label">
                        Available
                        {available?.rotationEndsAt && (
                            <span className="col-label-sub"> · new offers {formatCountdown(available.rotationEndsAt)}</span>
                        )}
                    </div>

                    {fameTier === "UNKNOWN" && (
                        <div className="empty-state">
                            <span className="empty-state-text">Reach <strong>Prospect</strong> fame tier to attract your first sponsors.</span>
                        </div>
                    )}

                    {fameTier !== "UNKNOWN" && available.offers.length === 0 && (
                        <div className="empty-state">
                            <span className="empty-state-text">
                                No new offers right now. Sponsors you've already signed, dropped, or broken this week won't re-appear until the pool refreshes
                                {available?.rotationEndsAt ? ` ${formatCountdown(available.rotationEndsAt)}.` : " next week."}
                            </span>
                        </div>
                    )}

                    {available.offers.map((o) => (
                        <OfferCard
                            key={o.id}
                            offer={o}
                            onAccept={() => handleAccept(o.id)}
                            busy={busyId === o.id}
                            slotsFull={slotsFull}
                        />
                    ))}
                </section>

                {/* ── HISTORY ───────────────────────────────────── */}
                <section className="contracts-col">
                    <div className="col-label">History</div>
                    {history.length === 0 ? (
                        <div className="empty-state">
                            <FileX size={20} />
                            <span className="empty-state-text">No completed contracts yet. Finish your first contract to see it here.</span>
                        </div>
                    ) : history.map((c) => (
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
// Shared rewards block (Active + Offer)
// ───────────────────────────────────────────────────────────────

function RewardsBlock({ perFight, onComplete, fame, penalty }) {
    return (
        <>
            <div className="contract-rewards">
                <div className="contract-reward">
                    <span className="contract-reward-label">Per Fight</span>
                    <span className="contract-reward-val positive">+${formatIron(perFight)}</span>
                </div>
                <div className="contract-reward">
                    <span className="contract-reward-label">On Complete</span>
                    <span className="contract-reward-val positive">+${formatIron(onComplete)}</span>
                </div>
            </div>
            <div className="contract-reward contract-reward-fame">
                <span className="contract-reward-label">On Complete</span>
                <span className="contract-reward-val positive-fame">+{fame} <span>fame</span></span>
            </div>
            <div className="contract-penalty"><AlertTriangle size={12} /> If broken — −{penalty} fame</div>
        </>
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

    return createPortal(
        <div className="drop-confirm-root" role="dialog" aria-modal="true" aria-label="Drop contract">
            <div className="drop-confirm-backdrop" onClick={onCancel} />
            <div className="drop-confirm-shell">
                <header className="drop-confirm-header">
                    <h3>Drop this contract?</h3>
                    <button type="button" className="drop-confirm-close" onClick={onCancel} aria-label="Close"><X size={16} /></button>
                </header>

                <div className="drop-confirm-body">
                    <div className="drop-confirm-brand">
                        <div className="drop-confirm-brand-name">{contract.brand}</div>
                        <div className="drop-confirm-brand-tagline">{contract.tagline}</div>
                    </div>

                    <div className="drop-confirm-clause">{contract.clauseText}</div>

                    <div className="drop-confirm-penalty">
                        <div className="drop-confirm-penalty-label"><AlertTriangle size={12} /> Fame penalty</div>
                        <div className="drop-confirm-penalty-value">−{penalty.toLocaleString()} fame</div>
                        <div className="drop-confirm-penalty-hint">
                            Half of the break penalty ({contract.famePenaltyOnBreak} fame). You'll still
                            keep any cash already earned on this contract.
                        </div>
                    </div>

                    {contract.totals?.ironEarned > 0 && (
                        <div className="drop-confirm-earned">
                            Earned so far: <strong>+${(contract.totals.ironEarned || 0).toLocaleString()}</strong>
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
        </div>,
        document.body
    );
}

function ActiveCard({ contract, onDrop, busy }) {
    return (
        <article className="contract-card active-card">
            <div className="contract-stripe active" />
            <div className="contract-body">
                <header className="contract-header">
                    <div className="contract-brand">{contract.brand}</div>
                    <span className="contract-status-badge active">Active</span>
                </header>
                <div className="contract-tagline">{contract.tagline}</div>
                <div className="contract-clause">
                    <span className="contract-clause-text">{contract.clauseText}</span>
                    <div className="contract-progress-track">
                        <ProgressFill contract={contract} />
                    </div>
                    <span className="contract-progress-label">{contract.progressText}</span>
                </div>
                <RewardsBlock
                    perFight={contract.rewardPerFight}
                    onComplete={contract.rewardBonus}
                    fame={contract.fameBonusOnComplete}
                    penalty={contract.famePenaltyOnBreak}
                />
                <div className="contract-earned">
                    <span className="contract-earned-label">Earned so far</span>
                    <span className="contract-earned-val">+${formatIron(contract.totals?.ironEarned || 0)}</span>
                    <button className="drop-btn" onClick={onDrop} disabled={busy}>{busy ? "…" : "Drop"}</button>
                </div>
            </div>
        </article>
    );
}

function OfferCard({ offer, onAccept, busy, slotsFull }) {
    return (
        <article className={`contract-card available-card ${slotsFull ? "full-card" : ""}`}>
            <div className="contract-stripe prospect" />
            <div className="contract-body">
                <header className="contract-header">
                    <div className="contract-brand">{offer.brand}</div>
                    <span className="contract-status-badge prospect">{offer.unlockTier.replace("_", " ")}</span>
                </header>
                <div className="contract-tagline">{offer.tagline}</div>
                <div className="contract-clause">
                    <span className="contract-clause-text">{offer.clauseText}</span>
                </div>
                <RewardsBlock
                    perFight={offer.rewardPerFight}
                    onComplete={offer.rewardBonus}
                    fame={offer.fameBonusOnComplete}
                    penalty={offer.famePenaltyOnBreak}
                />
                <div className="contract-meta-row">
                    <span className="contract-meta-label">Duration</span>
                    <span className="contract-meta-val">{offer.durationFights} fights</span>
                </div>
                {slotsFull ? (
                    <div className="slots-full-tag"><Lock size={13} /> Slots Full</div>
                ) : (
                    <button className="sign-btn" onClick={onAccept} disabled={busy} title={undefined}>{busy ? "…" : "Sign"}</button>
                )}
            </div>
        </article>
    );
}

function HistoryCard({ contract }) {
    const tone = statusTone(contract.status);
    const stripeClass = tone === "pos" ? "prospect" : tone === "neg" ? "active" : "locked";
    return (
        <article className="contract-card history-card">
            <div className={`contract-stripe ${stripeClass}`} />
            <div className="contract-body">
                <header className="contract-header">
                    <div className="contract-brand">{contract.brand}</div>
                    <span className={`contract-status-badge ${stripeClass}`}>{statusLabel(contract.status)}</span>
                </header>
                <div className="contract-tagline">{contract.tagline}</div>
                <div className="contract-clause">
                    <span className="contract-clause-text">{contract.clauseText}</span>
                </div>
                {contract.breakReason && (
                    <div className="contract-break-reason">{contract.breakReason}</div>
                )}
                <div className="contract-totals-row">
                    <span>+${formatIron(contract.totals?.ironEarned || 0)} earned</span>
                    {contract.totals?.fameEarned ? <span>+{contract.totals.fameEarned} fame</span> : null}
                    {contract.resolvedAt && <span className="muted">{formatRelative(contract.resolvedAt)}</span>}
                </div>
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
