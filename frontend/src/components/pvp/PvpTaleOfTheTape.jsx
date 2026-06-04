import { memo } from "react";
import { Crown, Heart } from "lucide-react";
import { STYLE_COLORS } from "../fights/FighterReport";

const DEFAULT_STYLE_COLOR = { bg: "#2a2a2c", label: "#94a3b8" };

/**
 * Normalised fighter shape consumed by the tape:
 *   { name, nickname, ovr, style, record, ladderRank, isChampion, streak }
 * In `result` mode the columns also accept post-fight HP via the `health` prop
 * on the component (attacker/defender before/after).
 */

function StreakDot({ streak }) {
    if (streak == null || streak === 0) return null;
    const positive = streak > 0;
    return (
        <span className={`pvp-tape-streak ${positive ? "pvp-tape-streak--hot" : "pvp-tape-streak--cold"}`}>
            {positive ? `W${streak}` : `L${Math.abs(streak)}`}
        </span>
    );
}

function FighterColumn({ fighter, side, crowned, dimmed }) {
    const styleColor = STYLE_COLORS[fighter?.style] ?? DEFAULT_STYLE_COLOR;
    return (
        <div
            className={
                "pvp-tape-col" +
                ` pvp-tape-col--${side}` +
                (crowned ? " pvp-tape-col--winner" : "") +
                (dimmed ? " pvp-tape-col--dimmed" : "")
            }
        >
            {crowned && (
                <div className="pvp-tape-crown" title="Winner">
                    <Crown size={16} />
                </div>
            )}
            <div className="pvp-tape-name">{fighter?.name || "—"}</div>
            {fighter?.nickname && <div className="fr-nickname pvp-tape-nick">&ldquo;{fighter.nickname}&rdquo;</div>}
            <div className="fr-ovr-block pvp-tape-ovr">
                <div className="fr-ovr-val">{fighter?.ovr ?? "—"}</div>
                <div className="fr-ovr-label">Overall</div>
            </div>
            <div className="pvp-tape-meta">
                {fighter?.style && (
                    <span className="pvp-tape-style" style={{ color: styleColor.label }}>{fighter.style}</span>
                )}
                {fighter?.record && <span className="pvp-tape-record">{fighter.record}</span>}
            </div>
            <div className="pvp-tape-meta pvp-tape-meta--sub">
                {fighter?.ladderRank != null && <span className="pvp-tape-rank">#{fighter.ladderRank}</span>}
                <StreakDot streak={fighter?.streak} />
                {fighter?.isChampion && <span className="pvp-badge pvp-badge-champ">CHAMP</span>}
            </div>
        </div>
    );
}

/** OVR-gap odds framing from the attacker's perspective ("FAVORED +6" etc.). */
function oddsLabel(attackerOvr, defenderOvr) {
    if (attackerOvr == null || defenderOvr == null) return { text: "Pick'em", tone: "even" };
    const gap = attackerOvr - defenderOvr;
    if (gap >= 1) return { text: `FAVORED +${gap}`, tone: "fav" };
    if (gap <= -1) return { text: `Underdog −${Math.abs(gap)}`, tone: "dog" };
    return { text: "Pick'em", tone: "even" };
}

function HpBar({ label, before, after, suppressed }) {
    if (suppressed) {
        return (
            <div className="pvp-tape-hp-row">
                <span className="pvp-tape-hp-label">{label}</span>
                <span className="pvp-tape-hp-val pvp-tape-hp-val--muted">—</span>
            </div>
        );
    }
    const pct = Math.max(0, Math.min(100, after ?? 0));
    const lost = before != null && after != null ? Math.max(0, before - after) : null;
    return (
        <div className="pvp-tape-hp-row">
            <span className="pvp-tape-hp-label"><Heart size={11} /> {label}</span>
            <span className="pvp-tape-hp-track">
                <span className="pvp-tape-hp-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="pvp-tape-hp-val">
                {after ?? "—"}{before != null ? ` / ${before}` : ""}
                {lost > 0 && <span className="pvp-tape-hp-loss"> −{lost}</span>}
            </span>
        </div>
    );
}

export const PvpTaleOfTheTape = memo(function PvpTaleOfTheTape({
    mode = "preview",
    attacker,
    defender,
    winner,            // "attacker" | "defender" | "draw" (result mode)
    isBeltFight = false,
    health,            // { attacker:{before,after}, defender:{before,after} } (result mode)
}) {
    const isResult = mode === "result";
    const odds = oddsLabel(attacker?.ovr, defender?.ovr);

    // UPSET = the lower-ranked fighter won. Higher rank number = lower ranked.
    let isUpset = false;
    if (isResult && winner && winner !== "draw") {
        const aRank = attacker?.ladderRank;
        const dRank = defender?.ladderRank;
        if (aRank != null && dRank != null) {
            const winnerRank = winner === "attacker" ? aRank : dRank;
            const loserRank = winner === "attacker" ? dRank : aRank;
            isUpset = winnerRank > loserRank; // worse (higher) number won
        }
    }

    // Bot-defender HP guard (contract 4.3): suppress the defender bar (show "—")
    // when the defender was kept fresh (before===after===100) AND lost.
    const defBefore = health?.defender?.before;
    const defAfter = health?.defender?.after;
    const defenderLost = winner === "attacker";
    const suppressDefenderHp =
        defBefore === 100 && defAfter === 100 && defenderLost;

    return (
        <div className={`pvp-tape${isResult ? " pvp-tape--result" : ""}`}>
            <div className="pvp-tape-grid">
                <FighterColumn
                    fighter={attacker}
                    side="left"
                    crowned={isResult && winner === "attacker"}
                    dimmed={isResult && winner === "defender"}
                />

                <div className="pvp-tape-vs">
                    <div className="pvp-tape-vs-medallion">
                        {isResult ? (
                            <span className="pvp-tape-vs-result">
                                {winner === "attacker" ? "W" : winner === "defender" ? "L" : "D"}
                            </span>
                        ) : (
                            <span className="pvp-tape-vs-text">VS</span>
                        )}
                    </div>
                    <div className={`pvp-tape-odds pvp-tape-odds--${odds.tone}`}>{odds.text}</div>
                    {isBeltFight && <div className="pvp-tape-belt-tag">BELT</div>}
                    {isResult && isUpset && <div className="pvp-tape-upset">UPSET</div>}
                </div>

                <FighterColumn
                    fighter={defender}
                    side="right"
                    crowned={isResult && winner === "defender"}
                    dimmed={isResult && winner === "attacker"}
                />
            </div>

            {isResult && health && (
                <div className="pvp-tape-aftermath">
                    <div className="pvp-tape-aftermath-label">Aftermath</div>
                    <HpBar
                        label={attacker?.name || "You"}
                        before={health.attacker?.before}
                        after={health.attacker?.after}
                    />
                    <HpBar
                        label={defender?.name || "Opponent"}
                        before={defBefore}
                        after={defAfter}
                        suppressed={suppressDefenderHp}
                    />
                    {suppressDefenderHp && (
                        <div className="pvp-tape-hp-note">Opponent damage not recorded for this bout.</div>
                    )}
                </div>
            )}
        </div>
    );
});

export default PvpTaleOfTheTape;
