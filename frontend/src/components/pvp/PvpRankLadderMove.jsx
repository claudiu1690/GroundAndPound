import { memo, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

/**
 * Dramatized ladder move on the PvP summary: animated `#N → #M` + rank-point
 * delta, with a challenge-zone kicker when entering the top-10.
 *
 * Props:
 *   rankBefore   — ladder rank before the fight (null = was unranked)
 *   rankAfter    — ladder rank after the fight  (null = still unranked)
 *   pointsDelta  — signed rank-point change
 */
export const PvpRankLadderMove = memo(function PvpRankLadderMove({
    rankBefore,
    rankAfter,
    pointsDelta,
}) {
    // Nothing meaningful to show if we have neither a rank nor a delta.
    const hasRankInfo = rankBefore != null || rankAfter != null;
    const hasDelta = pointsDelta != null && pointsDelta !== 0;
    if (!hasRankInfo && !hasDelta) return null;

    const [displayRank, setDisplayRank] = useState(rankBefore);

    // Animate the rank number from before → after on mount.
    useEffect(() => {
        if (rankBefore == null || rankAfter == null || rankBefore === rankAfter) {
            setDisplayRank(rankAfter ?? rankBefore);
            return;
        }
        setDisplayRank(rankBefore);
        const t = setTimeout(() => setDisplayRank(rankAfter), 420);
        return () => clearTimeout(t);
    }, [rankBefore, rankAfter]);

    const improved = pointsDelta != null ? pointsDelta > 0 : (rankAfter != null && rankBefore != null && rankAfter < rankBefore);
    const enteredZone = rankBefore != null && rankAfter != null && rankBefore > 10 && rankAfter <= 10;

    const fmtRank = (r) => (r == null ? "Unranked" : `#${r}`);

    return (
        <div className={`pvp-rank-move pvp-rank-move--${improved ? "up" : "down"}`} aria-label="Ladder move">
            <div className="pvp-rank-move-line">
                <span className="pvp-rank-move-from">{fmtRank(rankBefore)}</span>
                <span className="pvp-rank-move-arrow"><ArrowRight size={16} /></span>
                <span className="pvp-rank-move-to" key={displayRank}>{fmtRank(displayRank)}</span>
            </div>
            {hasDelta && (
                <div className="pvp-rank-move-delta">
                    {pointsDelta > 0 ? `+${pointsDelta}` : pointsDelta} rank points
                </div>
            )}
            {enteredZone && (
                <div className="pvp-rank-move-kicker">You&apos;ve entered the top-10 challenge zone.</div>
            )}
        </div>
    );
});

export default PvpRankLadderMove;
