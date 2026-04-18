import { memo } from "react";
import { Lock, Crown, Dumbbell, Swords, Shield, Target, Flame, Brain, Zap, Star } from "lucide-react";

const STAT_CHIP_CLASS = {
    STR: "stat-chip-str", SPD: "stat-chip-spd", LEG: "stat-chip-leg",
    WRE: "stat-chip-wre", GND: "stat-chip-gnd", SUB: "stat-chip-sub",
    CHN: "stat-chip-chn", FIQ: "stat-chip-fiq",
};

const GYM_ICONS = {
    "community-mma": Dumbbell,
    "iron-fist-boxing": Target,
    "dragon-kickboxing": Flame,
    "apex-wrestling": Shield,
    "gracie-ground-game": Swords,
    "warrior-muay-thai": Flame,
    "renzo-combat": Swords,
    "precision-mma-lab": Brain,
    "titan-performance": Zap,
    "the-war-room": Brain,
    "elite-fight-academy": Crown,
};

const TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];

function isTierUnlocked(fighterTier, requiredTier) {
    return TIER_ORDER.indexOf(fighterTier) >= TIER_ORDER.indexOf(requiredTier);
}

export const GymSelector = memo(function GymSelector({ gyms, fighter, onSelectGym }) {
    if (!gyms || gyms.length === 0) return null;
    const fighterTier = fighter?.promotionTier ?? "Amateur";

    return (
        <div className="gym-selector">
            <div className="gym-selector-header">
                <h2 className="gym-selector-title">Choose Your Gym</h2>
                <span className="gym-selector-hint">
                    One paid membership at a time. Community gym is always free.
                </span>
            </div>

            <div className="gym-selector-grid">
                {gyms.map((gym) => {
                    const locked = !isTierUnlocked(fighterTier, gym.availableFrom);
                    const isActive = gym.membership?.isActive;
                    const isFree = gym.isFreeGym;
                    const Icon = GYM_ICONS[gym.slug] || Dumbbell;
                    const rankName = gym.progress?.rankName;
                    const rankNum = gym.progress?.rank ?? 0;

                    return (
                        <button
                            key={gym._id}
                            type="button"
                            className={`gs-card${isFree ? " gs-card--free" : ""}${isActive ? " gs-card--active" : ""}${locked ? " gs-card--locked" : ""}`}
                            onClick={() => !locked && onSelectGym(gym._id)}
                            disabled={locked}
                        >
                            {locked && (
                                <div className="gs-lock-overlay">
                                    <Lock size={16} />
                                    <span>Unlocks at {gym.availableFrom}</span>
                                </div>
                            )}

                            <div className="gs-card-top">
                                <Icon size={20} className="gs-card-icon" />
                                <div className="gs-card-cost">
                                    {isFree ? "FREE" : `${gym.weeklyCost} / week`}
                                </div>
                            </div>

                            <div className="gs-card-name">{gym.name}</div>
                            {gym.tagline && <div className="gs-card-tagline">{gym.tagline}</div>}

                            <div className="gs-card-stats">
                                {gym.focusStats && gym.focusStats.length > 0 ? (
                                    gym.focusStats.map((s) => (
                                        <span key={s} className={`stat-chip ${STAT_CHIP_CLASS[s] ?? ""}`}>{s}</span>
                                    ))
                                ) : (
                                    <span className="gs-card-all-stats">All Stats</span>
                                )}
                            </div>

                            {!isFree && gym.progress?.hasJoined && rankNum > 0 && (
                                <div className="gs-card-rank">
                                    <Star size={10} /> Rank {rankNum} — {rankName}
                                </div>
                            )}

                            {isActive && (
                                <div className="gs-card-membership gs-card-membership--active">
                                    Active — {gym.membership.daysLeft}d left
                                </div>
                            )}
                            {!isActive && !isFree && !locked && gym.progress?.hasJoined && (
                                <div className="gs-card-membership gs-card-membership--expired">
                                    Expired
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
});
