import { memo, useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { formatRecoveryRemaining } from "../../utils/injuryDisplay";

/**
 * Hospital tab — dedicated screen for everything iron-paid medical.
 *
 * Sections:
 *   1. Services         — short read of what the hospital can do
 *   2. Health Restoration — three packages (Quick Patch / Recovery Bay / Full Restoration)
 *   3. Active Injuries  — list with the iron-paid actions (Visit doctor / Skip recovery)
 *   4. Full Recovery Package — top-level button when 2+ active injuries
 */
const HEALTH_PACKAGES = [
    { key: "quick_patch",      label: "Quick Patch",      hp: 25,  iron: 250, hint: "Top-up purchase. Premium rate for a small ticket." },
    { key: "recovery_bay",     label: "Recovery Bay",     hp: 50,  iron: 400, hint: "Mid-spend, better per-HP than Quick Patch." },
    { key: "full_restoration", label: "Full Restoration", hp: 100, iron: 700, hint: "Best rate per HP. One-click full bar." },
];

export function HospitalTab({ fighter, onMessage, onRefreshFighter }) {
    const fighterId = fighter?._id;
    const injuries = fighter?.injuries || [];
    const hasInjuries = injuries.length > 0;
    const [quote, setQuote] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [busyFull, setBusyFull] = useState(false);
    const [busyHealth, setBusyHealth] = useState(null);

    const currentHealth = quote?.health?.current ?? fighter?.health ?? 100;
    const playerIron = fighter?.iron ?? 0;
    const healthFull = currentHealth >= 100;

    // Tick once a minute so the auto-heal countdown stays fresh while the player
    // is on this page. Only schedules when there are auto-heal injuries to track.
    const [, setTick] = useState(0);
    const hasAutoHealing = injuries.some((inj) => !inj.requiresDoctorVisit && inj.recoveryDaysLeft > 0);
    useEffect(() => {
        if (!hasAutoHealing) return undefined;
        const id = setInterval(() => setTick((n) => n + 1), 60_000);
        return () => clearInterval(id);
    }, [hasAutoHealing]);

    const loadQuote = useCallback(async () => {
        if (!fighterId) {
            setQuote(null);
            return;
        }
        try {
            const q = await api.hospitalQuote(fighterId);
            setQuote(q);
        } catch {
            setQuote(null);
        }
    }, [fighterId, hasInjuries, injuries.length, fighter?.health]);

    useEffect(() => { loadQuote(); }, [loadQuote]);

    async function handleDoctorVisit(injuryType) {
        setBusyId(injuryType);
        try {
            await api.doctorVisit(fighterId, injuryType);
            onMessage?.("Treatment complete.");
            if (onRefreshFighter) await onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || "Treatment failed");
        }
        setBusyId(null);
    }

    async function handleSkipRecovery(injuryType) {
        setBusyId(injuryType);
        try {
            await api.hospitalSkipRecovery(fighterId, injuryType);
            onMessage?.("Recovery skipped — injury healed.");
            if (onRefreshFighter) await onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || "Skip recovery failed");
        }
        setBusyId(null);
    }

    async function handleFullRecovery() {
        setBusyFull(true);
        try {
            const result = await api.hospitalFullRecovery(fighterId);
            const labels = (result.healed || []).join(", ");
            onMessage?.(`Full recovery — healed: ${labels}.`);
            if (onRefreshFighter) await onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || "Full recovery failed");
        }
        setBusyFull(false);
    }

    async function handleRestoreHealth(packageKey) {
        setBusyHealth(packageKey);
        try {
            const result = await api.hospitalRestoreHealth(fighterId, packageKey);
            onMessage?.(`Restored ${result.restored} HP for ${result.ironPaid}🪙.`);
            if (onRefreshFighter) await onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || "Health restoration failed");
        }
        setBusyHealth(null);
    }

    return (
        <div className="hospital-tab">
            <header className="hospital-header">
                <h2 className="hospital-title">🏥 Hospital</h2>
                <p className="hospital-subtitle">
                    Iron-paid medical services. Doctor visits clear blocking injuries; recovery skips
                    skip the wait on auto-heal injuries; health packages restore HP without waiting.
                </p>
            </header>

            <ServicesSection />

            {/* ── HEALTH RESTORATION ── */}
            <section className="hospital-section">
                <div className="hospital-section-header">
                    <h3 className="hospital-section-title">Health Restoration</h3>
                    <div className="hospital-hp-readout">
                        HP <strong>{currentHealth}</strong> / 100
                        <div className="hospital-hp-bar">
                            <div
                                className="hospital-hp-bar-fill"
                                style={{ width: `${Math.max(0, Math.min(100, currentHealth))}%` }}
                            />
                        </div>
                    </div>
                </div>

                {healthFull ? (
                    <div className="hospital-empty">Health is already full.</div>
                ) : (
                    <div className="hospital-health-grid">
                        {(() => {
                            // Compute actual heal + prorated iron for each package.
                            const options = HEALTH_PACKAGES.map((pkg) => {
                                const actualHeal = Math.min(pkg.hp, 100 - currentHealth);
                                const proRatedIron = Math.ceil((actualHeal / pkg.hp) * pkg.iron);
                                return { pkg, actualHeal, proRatedIron };
                            });
                            // A package is "dominated" if another option delivers the same HP at a
                            // lower price. Dominated cards render disabled so the player still sees
                            // the menu but can only act on the best deals at their current state.
                            const isDominated = (opt) => options.some(
                                (other) => other !== opt
                                    && other.actualHeal === opt.actualHeal
                                    && other.proRatedIron < opt.proRatedIron
                            );
                            return options.map(({ pkg, actualHeal, proRatedIron }) => {
                                const dominated = isDominated({ pkg, actualHeal, proRatedIron });
                                const cantAfford = playerIron < proRatedIron;
                                const busy = busyHealth === pkg.key;
                                const isPartial = actualHeal < pkg.hp;
                                const disabled = busy || cantAfford || dominated;
                                const titleText = dominated
                                    ? "A cheaper package delivers the same HP — pick that one instead."
                                    : cantAfford
                                        ? `Need ${proRatedIron}🪙`
                                        : `Pay ${proRatedIron}🪙 for ${actualHeal} HP`;
                                return (
                                    <div
                                        key={pkg.key}
                                        className={`hospital-health-card ${dominated ? "is-dominated" : ""}`}
                                    >
                                        <div className="hospital-health-name">{pkg.label}</div>
                                        <div className="hospital-health-amount">
                                            +{actualHeal} HP
                                            {isPartial && <span className="hospital-health-cap"> (partial)</span>}
                                        </div>
                                        <div className="hospital-health-hint">{pkg.hint}</div>
                                        <button
                                            type="button"
                                            className="btn btn-warning btn-sm hospital-health-btn"
                                            disabled={disabled}
                                            title={titleText}
                                            onClick={() => handleRestoreHealth(pkg.key)}
                                        >
                                            {proRatedIron}🪙
                                        </button>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                )}
            </section>

            {/* ── ACTIVE INJURIES ── */}
            <section className="hospital-section">
                <div className="hospital-section-header">
                    <h3 className="hospital-section-title">Active Injuries</h3>
                    {hasInjuries && quote && quote.count > 1 && (
                        <button
                            type="button"
                            className="btn btn-warning"
                            disabled={busyFull}
                            title={`Heal all ${quote.count} injuries — 15% bulk discount`}
                            onClick={handleFullRecovery}
                        >
                            🏥 Full Recovery — {quote.iron}🪙 + {quote.energy}E
                        </button>
                    )}
                </div>

                {!hasInjuries && (
                    <div className="hospital-empty">No active injuries.</div>
                )}

                {hasInjuries && (
                    <div className="hospital-injury-list">
                        {injuries.map((inj, index) => (
                            <HospitalInjuryRow
                                key={`${inj.type ?? inj.label ?? "injury"}-${index}`}
                                injury={inj}
                                busy={busyId === inj.type}
                                onDoctorVisit={() => handleDoctorVisit(inj.type)}
                                onSkipRecovery={() => handleSkipRecovery(inj.type)}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

const ServicesSection = memo(function ServicesSection() {
    return (
        <section className="hospital-section">
            <h3 className="hospital-section-title">Services</h3>
            <div className="hospital-services">
                <div className="hospital-service-card">
                    <div className="hospital-service-head">
                        <span className="hospital-service-icon">💊</span>
                        <span className="hospital-service-name">Treatment</span>
                    </div>
                    <p className="hospital-service-desc">
                        Clears an injury that requires medical attention (Cut, Concussion, Broken Nose,
                        Torn Ligament). Costs energy + iron. Restores the stat penalty immediately.
                    </p>
                    <div className="hospital-service-tag">From 200🪙 + 10E</div>
                </div>

                <div className="hospital-service-card">
                    <div className="hospital-service-head">
                        <span className="hospital-service-icon">⏱</span>
                        <span className="hospital-service-name">Skip Recovery</span>
                    </div>
                    <p className="hospital-service-desc">
                        Auto-heal injuries (Bruised Rib, Sprained Ankle, Broken Hand) clear over real
                        days. Pay iron to skip the wait and fight tomorrow at full strength.
                    </p>
                    <div className="hospital-service-tag">From 600🪙</div>
                </div>

                <div className="hospital-service-card">
                    <div className="hospital-service-head">
                        <span className="hospital-service-icon">❤️</span>
                        <span className="hospital-service-name">Health Restoration</span>
                    </div>
                    <p className="hospital-service-desc">
                        HP regenerates passively at +1 every 30 minutes. Skip the wait with three
                        packages — Quick Patch (+25), Recovery Bay (+50), Full Restoration (to 100).
                        Available at every tier.
                    </p>
                    <div className="hospital-service-tag">From 200🪙</div>
                </div>

                <div className="hospital-service-card">
                    <div className="hospital-service-head">
                        <span className="hospital-service-icon">🏥</span>
                        <span className="hospital-service-name">Full Recovery Package</span>
                    </div>
                    <p className="hospital-service-desc">
                        Heal every active injury in one transaction. 15% bulk discount over individual
                        services. Becomes available when you have two or more active injuries.
                    </p>
                    <div className="hospital-service-tag">Bulk discount −15%</div>
                </div>
            </div>
        </section>
    );
});

const HospitalInjuryRow = memo(function HospitalInjuryRow({
    injury: inj,
    busy,
    onDoctorVisit,
    onSkipRecovery,
}) {
    const needsDoctor = inj.requiresDoctorVisit && !inj.doctorVisited;
    const isAutoHealing = !inj.requiresDoctorVisit && inj.recoveryDaysLeft > 0;
    const severity = inj.severity === "major" ? "injury-major" : "injury-minor";

    return (
        <div className={`hospital-injury-row ${severity}`}>
            <div className="hospital-injury-info">
                <div className="hospital-injury-headline">
                    <span className="hospital-injury-name">{inj.label}</span>
                    <span className="injury-severity-badge">{inj.severity}</span>
                    {inj.cannotFight && <span className="hospital-injury-flag">blocks fighting</span>}
                    {inj.cannotSpar && <span className="hospital-injury-flag">blocks sparring</span>}
                    {inj.cannotBagWork && <span className="hospital-injury-flag">blocks bag/pad work</span>}
                </div>
                <p className="hospital-injury-desc">{inj.effect}</p>
                {isAutoHealing && (
                    <p className="hospital-injury-meta">
                        Auto-heal in <strong>{formatRecoveryRemaining(inj)}</strong>
                    </p>
                )}
            </div>

            <div className="hospital-injury-actions">
                {needsDoctor && (
                    <button
                        type="button"
                        className="btn btn-warning btn-sm"
                        disabled={busy}
                        onClick={onDoctorVisit}
                    >
                        Treat — {inj.docVisitIron}🪙 + {inj.docVisitEnergy}E
                    </button>
                )}
                {isAutoHealing && inj.recoverySkipIron > 0 && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={onSkipRecovery}
                    >
                        Skip recovery — {inj.recoverySkipIron}🪙
                    </button>
                )}
            </div>
        </div>
    );
});
