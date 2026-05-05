import { memo, useMemo } from "react";

/**
 * Multi-fight reveal modal shown the first time the player visits the Events tab
 * after a card resolves. Stacks every prediction the player made on the resolved
 * card with verdict + reward. Dismissed via Continue.
 */
export const CardResultOverlay = memo(function CardResultOverlay({
    card,
    predictions,
    onClose,
}) {
    if (!card || !card.fights?.length) return null;
    if (!predictions?.length) return null;

    const totals = useMemo(() => {
        const right = predictions.filter((p) => p.resolution?.correctSide).length;
        const exact = predictions.filter((p) => p.resolution?.correctExact).length;
        const fame  = predictions.reduce((s, p) => s + (p.resolution?.fameDelta || 0), 0);
        const iron  = predictions.reduce((s, p) => s + (p.resolution?.ironDelta || 0), 0);
        return { right, exact, fame, iron, total: predictions.length };
    }, [predictions]);

    // Card grade — lighthearted summary string.
    const grade = (() => {
        const ratio = totals.right / Math.max(1, totals.total);
        if (totals.exact === totals.total) return "Perfect Card";
        if (ratio >= 0.8) return "Sharp Night";
        if (ratio >= 0.6) return "Decent Night";
        if (ratio >= 0.4) return "Mixed Bag";
        if (ratio > 0)    return "Rough Night";
        return "Brutal";
    })();

    return (
        <div className="card-result-overlay" role="dialog" aria-modal="true" aria-label="Card results">
            <div className="card-result-modal">
                <div className="card-result-kicker">Fight Night #{card.cardNumber} — Results</div>
                <div className="card-result-grade-row">
                    <span className="card-result-grade">{grade}</span>
                    <span className="card-result-record">{totals.right}/{totals.total} winners · {totals.exact} exact</span>
                </div>

                <ul className="card-result-list">
                    {card.fights.map((fight, idx) => {
                        const prediction = predictions.find((p) => p.fightIndex === idx);
                        return (
                            <FightResultRow key={fight.id || idx} fight={fight} prediction={prediction} />
                        );
                    })}
                </ul>

                <div className="card-result-totals">
                    <div className={`card-result-total ${totals.fame >= 0 ? "pos" : "neg"}`}>
                        {totals.fame > 0 ? `+${totals.fame}` : totals.fame} fame
                    </div>
                    {totals.iron > 0 && (
                        <div className="card-result-total pos">+{totals.iron} ⊗</div>
                    )}
                </div>

                <button type="button" className="btn btn-primary card-result-continue" onClick={onClose}>
                    Continue
                </button>
            </div>
        </div>
    );
});

function FightResultRow({ fight, prediction }) {
    const winnerSide = fight.actualOutcome?.winnerSide;
    const method = fight.actualOutcome?.method;
    const winnerName = winnerSide === "A" ? fight.fighterA.name
        : winnerSide === "B" ? fight.fighterB.name
        : "Draw";
    const isDraw = winnerSide === "DRAW";

    if (!prediction) {
        return (
            <li className="card-result-row card-result-row-skipped">
                <div className="card-result-row-slot">{slotLabel(fight.slot)}</div>
                <div className="card-result-row-result">
                    <strong>{winnerName}</strong>
                    {!isDraw && method && <span className="card-result-row-method"> by {method}</span>}
                </div>
                <div className="card-result-row-mine">No bet</div>
                <div className="card-result-row-delta muted">—</div>
            </li>
        );
    }

    const r = prediction.resolution || {};
    const tone = r.correctExact ? "pos" : r.correctSide ? "mid" : "neg";
    const icon = r.correctExact ? "✓✓" : r.correctSide ? "✓" : "✕";
    const pickedName = prediction.pickedSide === "A" ? fight.fighterA.name
        : prediction.pickedSide === "B" ? fight.fighterB.name
        : "Draw";

    return (
        <li className={`card-result-row card-result-row-${tone}`}>
            <div className="card-result-row-slot">{slotLabel(fight.slot)}</div>
            <div className="card-result-row-result">
                <strong>{winnerName}</strong>
                {!isDraw && method && <span className="card-result-row-method"> by {method}</span>}
            </div>
            <div className="card-result-row-mine">
                <span className={`card-result-row-icon card-result-row-icon-${tone}`}>{icon}</span>
                Picked <strong>{pickedName}</strong>
                {prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                    <span> · {prediction.pickedMethod}</span>
                )}
            </div>
            <div className={`card-result-row-delta card-result-row-delta-${tone}`}>
                {r.fameDelta > 0 ? `+${r.fameDelta}` : r.fameDelta} fame
                {r.ironDelta > 0 && <span> · +{r.ironDelta} ⊗</span>}
            </div>
        </li>
    );
}

function slotLabel(slot) {
    if (slot === "HEADLINER") return "⭐ Headliner";
    if (slot === "MAIN")      return "Main Card";
    return "Prelim";
}
