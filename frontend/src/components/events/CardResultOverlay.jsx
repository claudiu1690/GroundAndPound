import { memo, useMemo } from "react";
import { createPortal } from "react-dom";

/**
 * Multi-fight reveal modal shown the first time the player visits the Events tab
 * after a card resolves. Headliner gets a hero treatment up top, then main card,
 * then prelims. Animated stagger gives each fight a moment.
 *
 * Now iron-only — each bet either won (paid out at locked odds) or lost (stake
 * already gone). No fame deltas.
 */
export const CardResultOverlay = memo(function CardResultOverlay({
    card,
    predictions,
    onClose,
}) {
    if (!card || !card.fights?.length) return null;
    if (!predictions?.length) return null;

    const totals = useMemo(() => {
        const won  = predictions.filter((p) => p.resolution?.won).length;
        const staked  = predictions.reduce((s, p) => s + (p.stake || 0), 0);
        const payout  = predictions.reduce((s, p) => s + (p.resolution?.payout || 0), 0);
        const netDelta = predictions.reduce((s, p) => s + (p.resolution?.netDelta || 0), 0);
        return { won, total: predictions.length, staked, payout, netDelta };
    }, [predictions]);

    const grade = (() => {
        const ratio = totals.won / Math.max(1, totals.total);
        if (totals.won === totals.total) return "Perfect Card";
        if (ratio >= 0.8) return "Sharp Night";
        if (ratio >= 0.6) return "Decent Night";
        if (ratio >= 0.4) return "Mixed Bag";
        if (ratio > 0)    return "Rough Night";
        return "Brutal";
    })();

    // Sort headliner → main → prelim regardless of original fight index order.
    const SLOT_PRIORITY = { HEADLINER: 0, MAIN: 1, PRELIM: 2 };
    const orderedFights = useMemo(() => {
        return [...card.fights]
            .map((f, idx) => ({ ...f, _origIndex: idx }))
            .sort((a, b) => (SLOT_PRIORITY[a.slot] ?? 99) - (SLOT_PRIORITY[b.slot] ?? 99));
    }, [card]);

    const headliner = orderedFights.find((f) => f.slot === "HEADLINER");
    const mainCard  = orderedFights.filter((f) => f.slot === "MAIN");
    const prelims   = orderedFights.filter((f) => f.slot === "PRELIM");

    let stagger = 0;

    return createPortal(
        <div className="card-result-overlay" role="dialog" aria-modal="true" aria-label="Card results">
            <div className="card-result-modal">
                <div className="card-result-kicker">Fight Night #{card.cardNumber} — Results</div>
                <div className="card-result-grade-row">
                    <span className="card-result-grade">{grade}</span>
                    <span className="card-result-record">{totals.won}/{totals.total} bets won</span>
                </div>

                {/* ── Headliner hero ── */}
                {headliner && (
                    <HeadlinerHero
                        fight={headliner}
                        prediction={predictions.find((p) => p.fightIndex === headliner._origIndex)}
                        delay={stagger++ * 80}
                    />
                )}

                {/* ── Main card section ── */}
                {mainCard.length > 0 && (
                    <div className="card-result-section">
                        <div className="card-result-section-title">Main Card</div>
                        {mainCard.map((f) => (
                            <CompactResultRow
                                key={f.id || f._origIndex}
                                fight={f}
                                prediction={predictions.find((p) => p.fightIndex === f._origIndex)}
                                tone="main"
                                delay={stagger++ * 80}
                            />
                        ))}
                    </div>
                )}

                {/* ── Prelim section ── */}
                {prelims.length > 0 && (
                    <div className="card-result-section">
                        <div className="card-result-section-title">Prelims</div>
                        {prelims.map((f) => (
                            <CompactResultRow
                                key={f.id || f._origIndex}
                                fight={f}
                                prediction={predictions.find((p) => p.fightIndex === f._origIndex)}
                                tone="prelim"
                                delay={stagger++ * 80}
                            />
                        ))}
                    </div>
                )}

                <div className="card-result-totals">
                    <div className="card-result-total-row">
                        <span className="card-result-total-label">Staked</span>
                        <span className="card-result-total-value">{totals.staked.toLocaleString()} ⊗</span>
                    </div>
                    <div className="card-result-total-row">
                        <span className="card-result-total-label">Paid back</span>
                        <span className="card-result-total-value pos">{totals.payout.toLocaleString()} ⊗</span>
                    </div>
                    <div className={`card-result-total-row card-result-total-row-net ${totals.netDelta >= 0 ? "pos" : "neg"}`}>
                        <span className="card-result-total-label">Net</span>
                        <span className="card-result-total-value">
                            {totals.netDelta >= 0 ? "+" : ""}{totals.netDelta.toLocaleString()} ⊗
                        </span>
                    </div>
                </div>

                <button type="button" className="btn btn-primary card-result-continue" onClick={onClose}>
                    Continue
                </button>
            </div>
        </div>
    , document.body);
});

// ─────────────────────────────────────────────────────────────
// Headliner hero block
// ─────────────────────────────────────────────────────────────

function HeadlinerHero({ fight, prediction, delay }) {
    const winnerSide = fight.actualOutcome?.winnerSide;
    const method = fight.actualOutcome?.method;
    const isDraw = winnerSide === "DRAW";
    const winner = winnerSide === "A" ? fight.fighterA : winnerSide === "B" ? fight.fighterB : null;
    const loser  = winnerSide === "A" ? fight.fighterB : winnerSide === "B" ? fight.fighterA : null;

    return (
        <div className="card-hero-result" style={{ animationDelay: `${delay}ms` }}>
            <div className="card-hero-tag">★ HEADLINER</div>
            {isDraw ? (
                <div className="card-hero-headline card-hero-draw">It's a draw</div>
            ) : (
                <div className="card-hero-headline">
                    <span className="card-hero-winner">{winner.name}</span>
                    <span className="card-hero-by"> def. </span>
                    <span className="card-hero-loser">{loser.name}</span>
                </div>
            )}
            <div className="card-hero-detail">
                <MethodChip method={method} />
                {!isDraw && (
                    <span className="card-hero-ovr">
                        OVR {winner.overallRating} <span className="muted">vs</span> {loser.overallRating}
                    </span>
                )}
            </div>

            <PredictionLine prediction={prediction} fight={fight} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Compact row for Main / Prelim
// ─────────────────────────────────────────────────────────────

function CompactResultRow({ fight, prediction, tone, delay }) {
    const winnerSide = fight.actualOutcome?.winnerSide;
    const method = fight.actualOutcome?.method;
    const isDraw = winnerSide === "DRAW";
    const winnerName = winnerSide === "A" ? fight.fighterA.name
        : winnerSide === "B" ? fight.fighterB.name
        : "Draw";

    const verdictTone = !prediction
        ? "skip"
        : prediction.resolution?.won ? "pos" : "neg";

    return (
        <div
            className={`card-compact-result card-compact-result-${tone} card-compact-result-${verdictTone}`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="card-compact-line">
                <MethodChip method={method} small />
                {isDraw ? (
                    <span className="card-compact-result-headline">Draw</span>
                ) : (
                    <span className="card-compact-result-headline">
                        <strong>{winnerName}</strong>
                        <span className="muted"> def. </span>
                        <span className="muted">
                            {winnerSide === "A" ? fight.fighterB.name : fight.fighterA.name}
                        </span>
                    </span>
                )}
                <PredictionPill prediction={prediction} />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────

function MethodChip({ method, small }) {
    if (!method) return null;
    const classes = ["card-method-chip"];
    if (small) classes.push("card-method-chip-small");
    let tone = "method-dec";
    let label = "DEC";
    if (method === "KO/TKO")        { tone = "method-ko";   label = "KO";   }
    else if (method === "Submission") { tone = "method-sub";  label = "SUB";  }
    else if (method === "Decision")   { tone = "method-dec";  label = "DEC";  }
    else if (method === "Draw")       { tone = "method-draw"; label = "DRAW"; }
    classes.push(tone);
    return <span className={classes.join(" ")}>{label}</span>;
}

function PredictionLine({ prediction, fight }) {
    if (!prediction) {
        return (
            <div className="card-hero-pick card-hero-pick-skip">
                You didn't bet on this one.
            </div>
        );
    }
    const r = prediction.resolution || {};
    const tone = r.won ? "pos" : "neg";
    const icon = r.won ? "✓" : "✕";
    const pickedName = prediction.pickedSide === "A" ? fight.fighterA.name
        : prediction.pickedSide === "B" ? fight.fighterB.name
        : "Draw";
    return (
        <div className={`card-hero-pick card-hero-pick-${tone}`}>
            <span className={`card-hero-pick-icon card-hero-pick-icon-${tone}`}>{icon}</span>
            <span className="card-hero-pick-text">
                Bet <strong>{pickedName}</strong>
                {prediction.betType === "EXACT" && prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                    <span className="muted"> · {prediction.pickedMethod}</span>
                )}
                <span className="muted"> · {prediction.stake} ⊗ at ×{prediction.lockedOdds?.toFixed(2)}</span>
            </span>
            <span className={`card-hero-pick-delta card-hero-pick-delta-${tone}`}>
                {r.won
                    ? `+${(r.netDelta || 0).toLocaleString()} ⊗`
                    : `${(r.netDelta || 0).toLocaleString()} ⊗`}
            </span>
        </div>
    );
}

function PredictionPill({ prediction }) {
    if (!prediction) {
        return <span className="card-pred-pill card-pred-pill-skip">No bet</span>;
    }
    const r = prediction.resolution || {};
    const tone = r.won ? "pos" : "neg";
    const icon = r.won ? "✓" : "✕";
    const delta = `${r.netDelta >= 0 ? "+" : ""}${(r.netDelta || 0).toLocaleString()} ⊗`;
    return (
        <span className={`card-pred-pill card-pred-pill-${tone}`}>
            <span className="card-pred-pill-icon">{icon}</span>
            {delta}
        </span>
    );
}
