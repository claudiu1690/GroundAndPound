import { memo, useEffect, useRef, useMemo } from "react";
import { gymImageUrl } from "./gymImage";
import { resolveBoosterDisplay, boosterEffectLine, pctLabel } from "../shop/shopConstants";
import { SESSION_META, SPARRING_KEYS } from "./sessionMeta";
import { GymHeader } from "./GymHeader";
import { SparringRing } from "./SparringRing";
import { TrainingFloor } from "./TrainingFloor";
import { GymStandingPanel } from "./GymStandingPanel";
import { SpecialtyPitchPanel } from "./SpecialtyPitchPanel";
import { StickyGymBar } from "./StickyGymBar";
import { TrendingUp } from "lucide-react";
import { t } from "@/lib/i18n";

// Re-exported so existing importers (TrainingToast.jsx, App.jsx) keep working
// unchanged — the actual catalog now lives in ./sessionMeta.js.
export { SESSION_META, STAT_CHIP_CLASS } from "./sessionMeta";

/**
 * Gym Training screen — orchestrator.
 *
 * Derives all cross-cutting state (energy, booster, canTrain, injury locks,
 * rank-2 unlock, session partitioning, cross-gym lookups) once here, then
 * composes the header, the featured Sparring Ring, the Training Floor, and
 * a sidebar (Gym Standing for paid gyms / the specialty upsell pitch for
 * the free gym). No session-card markup lives in this file — that's owned
 * by SparringRing / TrainingFloor.
 */
export const GymTraining = memo(function GymTraining({
    gym,
    fighter,
    allGyms,
    onTrain,
    training,
    onBack,
    onSwitchGym,
    onRankUp,
    flashSessionKey,
}) {
    const heroUrl = gymImageUrl(gym?.name);
    const headerRef = useRef(null);

    // Preload the hero so the header paints without a flash on click-resolve.
    useEffect(() => {
        if (heroUrl) {
            const img = new Image();
            img.src = heroUrl;
        }
    }, [heroUrl]);

    const energy = fighter?.energy?.current ?? fighter?.energy ?? 0;
    const energyMax = fighter?.energy?.max ?? 100;
    // Active XP booster (only while it still has charges) — surfaced as a banner
    // above the floor and a per-row "+X%" badge on the sessions it boosts.
    const activeBooster = fighter?.activeBooster && fighter.activeBooster.sessionsLeft > 0
        ? resolveBoosterDisplay(fighter.activeBooster)
        : null;
    const isFree = !!gym?.isFreeGym;
    const isActive = !!gym?.membership?.isActive;
    const canTrain = isFree || isActive;
    const injuryLocked = useMemo(() => new Set(fighter?.injuryLockedStats || []), [fighter?.injuryLockedStats]);

    const rank2SessionDef = gym?.ranks?.find((r) => r.rank === 2);
    const rank2SessionKey = rank2SessionDef?.unlock?.sessionKey;
    const rank2Unlocked = (gym?.progress?.rank ?? 0) >= 2;

    const displaySessions = useMemo(() => {
        const list = [...(gym?.sessions || [])];
        if (rank2SessionKey && !list.includes(rank2SessionKey)) list.push(rank2SessionKey);
        return list;
    }, [gym?.sessions, rank2SessionKey]);

    const floorKeys = useMemo(
        () => displaySessions.filter((k) => !SPARRING_KEYS.has(k) && SESSION_META[k]),
        [displaySessions]
    );

    // Sessions taught at OTHER gyms but not here (excludes sparring-family —
    // those get their own dimmed cards in the Ring — and rank2-unique
    // sessions, which are gym-specific by design, not "missing").
    function findGymForSession(key) {
        for (const g of allGyms || []) {
            if (!gym || g._id === gym._id) continue;
            if (g.sessions?.includes(key)) return { name: g.name, rank2: false };
            const r2 = g.ranks?.find((r) => r.unlock?.sessionKey === key);
            if (r2) return { name: g.name, rank2: true };
        }
        return null;
    }

    const otherSessions = useMemo(() => {
        if (!gym) return [];
        return Object.keys(SESSION_META)
            .filter((k) => !SESSION_META[k].rank2 && !SPARRING_KEYS.has(k) && !displaySessions.includes(k))
            .map((k) => {
                const found = findGymForSession(k);
                return { key: k, label: SESSION_META[k].label, gymName: found?.name ?? null };
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displaySessions, allGyms, gym?._id]);

    // Header affordability line: "Enough for N× Sparring or M× <cheapest floor session>".
    const sparringCost = SESSION_META.sparring.cost;
    const sparringAffordable = Math.floor(energy / sparringCost);
    const cheapestFloor = useMemo(() => {
        let best = null;
        for (const key of floorKeys) {
            const m = SESSION_META[key];
            if (!m) continue;
            if (!best || m.cost < best.cost) best = { key, cost: m.cost, label: m.label };
        }
        if (!best) return null;
        const n = Math.floor(energy / best.cost);
        return n > 0 ? { ...best, n } : null;
    }, [floorKeys, energy]);

    if (!fighter || !gym) return null;

    return (
        <div className="gym-training">
            <GymHeader
                gym={gym}
                isFree={isFree}
                isActive={isActive}
                energy={energy}
                energyMax={energyMax}
                heroUrl={heroUrl}
                onBack={onBack}
                onSwitchGym={onSwitchGym}
                sparringAffordable={sparringAffordable}
                cheapestFloor={cheapestFloor}
                headerRef={headerRef}
            />

            <StickyGymBar headerRef={headerRef} gymName={gym.name} energy={energy} />

            {gym.description && (
                <div className="flavor-strip">
                    <div className="flavor-text">{gym.description}</div>
                </div>
            )}

            <div className="gym-body-grid">
                <div className="gym-main-col">
                    <SparringRing
                        gym={gym}
                        energy={energy}
                        canTrain={canTrain}
                        injuryLocked={injuryLocked}
                        rank2SessionKey={rank2SessionKey}
                        rank2Unlocked={rank2Unlocked}
                        findGymForSession={findGymForSession}
                        training={training}
                        onTrain={onTrain}
                        flashSessionKey={flashSessionKey}
                        dropRarityWeights={gym.dropRarityWeights ?? null}
                        isFreeGym={isFree}
                        activeBooster={activeBooster}
                    />

                    {activeBooster && (
                        <div className="booster-banner">
                            <TrendingUp size={14} className="booster-banner-icon" />
                            <span className="booster-banner-name">{activeBooster.name}</span>
                            <span className="booster-banner-pct">+{pctLabel(activeBooster.pct)}% XP</span>
                            <span className="booster-banner-scope">{boosterEffectLine(activeBooster)}</span>
                            <span className="booster-banner-left">
                                {t("gym.booster.sessionsLeft", { n: activeBooster.sessionsLeft, plural: activeBooster.sessionsLeft === 1 ? "" : "s" })}
                            </span>
                        </div>
                    )}

                    <TrainingFloor
                        floorKeys={floorKeys}
                        canTrain={canTrain}
                        injuryLocked={injuryLocked}
                        rank2SessionKey={rank2SessionKey}
                        rank2Unlocked={rank2Unlocked}
                        energy={energy}
                        fighter={fighter}
                        activeBooster={activeBooster}
                        training={training}
                        onTrain={onTrain}
                        flashSessionKey={flashSessionKey}
                    />
                </div>

                <div className="gym-side-col">
                    {isFree ? (
                        <SpecialtyPitchPanel allGyms={allGyms} />
                    ) : (
                        <GymStandingPanel gym={gym} onRankUp={onRankUp} otherSessions={otherSessions} />
                    )}
                </div>
            </div>
        </div>
    );
});
