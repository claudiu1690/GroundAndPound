import { useState } from "react";
import { Zap, Check, ChevronLeft } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Gym identity header: back link, name, tier/stat/xp tags, join/membership
 * control, and a real energy bar (fill = energy/energyMax) with an
 * "enough for N× Sparring or M× <cheapest>" affordability line.
 *
 * data-tut="gym-info" on the container, data-tut="energy" on the energy
 * module — both are tutorial anchors (see constants/tutorialSteps.js).
 */
export function GymHeader({
    gym,
    isFree,
    isActive,
    energy,
    energyMax,
    heroUrl,
    onBack,
    onSwitchGym,
    sparringAffordable,
    cheapestFloor,
    headerRef,
}) {
    const [joinError, setJoinError] = useState("");
    const energyPct = energyMax > 0 ? Math.min(100, Math.max(0, (energy / energyMax) * 100)) : 0;

    return (
        <div
            className="gym-header gym-header-hero"
            data-tut="gym-info"
            ref={headerRef}
            style={{ backgroundImage: heroUrl ? `url(${heroUrl})` : undefined }}
        >
            <div className="gym-header-overlay" aria-hidden="true" />
            <div className="gym-header-row1">
                <button type="button" className="gym-back" onClick={onBack}>
                    <ChevronLeft size={12} /> {t("gym.header.allGyms")}
                </button>
            </div>
            <div className="gym-header-row2">
                <div className="gym-header-id">
                    <div className="gym-title">{gym.name}</div>
                    <div className="gym-tags">
                        {!isFree && gym.focusStats?.length ? (
                            <>
                                {gym.focusStats.map((s) => (
                                    <span key={s} className={`gym-tag gym-tag-${s.toLowerCase()}`}>{s}</span>
                                ))}
                                <span className="gym-tag xp">{gym.focusXpMultiplier}× XP</span>
                            </>
                        ) : null}
                        {isFree && (
                            <span className="gym-tag gym-tag-all">{t("gym.card.allStats", { mult: gym.xpMultiplier })}</span>
                        )}
                    </div>
                    {isActive && (
                        <span className="gym-membership-badge">
                            <Check size={11} /> {t("gym.header.membershipLeft", { days: gym.membership.daysLeft })}
                        </span>
                    )}
                </div>
                <div className="gym-header-right">
                    {!isFree && !isActive && (
                        <div className="gym-join-wrap">
                            <button
                                type="button"
                                className="gym-join-btn"
                                onClick={async () => {
                                    setJoinError("");
                                    const res = await onSwitchGym(gym._id);
                                    if (res && res.ok === false) {
                                        setJoinError(res.error || "Couldn't join this gym.");
                                    }
                                }}
                            >
                                {t("gym.header.joinBtn", { cost: gym.weeklyCost })}
                            </button>
                            {joinError && <div className="gym-join-error">{joinError}</div>}
                        </div>
                    )}
                    <div className="gym-energy-mod" data-tut="energy">
                        <div className="gym-energy-top">
                            <span className="gym-energy-mod-lbl">{t("gym.header.energy")}</span>
                            <span className="gym-energy-mod-val">
                                <Zap size={13} /> {energy} <small>{t("gym.header.energyOfMax", { max: energyMax })}</small>
                            </span>
                        </div>
                        <div className="gym-energy-mod-bar">
                            <div className="gym-energy-mod-fill" style={{ width: `${energyPct}%` }} />
                        </div>
                        <div className="gym-energy-mod-note">
                            {sparringAffordable > 0 && cheapestFloor ? (
                                t("gym.header.energyNoteBoth", {
                                    sparringN: sparringAffordable,
                                    floorN: cheapestFloor.n,
                                    floorLabel: cheapestFloor.label,
                                })
                            ) : sparringAffordable > 0 ? (
                                t("gym.header.energyNoteSparringOnly", { sparringN: sparringAffordable })
                            ) : cheapestFloor ? (
                                t("gym.header.energyNoteFloorOnly", { floorN: cheapestFloor.n, floorLabel: cheapestFloor.label })
                            ) : (
                                t("gym.header.energyNoteNone")
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
