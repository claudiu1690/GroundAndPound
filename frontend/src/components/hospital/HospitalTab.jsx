import { memo, useCallback, useEffect, useState } from "react";
import { Stethoscope, HeartPulse, Package, Coins, ShieldCheck } from "lucide-react";
import { api } from "../../api";
import { InjuryBodyMap } from "./InjuryBodyMap";

/**
 * Hospital tab — dedicated screen for everything iron-paid medical.
 *
 * Sections:
 *   A. Active Injuries  — body map with the cash-paid Treat Now action per injury
 *   B. Services         — short read of what the hospital can do
 *   C. Health Restoration — three packages (Quick Patch / Recovery Bay / Full Restoration)
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

    // Tick once a minute so the heal countdown stays fresh while the player
    // is on this page. Only schedules when there's an injury still healing.
    const [, setTick] = useState(0);
    const hasHealingTimer = injuries.some(
        (inj) => (inj.recoveryHoursLeft > 0 || inj.recoveryDaysLeft > 0) && !inj.doctorVisited
    );
    useEffect(() => {
        if (!hasHealingTimer) return undefined;
        const id = setInterval(() => setTick((n) => n + 1), 60_000);
        return () => clearInterval(id);
    }, [hasHealingTimer]);

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
            onMessage?.(`Restored ${result.restored} HP for $${result.ironPaid}.`);
            if (onRefreshFighter) await onRefreshFighter(fighterId);
        } catch (e) {
            onMessage?.(e.message || "Health restoration failed");
        }
        setBusyHealth(null);
    }

    return (
        <div className="hospital-tab">
            <header className="page-header">
                <div className="page-eyebrow">Medical Centre</div>
                <h1 className="page-title">Hospital</h1>
                <p className="page-sub">
                    Cash-paid medical services. Doctor visits clear blocking injuries instantly.
                    Health packages restore HP without waiting.
                </p>
            </header>

            <div className="body">
                {/* ── SECTION A — ACTIVE INJURIES ── */}
                <section data-tut="hospital-injuries">
                    <div className="slbl-row">
                        <div className="slbl">Active Injuries</div>
                        {hasInjuries && quote && quote.count > 1 && (
                            <button
                                type="button"
                                className="treat-btn full-recovery-btn"
                                disabled={busyFull}
                                title={`Heal all ${quote.count} injuries — 15% bulk discount`}
                                onClick={handleFullRecovery}
                            >
                                <Package size={14} /> Full Recovery — ${quote.iron} + {quote.energy}E
                            </button>
                        )}
                    </div>

                    {!hasInjuries && (
                        <div className="bm-healthy">
                            <span className="bm-healthy-icon"><ShieldCheck size={22} /></span>
                            <div className="bm-healthy-text">
                                <strong>No active injuries.</strong>
                                <span>Cleared to train, spar, and fight at full capacity.</span>
                            </div>
                        </div>
                    )}

                    {hasInjuries && (
                        <InjuryBodyMap
                            injuries={injuries}
                            busyId={busyId}
                            onDoctorVisit={handleDoctorVisit}
                            onSkipRecovery={handleSkipRecovery}
                        />
                    )}
                </section>

                {/* ── SECTION B — SERVICES ── */}
                <ServicesSection />

                {/* ── SECTION C — HEALTH RESTORATION ── */}
                <section>
                    <div className="slbl">Health Restoration</div>
                    <div className="hp-card" data-tut="hospital-health">
                        <div className="hp-header">
                            <span className="hp-lbl">Current HP</span>
                            <div className="hp-nums">
                                <span className="hp-big">{currentHealth}</span>
                                <span className="hp-of">/ 100</span>
                            </div>
                            {!healthFull && (
                                <span className="hp-regen">
                                    +1 HP every 5 min passively · full in ~{Math.max(0, (100 - currentHealth) * 5)}m
                                </span>
                            )}
                        </div>
                        <div className="hp-track">
                            <div
                                className="hp-fill"
                                style={{ width: `${Math.max(0, Math.min(100, currentHealth))}%` }}
                            />
                        </div>

                        {healthFull ? (
                            <div className="hp-empty">Health is already full.</div>
                        ) : (
                            <div className="hp-pkgs" data-tut="hospital-restore">
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
                                                ? `Need $${proRatedIron}`
                                                : `Pay $${proRatedIron} for ${actualHeal} HP`;
                                        return (
                                            <div
                                                key={pkg.key}
                                                className={`hp-pkg ${pkg.key === "recovery_bay" ? "best" : ""} ${dominated ? "is-dominated" : ""}`}
                                            >
                                                <div className="hp-pkg-left">
                                                    <div className="hp-pkg-name">
                                                        {pkg.label}
                                                        {pkg.key === "recovery_bay" && <span className="best-tag">Best</span>}
                                                    </div>
                                                    <div className="hp-pkg-hp">+{actualHeal} HP</div>
                                                    <div className="hp-pkg-hplbl">{isPartial ? "partial restore" : "fills to 100"}</div>
                                                    <div className="hp-pkg-desc">{pkg.hint}</div>
                                                </div>
                                                <div className="hp-pkg-right">
                                                    <button
                                                        type="button"
                                                        className={`hp-buy-btn ${pkg.key === "recovery_bay" ? "best" : ""}`}
                                                        disabled={disabled}
                                                        title={titleText}
                                                        onClick={() => handleRestoreHealth(pkg.key)}
                                                    >
                                                        <Coins size={13} /> ${proRatedIron}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

const ServicesSection = memo(function ServicesSection() {
    return (
        <section>
            <div className="slbl">Services</div>
            <div className="services-grid">
                <div className="svc">
                    <div className="svc-stripe svc-stripe--red" />
                    <div className="svc-body">
                        <div className="svc-top">
                            <span className="svc-icon svc-icon--red"><Stethoscope size={16} /></span>
                            <span className="svc-name">Treatment</span>
                        </div>
                        <p className="svc-desc">
                            Every injury heals on its own over time. In a hurry? Pay to clear one
                            instantly with <strong>Treat Now</strong> — the cost depends on the injury.
                        </p>
                        <div className="svc-price"><Coins size={12} /> From $200</div>
                    </div>
                </div>

                <div className="svc">
                    <div className="svc-stripe svc-stripe--blue" />
                    <div className="svc-body">
                        <div className="svc-top">
                            <span className="svc-icon svc-icon--blue"><HeartPulse size={16} /></span>
                            <span className="svc-name">Health Restoration</span>
                        </div>
                        <p className="svc-desc">
                            HP regenerates passively at +1 every 5 minutes. Skip the wait with Quick Patch,
                            Recovery Bay, or Full Restoration.
                        </p>
                        <div className="svc-price"><Coins size={12} /> From $200</div>
                    </div>
                </div>

                <div className="svc">
                    <div className="svc-stripe svc-stripe--gold" />
                    <div className="svc-body">
                        <div className="svc-top">
                            <span className="svc-icon svc-icon--gold"><Package size={16} /></span>
                            <span className="svc-name">Full Recovery</span>
                        </div>
                        <p className="svc-desc">
                            Heal every active injury in one transaction. Available with two or more active
                            injuries.
                        </p>
                        <div className="svc-discount">Bulk Discount — 15%</div>
                    </div>
                </div>
            </div>
        </section>
    );
});

