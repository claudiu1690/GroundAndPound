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

    const handleDrop = useCallback(async (sponsorshipId) => {
        if (!fighterId) return;
        if (!window.confirm("Drop this contract? You'll take a fame hit (half the break penalty).")) return;
        setBusyId(sponsorshipId);
        try {
            await api.dropSponsor(fighterId, sponsorshipId);
            onMessage?.("Contract dropped.");
            await load();
            if (onRefreshFighter) onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || "Could not drop contract");
        }
        setBusyId(null);
    }, [fighterId, load, onMessage, onRefreshFighter]);

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
                            onDrop={() => handleDrop(c.id)}
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
                                ? ` · refreshes ${formatRelative(new Date(Date.now() - (Date.now() - new Date(available.rotationEndsAt).getTime())))}`
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
                            No offers right now. Fresh pool arrives next rotation.
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
        </section>
    );
}

// ───────────────────────────────────────────────────────────────

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
