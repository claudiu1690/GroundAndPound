import { useCallback, useEffect, useState } from "react";
import { PersonaPriceTag } from "../media/PersonaPriceTag";
import { createPortal } from "react-dom";
import { X, AlertTriangle, Lock, FileX, Zap } from "lucide-react";
import { api } from "../../api";
import { t } from "@/lib/i18n";

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
            onMessage?.(e.message || t("contracts.loadError"));
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
            onMessage?.(t("contracts.messages.signed"));
            // Signing creates a sponsorship only — it never changes the fighter's
            // cash/energy/fame, so we skip the global fighter refresh (which would
            // re-render the whole app) and just silently refresh the contracts data.
            await load({ silent: true });
        } catch (e) {
            onMessage?.(e.message || t("contracts.messages.acceptError"));
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
            onMessage?.(t("contracts.messages.dropped"));
            await load({ silent: true });
            // Dropping applies a fame penalty, so the fighter (sidebar fame) does
            // need refreshing here — unlike accepting.
            if (onRefreshFighter) onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || t("contracts.messages.dropError"));
        }
        setBusyId(null);
    }, [fighterId, dropCandidate, load, onMessage, onRefreshFighter]);

    if (loading || !data) {
        return (
            <section className="contracts-tab">
                <div className="contracts-loading">{t("contracts.loading")}</div>
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
                    <div className="page-eyebrow">{t("contracts.header.eyebrow")}</div>
                    <h1 className="page-title">{t("contracts.header.title")}</h1>
                </div>
                <div className="slots-badge">
                    <span className="slots-label">{t("contracts.header.slotsLabel")}</span>
                    <span className="slots-val">{available?.slots?.used ?? 0} / {available?.slots?.max ?? 0}</span>
                    <span className="slots-hint">{t("contracts.header.slotsHint")}</span>
                </div>
            </header>

            <div className="contracts-grid">
                {/* ── ACTIVE ────────────────────────────────────── */}
                <section className="contracts-col">
                    <div className="col-label">{t("contracts.columns.active")}</div>
                    {active.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-state-text">{t("contracts.empty.noActive")}</span>
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
                        {t("contracts.columns.available")}
                        {available?.rotationEndsAt && (
                            <span className="col-label-sub">{t("contracts.columns.newOffers", { countdown: formatCountdown(available.rotationEndsAt) })}</span>
                        )}
                    </div>

                    {fameTier === "UNKNOWN" && (
                        <div className="empty-state">
                            <span className="empty-state-text">{t("contracts.empty.unknownFame")}</span>
                        </div>
                    )}

                    {fameTier !== "UNKNOWN" && available.offers.length === 0 && (
                        <div className="empty-state">
                            <span className="empty-state-text">
                                {available?.rotationEndsAt
                                    ? t("contracts.empty.noOffers", { countdown: formatCountdown(available.rotationEndsAt) })
                                    : t("contracts.empty.noOffersNextWeek")}
                            </span>
                        </div>
                    )}

                    {available.offers.map((o) => (
                        <OfferCard
                            key={o.id}
                            offer={o}
                            personaPayout={available.personaPayout}
                            onAccept={() => handleAccept(o.id)}
                            busy={busyId === o.id}
                            slotsFull={slotsFull}
                        />
                    ))}
                </section>

                {/* ── HISTORY ───────────────────────────────────── */}
                <section className="contracts-col">
                    <div className="col-label">{t("contracts.columns.history")}</div>
                    {history.length === 0 ? (
                        <div className="empty-state">
                            <FileX size={20} />
                            <span className="empty-state-text">{t("contracts.empty.noHistory")}</span>
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

function RewardsBlock({ perFight, perFightBase, onComplete, onCompleteBase, personaPayout, fame, penalty, drinks = 0 }) {
    const showBase = (base, val) => base != null && base !== val;
    return (
        <>
            <div className="contract-rewards">
                <div className="contract-reward">
                    <span className="contract-reward-label">{t("contracts.rewards.perFight")}</span>
                    <span className="contract-reward-val positive">
                        {showBase(perFightBase, perFight) && <s className="reward-base">${formatIron(perFightBase)}</s>}
                        +${formatIron(perFight)}
                    </span>
                </div>
                <div className="contract-reward">
                    <span className="contract-reward-label">{t("contracts.rewards.onComplete")}</span>
                    <span className="contract-reward-val positive">
                        {showBase(onCompleteBase, onComplete) && <s className="reward-base">${formatIron(onCompleteBase)}</s>}
                        +${formatIron(onComplete)}
                    </span>
                </div>
            </div>
            {personaPayout && (
                <div className="contract-persona-note">
                    <PersonaPriceTag tag={personaPayout} goodWhenNegative={false} />
                </div>
            )}
            <div className="contract-reward contract-reward-fame">
                <span className="contract-reward-label">{t("contracts.rewards.onComplete")}</span>
                <span className="contract-reward-val positive-fame">+{fame} <span>fame</span></span>
            </div>
            {drinks > 0 && (
                <div className="contract-reward contract-reward-drinks">
                    <span className="contract-reward-label">{t("contracts.rewards.onComplete")}</span>
                    <span className="contract-reward-val positive-drinks">
                        <Zap size={11} /> +{drinks} <span>{drinks !== 1 ? t("contracts.rewards.energyShots") : t("contracts.rewards.energyShot")}</span>
                    </span>
                </div>
            )}
            <div className="contract-penalty"><AlertTriangle size={12} /> {t("contracts.rewards.penalty", { fame: penalty })}</div>
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
        <div className="drop-confirm-root" role="dialog" aria-modal="true" aria-label={t("contracts.dropConfirm.dialogLabel")}>
            <div className="drop-confirm-backdrop" onClick={onCancel} />
            <div className="drop-confirm-shell">
                <header className="drop-confirm-header">
                    <h3>{t("contracts.dropConfirm.title")}</h3>
                    <button type="button" className="drop-confirm-close" onClick={onCancel} aria-label={t("contracts.dropConfirm.closeLabel")}><X size={16} /></button>
                </header>

                <div className="drop-confirm-body">
                    <div className="drop-confirm-brand">
                        <div className="drop-confirm-brand-name">{contract.brand}</div>
                        <div className="drop-confirm-brand-tagline">{contract.tagline}</div>
                    </div>

                    <div className="drop-confirm-clause">{contract.clauseText}</div>

                    <div className="drop-confirm-penalty">
                        <div className="drop-confirm-penalty-label"><AlertTriangle size={12} /> {t("contracts.dropConfirm.famePenaltyLabel")}</div>
                        <div className="drop-confirm-penalty-value">−{penalty.toLocaleString()} fame</div>
                        <div className="drop-confirm-penalty-hint">
                            {t("contracts.dropConfirm.famePenaltyHint", { fame: contract.famePenaltyOnBreak })}
                        </div>
                    </div>

                    {contract.totals?.ironEarned > 0 && (
                        <div className="drop-confirm-earned">
                            {t("contracts.dropConfirm.earnedSoFar")}<strong>{(contract.totals.ironEarned || 0).toLocaleString()}</strong>
                        </div>
                    )}
                </div>

                <footer className="drop-confirm-footer">
                    <button type="button" className="btn btn-secondary" onClick={onCancel}>
                        {t("contracts.dropConfirm.keepContract")}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={onConfirm}>
                        {t("contracts.dropConfirm.dropBtn", { fame: penalty.toLocaleString() })}
                    </button>
                </footer>
            </div>
        </div>,
        document.body
    );
}

// ───────────────────────────────────────────────────────────────
// Sponsor art header (treatment B). Art derives from the catalog id
// (REDLINE_ENERGY → /assets/sponsors/redline-energy.webp). Missing asset
// degrades to a plain dark band, never a broken image.
// ───────────────────────────────────────────────────────────────
function sponsorArtUrl(catalogId) {
    if (!catalogId) return null;
    return `/assets/sponsors/${String(catalogId).toLowerCase().replace(/_/g, "-")}.webp`;
}

function ContractArt({ catalogId, badge, badgeClass }) {
    const url = sponsorArtUrl(catalogId);
    return (
        <div
            className={`contract-art${url ? "" : " no-art"}`}
            style={url ? { backgroundImage: `url("${url}")` } : undefined}
        >
            {badge && <span className={`contract-status-badge ${badgeClass}`}>{badge}</span>}
        </div>
    );
}

function ActiveCard({ contract, onDrop, busy }) {
    return (
        <article className="contract-card active-card">
            <div className="contract-stripe active" />
            <ContractArt catalogId={contract.sponsorId} badge={t("contracts.activeCard.statusBadge")} badgeClass="active" />
            <div className="contract-body">
                <header className="contract-header">
                    <div className="contract-brand">{contract.brand}</div>
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
                    perFight={contract.rewardPerFightAdjusted ?? contract.rewardPerFight}
                    perFightBase={contract.rewardPerFightAdjusted != null ? contract.rewardPerFight : null}
                    onComplete={contract.rewardBonusAdjusted ?? contract.rewardBonus}
                    onCompleteBase={contract.rewardBonusAdjusted != null ? contract.rewardBonus : null}
                    personaPayout={contract.personaPayout}
                    fame={contract.fameBonusOnComplete}
                    penalty={contract.famePenaltyOnBreak}
                    drinks={contract.rewardDrinks}
                />
                <div className="contract-earned">
                    <span className="contract-earned-label">{t("contracts.activeCard.earnedLabel")}</span>
                    <span className="contract-earned-val">+${formatIron(contract.totals?.ironEarned || 0)}</span>
                    <button className="drop-btn" onClick={onDrop} disabled={busy}>{busy ? "…" : t("contracts.activeCard.drop")}</button>
                </div>
            </div>
        </article>
    );
}

function OfferCard({ offer, personaPayout, onAccept, busy, slotsFull }) {
    return (
        <article className={`contract-card available-card ${slotsFull ? "full-card" : ""}`}>
            <div className="contract-stripe prospect" />
            <ContractArt catalogId={offer.id} badge={offer.unlockTier.replace("_", " ")} badgeClass="prospect" />
            <div className="contract-body">
                <header className="contract-header">
                    <div className="contract-brand">{offer.brand}</div>
                </header>
                <div className="contract-tagline">{offer.tagline}</div>
                <div className="contract-clause">
                    <span className="contract-clause-text">{offer.clauseText}</span>
                </div>
                <RewardsBlock
                    perFight={offer.rewardPerFightAdjusted ?? offer.rewardPerFight}
                    perFightBase={offer.rewardPerFightAdjusted != null ? offer.rewardPerFight : null}
                    onComplete={offer.rewardBonusAdjusted ?? offer.rewardBonus}
                    onCompleteBase={offer.rewardBonusAdjusted != null ? offer.rewardBonus : null}
                    personaPayout={offer.rewardPerFightAdjusted != null ? personaPayout : null}
                    fame={offer.fameBonusOnComplete}
                    penalty={offer.famePenaltyOnBreak}
                    drinks={offer.rewardDrinks}
                />
                <div className="contract-meta-row">
                    <span className="contract-meta-label">{t("contracts.offerCard.durationLabel")}</span>
                    <span className="contract-meta-val">{t("contracts.offerCard.durationValue", { n: offer.durationFights })}</span>
                </div>
                {slotsFull ? (
                    <div className="slots-full-tag"><Lock size={13} /> {t("contracts.offerCard.slotsFull")}</div>
                ) : (
                    <button className="sign-btn" onClick={onAccept} disabled={busy} title={undefined}>{busy ? "…" : t("contracts.offerCard.sign")}</button>
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
            <ContractArt catalogId={contract.sponsorId} badge={statusLabel(contract.status)} badgeClass={stripeClass} />
            <div className="contract-body">
                <header className="contract-header">
                    <div className="contract-brand">{contract.brand}</div>
                </header>
                <div className="contract-tagline">{contract.tagline}</div>
                <div className="contract-clause">
                    <span className="contract-clause-text">{contract.clauseText}</span>
                </div>
                {contract.breakReason && (
                    <div className="contract-break-reason">{contract.breakReason}</div>
                )}
                <div className="contract-totals-row">
                    <span>+${formatIron(contract.totals?.ironEarned || 0)} {t("contracts.historyCard.earnedSuffix")}</span>
                    {contract.totals?.fameEarned ? <span>+{contract.totals.fameEarned} {t("contracts.historyCard.fameSuffix")}</span> : null}
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
