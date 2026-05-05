import { memo } from "react";

/**
 * Full-screen reveal shown the first time the player visits the Events tab after
 * their predicted main event has resolved. Dismissed via Continue → marks the
 * event as "seen" in localStorage so it doesn't re-pop on later visits.
 *
 * Renders nothing if:
 *   - no resolved event passed in,
 *   - no prediction the player owned for this event.
 */
export const PredictionResultOverlay = memo(function PredictionResultOverlay({
    event,
    prediction,
    onClose,
}) {
    if (!event || !event.actualOutcome) return null;
    if (!prediction || !prediction.resolution?.resolved) return null;

    const winnerSide = event.actualOutcome.winnerSide;
    const method = event.actualOutcome.method;
    const aName = event.fighterA?.name || "Fighter A";
    const bName = event.fighterB?.name || "Fighter B";
    const winnerName = winnerSide === "A" ? aName : winnerSide === "B" ? bName : "Draw";
    const isDraw = winnerSide === "DRAW";

    const correctSide  = !!prediction.resolution.correctSide;
    const correctExact = !!prediction.resolution.correctExact;
    const fameDelta    = prediction.resolution.fameDelta || 0;
    const ironDelta    = prediction.resolution.ironDelta || 0;

    const tone = correctExact ? "exact" : correctSide ? "winner" : "wrong";
    const verdictText = correctExact
        ? "Exact call"
        : correctSide
            ? "Winner only"
            : "Wrong call";
    const verdictIcon = correctExact ? "✓✓" : correctSide ? "✓" : "✕";

    const pickedName = prediction.pickedSide === "A" ? aName
        : prediction.pickedSide === "B" ? bName
        : "Draw";

    return (
        <div className="event-result-overlay" role="dialog" aria-modal="true" aria-label="Main event result">
            <div className={`event-result-modal event-result-${tone}`}>
                <div className="event-result-kicker">Main Event Resolved</div>
                <h2 className="event-result-headline">
                    {isDraw ? "It's a draw" : (
                        <>
                            <span className="event-result-winner">{winnerName}</span>
                            {" wins"}
                            {method && method !== "Draw" && (
                                <span className="event-result-method"> by {method}</span>
                            )}
                        </>
                    )}
                </h2>

                <div className="event-result-matchup">
                    <FighterCorner
                        fighter={event.fighterA}
                        won={winnerSide === "A"}
                        side="A"
                    />
                    <div className="event-result-vs">VS</div>
                    <FighterCorner
                        fighter={event.fighterB}
                        won={winnerSide === "B"}
                        side="B"
                    />
                </div>

                <div className="event-result-block">
                    <div className="event-result-block-label">Your Prediction</div>
                    <div className="event-result-pick">
                        <strong>{pickedName}</strong>
                        {prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                            <span> · {prediction.pickedMethod}</span>
                        )}
                    </div>
                </div>

                <div className={`event-result-verdict event-result-verdict-${tone}`}>
                    <span className="event-result-verdict-icon">{verdictIcon}</span>
                    <span>{verdictText}</span>
                </div>

                <div className="event-result-rewards">
                    {fameDelta !== 0 && (
                        <div className={fameDelta > 0 ? "event-reward event-reward-pos" : "event-reward event-reward-neg"}>
                            {fameDelta > 0 ? `+${fameDelta}` : fameDelta} fame
                        </div>
                    )}
                    {ironDelta > 0 && (
                        <div className="event-reward event-reward-pos">+{ironDelta} ⊗</div>
                    )}
                    {fameDelta === 0 && ironDelta === 0 && (
                        <div className="event-reward event-reward-neutral">No payout</div>
                    )}
                </div>

                <button type="button" className="btn btn-primary event-result-continue" onClick={onClose}>
                    Continue
                </button>
            </div>
        </div>
    );
});

function FighterCorner({ fighter, won, side }) {
    if (!fighter) return null;
    return (
        <div className={`event-corner event-corner-${side} ${won ? "event-corner-won" : "event-corner-lost"}`}>
            <div className="event-corner-name">{fighter.name}</div>
            {fighter.nickname && (
                <div className="event-corner-nickname">"{fighter.nickname}"</div>
            )}
            <div className="event-corner-meta">
                <span>OVR {fighter.overallRating}</span>
                <span>{fighter.style}</span>
            </div>
            {won && <div className="event-corner-winner-stamp">WINNER</div>}
        </div>
    );
}
