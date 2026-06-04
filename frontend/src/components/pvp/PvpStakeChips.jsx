import { memo } from "react";
import { Trophy, Zap, TrendingUp, Flame, Target } from "lucide-react";

/**
 * "What's at stake" chip row for the PvP camp screen.
 *
 * Props:
 *   rankPreview { on_win, on_loss }  — signed rank-point estimates (null → "—")
 *   isBeltFight                      — gold BELT FIGHT chip
 *   isRevenge                        — REVENGE chip (lit when opened with context="revenge"
 *                                      or the profile head_to_head.revenge_available is true)
 *   energyCost                       — attacker tier fight energy cost (number)
 *   gap { factor, isUnderdog }       — reward gap: punch-down factor (<1) or
 *                                      underdog (attacker is lower OVR → upset bonus)
 *   bountyOnDefender                 — total open iron bounty on the defender's
 *                                      head (number). > 0 lights the BOUNTY chip;
 *                                      0 / null → chip hidden (graceful blank).
 */
export const PvpStakeChips = memo(function PvpStakeChips({
    rankPreview,
    isBeltFight = false,
    isRevenge = false,
    energyCost,
    gap,
    bountyOnDefender = 0,
}) {
    const onWin = rankPreview?.on_win;
    const onLoss = rankPreview?.on_loss;
    const hasRank = onWin != null || onLoss != null;

    return (
        <div className="pvp-stake-row" aria-label="What's at stake">
            {isBeltFight && (
                <span className="pvp-stake-chip pvp-stake-chip--belt">
                    <Trophy size={11} /> BELT FIGHT
                </span>
            )}

            <span className="pvp-stake-chip">
                <TrendingUp size={11} />
                {hasRank ? (
                    <>
                        <span className="pvp-stake-pos">{onWin != null ? (onWin > 0 ? `+${onWin}` : onWin) : "—"}</span>
                        {" / "}
                        <span className="pvp-stake-neg">{onLoss != null ? onLoss : "—"}</span>
                        {" rank pts"}
                    </>
                ) : (
                    <>— rank pts</>
                )}
            </span>

            {/* REVENGE — lit when this is a settle-the-score bout. */}
            {isRevenge && (
                <span className="pvp-stake-chip pvp-stake-chip--revenge pvp-stake-chip--revenge-lit">
                    <Flame size={11} /> REVENGE
                </span>
            )}

            {/* BOUNTY — lit when the defender has open iron on their head. */}
            {bountyOnDefender > 0 && (
                <span className="pvp-stake-chip pvp-stake-chip--bounty pvp-stake-chip--bounty-lit"
                    title={`${Number(bountyOnDefender).toLocaleString()} iron in bounties — win in-bracket to collect.`}>
                    <Target size={11} /> BOUNTY +{Number(bountyOnDefender).toLocaleString()}
                </span>
            )}

            {energyCost != null && (
                <span className="pvp-stake-chip">
                    <Zap size={11} /> −{energyCost} Energy
                </span>
            )}

            {gap?.isUnderdog ? (
                <span className="pvp-stake-chip pvp-stake-chip--underdog">
                    Underdog — full rewards + upset bonus
                </span>
            ) : (gap?.factor != null && gap.factor < 1) ? (
                <span className="pvp-stake-chip pvp-stake-chip--gap">
                    Punching down — rewards ×{gap.factor.toFixed(2)}
                </span>
            ) : null}
        </div>
    );
});

export default PvpStakeChips;
