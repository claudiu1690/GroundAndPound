import { useState } from "react";
import { Check, Trophy } from "lucide-react";
import { SESSION_META } from "./sessionMeta";
import { t } from "@/lib/i18n";

function rankUnlockText(r) {
    if (!r.unlock) return null;
    switch (r.unlock.type) {
        case "access": return t("gym.rankUnlock.access");
        case "session": return SESSION_META[r.unlock.sessionKey]?.label ?? r.unlock.sessionKey;
        case "xpBonus": return t("gym.rankUnlock.xpBonus", { pct: r.unlock.xpBonusPct });
        case "perk": return t("gym.rankUnlock.perk");
        default: return null;
    }
}

/**
 * Sidebar panel for non-free gyms — merges the rank strip + rank-up CTA +
 * rank-maxed block (previously three separate full-width bands) into one
 * vertical ladder. Progress bars + the rank-up button live inside the
 * current step. Also lists sessions this gym doesn't teach ("Trained
 * elsewhere") — folded in here rather than a separate top-level component
 * since it shares the same "gym investment" sidebar real estate.
 */
export function GymStandingPanel({ gym, onRankUp, otherSessions }) {
    const [rankUpError, setRankUpError] = useState("");

    const currentRank = gym.progress?.rank ?? 0;
    const sortedRanks = (gym.ranks || []).slice().sort((a, b) => a.rank - b.rank);
    const next = (gym.ranks || []).find((r) => r.rank === currentRank + 1);
    const maxPerk = gym.ranks?.find((r) => r.rank === 4)?.unlock;

    if (!sortedRanks.length) return null;

    // Ceiling rank of this gym's ladder. Reaching it counts as achieved (green
    // check), not in-progress (red number) — the top step has no "next" to climb.
    const maxRank = sortedRanks[sortedRanks.length - 1].rank;
    const atMax = currentRank >= maxRank;

    return (
        <>
            <div className="gym-panel">
                <div className="gym-panel-title">{t("gym.rankStrip.label")}</div>
                <div className="ladder">
                    {sortedRanks.map((r) => {
                        const done = currentRank > r.rank || (atMax && r.rank === maxRank);
                        const current = currentRank === r.rank;
                        const showRankUpCta = current && gym.progress?.hasJoined && next && r.rank === currentRank && currentRank < 4;
                        const showMaxedNote = current && currentRank >= 4 && r.rank === currentRank;

                        return (
                            <div key={r.rank} className="lstep">
                                <div className={`ldot${done ? " done" : current ? " cur" : ""}`}>
                                    {done ? <Check size={12} /> : r.rank}
                                </div>
                                <div>
                                    <div className="lname">{r.name}</div>
                                    <div className="lunlock">{rankUnlockText(r)}</div>

                                    {showRankUpCta && (() => {
                                        const tReq = next.requirements.trainingSessions;
                                        const tDone = gym.progress.trainingSessions >= tReq;
                                        const wReq = next.requirements.relevantWins;
                                        const wDone = gym.progress.relevantWins >= wReq;
                                        const winLabel = gym.relevantWinTypes?.length === 1
                                            ? t("gym.standing.winsOf", { type: gym.relevantWinTypes[0] })
                                            : t("gym.standing.winsGeneric");
                                        const ironCost = next.requirements.ironCost || 0;
                                        const tPct = tReq > 0 ? Math.min(100, Math.round((gym.progress.trainingSessions / tReq) * 100)) : 100;
                                        const wPct = wReq > 0 ? Math.min(100, Math.round((gym.progress.relevantWins / wReq) * 100)) : 100;
                                        return (
                                            <>
                                                <div className="lreq">
                                                    <div className={`lreq-row${tDone ? " is-done" : ""}`}>
                                                        <div className="rtrack"><div className="rfill f-xp" style={{ width: `${tPct}%` }} /></div>
                                                        <span>{t("gym.standing.sessionsProgress", { done: Math.min(gym.progress.trainingSessions, tReq), req: tReq })}</span>
                                                    </div>
                                                    {wReq > 0 && (
                                                        <div className={`lreq-row${wDone ? " is-done" : ""}`}>
                                                            <div className="rtrack"><div className="rfill f-xp" style={{ width: `${wPct}%` }} /></div>
                                                            <span>{t("gym.standing.winsProgress", { done: Math.min(gym.progress.relevantWins, wReq), req: wReq, label: winLabel })}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {gym.progress?.nextRank?.canRankUp && gym.progress.nextRank.needsIron && ironCost > 0 && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="rankup-btn"
                                                            onClick={async () => {
                                                                setRankUpError("");
                                                                const res = await onRankUp(gym._id);
                                                                if (res && res.ok === false) {
                                                                    setRankUpError(res.error || "Rank up failed.");
                                                                }
                                                            }}
                                                        >
                                                            <Trophy size={12} /> {t("gym.rankUp.rankUpBtn", { cost: ironCost.toLocaleString() })}
                                                        </button>
                                                        {rankUpError && <div className="rank-up-error">{rankUpError}</div>}
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}

                                    {showMaxedNote && (
                                        <div className="lmaxed">
                                            <Trophy size={12} />
                                            <div>
                                                <div className="lmaxed-title">{t("gym.rankUp.maxTitle")}</div>
                                                {maxPerk?.perkName && (
                                                    <div className="lmaxed-perk">
                                                        <strong>{maxPerk.perkName}</strong>
                                                        {maxPerk.perkEffect ? ` — ${maxPerk.perkEffect}` : ""}
                                                        {maxPerk.badge ? ` · ${t("gym.rankUp.badgeLabel", { badge: maxPerk.badge })}` : ""}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {otherSessions.length > 0 && (
                <div className="gym-panel">
                    <div className="gym-panel-title">{t("gym.standing.elsewhereTitle")}</div>
                    <div className="elsewhere">
                        {otherSessions.map((s) => (
                            <div className="else-row" key={s.key}>
                                <span>{s.label}</span>
                                {s.gymName && <span>{s.gymName}</span>}
                            </div>
                        ))}
                    </div>
                    <div className="side-note">{t("gym.standing.elsewhereNote")}</div>
                </div>
            )}
        </>
    );
}
