import { memo } from "react";
import { Lock } from "lucide-react";

const TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];

function isTierUnlocked(fighterTier, requiredTier) {
    return TIER_ORDER.indexOf(fighterTier) >= TIER_ORDER.indexOf(requiredTier);
}

export const GymSelector = memo(function GymSelector({ gyms, fighter, onSelectGym }) {
    if (!gyms || gyms.length === 0) return null;
    const fighterTier = fighter?.promotionTier ?? "Amateur";

    const groups = TIER_ORDER
        .map((tier) => ({ tier, gyms: gyms.filter((g) => g.availableFrom === tier) }))
        .filter((group) => group.gyms.length > 0);

    return (
        <div className="gym-selector">
            <div className="page-header">
                <div className="page-title">Training</div>
                <h1 className="page-h1">Choose Your Gym</h1>
                <div className="page-sub">One paid membership at a time. Community gym is always free.</div>
            </div>

            {groups.map((group) => {
                const cols = Math.min(3, group.gyms.length);
                return (
                    <div className="tier-group" key={group.tier}>
                        <div className="tier-group-header">
                            <span className="tier-group-label">{group.tier}</span>
                            <span className="tier-group-line" />
                        </div>
                        <div className={`gym-row cols${cols}`}>
                            {group.gyms.map((gym) => {
                                const locked = !isTierUnlocked(fighterTier, gym.availableFrom);
                                const isFree = gym.isFreeGym;
                                const isActive = gym.membership?.isActive;
                                const hasJoined = gym.progress?.hasJoined;
                                const rankNum = gym.progress?.rank ?? 0;
                                const rankName = gym.progress?.rankName;

                                return (
                                    <button
                                        type="button"
                                        key={gym._id}
                                        className={`gym-card${isActive ? " current" : ""}${locked ? " locked" : ""}`}
                                        onClick={() => !locked && onSelectGym(gym._id)}
                                        disabled={locked}
                                    >
                                        <div className={`gym-card-accent ${locked ? "locked-accent" : isFree ? "free" : "available"}`} />
                                        <div className="gym-card-body">
                                            <div className="gym-card-top">
                                                <div className="gym-card-left">
                                                    <div className={`gym-name${locked ? " locked-name" : ""}`}>{gym.name}</div>
                                                    {gym.tagline && <div className="gym-tagline">{gym.tagline}</div>}
                                                </div>
                                                <div className="gym-price-block">
                                                    <div className={`gym-price ${isFree ? "free" : locked ? "locked-p" : "paid"}`}>
                                                        {isFree ? "Free" : gym.weeklyCost.toLocaleString()}
                                                    </div>
                                                    {!isFree && <div className="gym-price-sub">/ week</div>}
                                                </div>
                                            </div>
                                            <div className="gym-card-footer">
                                                <div className="gym-tags">
                                                    {isFree || !gym.focusStats?.length
                                                        ? <span className="gym-tag gym-tag-all">All Stats · {gym.xpMultiplier}×</span>
                                                        : gym.focusStats.map((s) => <span key={s} className={`gym-tag gym-tag-${s.toLowerCase()}`}>{s}</span>)}
                                                </div>
                                                {isActive
                                                    ? <span className="gym-current-badge">Current{gym.membership?.daysLeft != null ? ` · ${gym.membership.daysLeft}d` : ""}</span>
                                                    : (!isFree && !locked) ? <span className="gym-xp-badge">{gym.focusXpMultiplier}× XP</span> : null}
                                            </div>
                                            {!isFree && hasJoined && rankNum > 0 && (
                                                <div className="gym-rank-line">Rank {rankNum} — {rankName}</div>
                                            )}
                                            {!isActive && !isFree && !locked && hasJoined && (
                                                <div className="gym-rank-line gym-expired">Membership expired</div>
                                            )}
                                        </div>
                                        {locked && (
                                            <div className="gym-lock-bar">
                                                <Lock size={11} />
                                                <span className="gym-lock-text">Unlocks at {gym.availableFrom}</span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});
