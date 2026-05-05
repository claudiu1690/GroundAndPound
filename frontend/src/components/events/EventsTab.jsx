import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { CardResultOverlay } from "./CardResultOverlay";

const METHOD_OPTIONS = ["KO/TKO", "Submission", "Decision"];

const SLOT_LABEL = {
    PRELIM: "Prelim",
    MAIN: "Main Card",
    HEADLINER: "Headliner",
};

const SLOT_REWARD_HINT = {
    PRELIM: "Exact: +100 fame · +200 ⊗ · Winner only: +30 fame · Wrong: −20 fame",
    MAIN: "Exact: +200 fame · +400 ⊗ · Winner only: +75 fame · Wrong: −40 fame",
    HEADLINER: "Exact: +300 fame · +500 ⊗ · Winner only: +100 fame · Wrong: −50 fame",
};

const SEEN_CARD_KEY = (fighterId) => `gp_seen_resolved_card_${fighterId}`;

function relativeTime(d) {
    if (!d) return "";
    const target = new Date(d).getTime();
    if (!Number.isFinite(target)) return "";
    const diff = target - Date.now();
    if (diff <= 0) return "resolving…";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `in ${days}d`;
}

function recordStr(r) {
    if (!r) return "—";
    return `${r.wins ?? 0}-${r.losses ?? 0}${r.draws ? `-${r.draws}` : ""}`;
}

export function EventsTab({ fighter, onMessage, onRefreshFighter }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submittingFightId, setSubmittingFightId] = useState(null);
    const [overlayDismissed, setOverlayDismissed] = useState(false);

    const fighterId = fighter?._id;

    const load = useCallback(async () => {
        if (!fighterId) return;
        setLoading(true);
        try {
            const res = await api.getFightCard(fighterId);
            setData(res);
            setOverlayDismissed(false);
        } catch (e) {
            onMessage?.(e.message || "Could not load fight card");
            setData(null);
        }
        setLoading(false);
    }, [fighterId, onMessage]);

    useEffect(() => { load(); }, [load]);

    const submitFight = useCallback(async (fightIndex, pickedSide, pickedMethod) => {
        if (!data?.current?.id) return;
        setSubmittingFightId(fightIndex);
        try {
            await api.submitCardPrediction(data.current.id, {
                fighterId,
                fightIndex,
                pickedSide,
                pickedMethod: pickedSide === "DRAW" ? "Draw" : pickedMethod,
            });
            onMessage?.("Prediction locked.");
            await load();
        } catch (e) {
            onMessage?.(e.message || "Could not submit prediction");
        }
        setSubmittingFightId(null);
    }, [data, fighterId, load, onMessage]);

    const summaryStats = useMemo(() => {
        const h = data?.history || [];
        const right = h.filter((p) => p.resolution?.correctSide).length;
        const exact = h.filter((p) => p.resolution?.correctExact).length;
        return { right, exact, total: h.length };
    }, [data]);

    if (loading || !data) {
        return (
            <section className="events-tab">
                <div className="events-loading">Loading fight card…</div>
            </section>
        );
    }

    const { current, justResolved, myPredictions, history } = data;
    if (!current) {
        return (
            <section className="events-tab">
                <div className="events-empty">No fight card scheduled right now. Check back soon.</div>
            </section>
        );
    }

    // Build a map of predictions by fightIndex for quick lookup.
    const predictionsByIndex = (myPredictions || []).reduce((acc, p) => {
        acc[p.fightIndex] = p;
        return acc;
    }, {});

    // Decide whether to show the multi-fight reveal overlay.
    const seenKey = fighterId ? SEEN_CARD_KEY(fighterId) : null;
    const lastSeenCardId = seenKey
        ? (typeof localStorage !== "undefined" ? localStorage.getItem(seenKey) : null)
        : null;
    const justResolvedPredictions = justResolved
        ? (history || []).filter((p) => p.cardId === justResolved.id)
        : [];
    const shouldShowOverlay = !!(
        !overlayDismissed
        && justResolved
        && justResolvedPredictions.length > 0
        && lastSeenCardId !== justResolved.id
    );

    const dismissOverlay = () => {
        if (seenKey && justResolved?.id) {
            try { localStorage.setItem(seenKey, justResolved.id); } catch (_) {}
        }
        setOverlayDismissed(true);
        // Refresh fighter so the header iron/fame numbers reflect the payouts.
        if (onRefreshFighter && fighterId) onRefreshFighter(fighterId);
    };

    // Group fights by slot for layout
    const prelims    = current.fights.filter((f) => f.slot === "PRELIM");
    const mainCard   = current.fights.filter((f) => f.slot === "MAIN");
    const headliner  = current.fights.filter((f) => f.slot === "HEADLINER");

    return (
        <section className="events-tab">
            {shouldShowOverlay && (
                <CardResultOverlay
                    card={justResolved}
                    predictions={justResolvedPredictions}
                    onClose={dismissOverlay}
                />
            )}

            <header className="events-header">
                <h2>Fight Night #{current.cardNumber}</h2>
                <div className="events-countdown">
                    Resolves {relativeTime(current.resolvesAt)}
                </div>
            </header>

            {justResolved && !shouldShowOverlay && justResolved.fights?.length > 0 && (
                <JustResolvedSummary card={justResolved} predictions={justResolvedPredictions} />
            )}

            {headliner.length > 0 && (
                <CardSection
                    title="Headliner"
                    accent="headliner"
                    fights={headliner}
                    predictionsByIndex={predictionsByIndex}
                    onSubmit={submitFight}
                    submittingFightId={submittingFightId}
                />
            )}

            {mainCard.length > 0 && (
                <CardSection
                    title="Main Card"
                    accent="main"
                    fights={mainCard}
                    predictionsByIndex={predictionsByIndex}
                    onSubmit={submitFight}
                    submittingFightId={submittingFightId}
                />
            )}

            {prelims.length > 0 && (
                <CardSection
                    title="Prelims"
                    accent="prelim"
                    fights={prelims}
                    predictionsByIndex={predictionsByIndex}
                    onSubmit={submitFight}
                    submittingFightId={submittingFightId}
                />
            )}

            <section className="events-history">
                <h3>Your Predictions</h3>
                <div className="events-history-stats">
                    {summaryStats.total > 0
                        ? `${summaryStats.right} / ${summaryStats.total} winners · ${summaryStats.exact} exact calls`
                        : "No resolved predictions yet."}
                </div>
                {history.length === 0 ? (
                    <div className="events-empty-hist">Your past predictions will appear here after they resolve.</div>
                ) : (
                    <ul className="events-history-list">
                        {history.slice(0, 15).map((p) => (
                            <HistoryRow key={p.id} prediction={p} />
                        ))}
                    </ul>
                )}
            </section>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Card section (Headliner / Main Card / Prelims)
// ─────────────────────────────────────────────────────────────

function CardSection({ title, accent, fights, predictionsByIndex, onSubmit, submittingFightId }) {
    return (
        <section className={`card-section card-section-${accent}`}>
            <h3 className="card-section-title">{title}</h3>
            {fights.map((f) => (
                <FightRow
                    key={f.id}
                    fight={f}
                    prediction={predictionsByIndex[f.index] || null}
                    onSubmit={onSubmit}
                    submitting={submittingFightId === f.index}
                />
            ))}
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Per-fight row with built-in picker (collapsible)
// ─────────────────────────────────────────────────────────────

function FightRow({ fight, prediction, onSubmit, submitting }) {
    const [open, setOpen] = useState(false);
    const [pickedSide, setPickedSide] = useState(prediction?.pickedSide || null);
    const [pickedMethod, setPickedMethod] = useState(prediction?.pickedMethod || null);

    const locked = !!prediction;
    const canSubmit = pickedSide && (pickedSide === "DRAW" || pickedMethod);

    const submit = () => {
        if (!canSubmit) return;
        onSubmit(fight.index, pickedSide, pickedMethod);
    };

    const pickedName = prediction?.pickedSide === "A"
        ? fight.fighterA.name
        : prediction?.pickedSide === "B"
            ? fight.fighterB.name
            : "Draw";

    return (
        <article className={`fight-row ${locked ? "fight-row-locked" : ""}`}>
            <div className="fight-row-head">
                <div className="fight-row-meta">
                    <span className="fight-row-class">{fight.weightClass}</span>
                    <span className="fight-row-odds">
                        {fight.publicOdds?.A}% / {fight.publicOdds?.B}%
                    </span>
                </div>
                <div className="fight-row-pair">
                    <FighterChip f={fight.fighterA} />
                    <span className="fight-row-vs">vs</span>
                    <FighterChip f={fight.fighterB} alignRight />
                </div>
            </div>

            {locked ? (
                <div className="fight-row-locked-bar">
                    <span>🔒 Locked: <strong>{pickedName}</strong>{prediction.pickedSide !== "DRAW" && prediction.pickedMethod ? ` · ${prediction.pickedMethod}` : ""}</span>
                </div>
            ) : (
                <>
                    <button
                        type="button"
                        className="fight-row-toggle"
                        onClick={() => setOpen((v) => !v)}
                    >
                        {open ? "▾ Cancel" : "▸ Predict"}
                    </button>
                    {open && (
                        <div className="fight-row-picker">
                            <div className="fight-row-pick-row">
                                <button
                                    type="button"
                                    className={`fight-row-side ${pickedSide === "A" ? "selected" : ""}`}
                                    onClick={() => setPickedSide("A")}
                                >
                                    {fight.fighterA.name}
                                </button>
                                <button
                                    type="button"
                                    className={`fight-row-side fight-row-side-draw ${pickedSide === "DRAW" ? "selected" : ""}`}
                                    onClick={() => { setPickedSide("DRAW"); setPickedMethod(null); }}
                                >
                                    Draw
                                </button>
                                <button
                                    type="button"
                                    className={`fight-row-side ${pickedSide === "B" ? "selected" : ""}`}
                                    onClick={() => setPickedSide("B")}
                                >
                                    {fight.fighterB.name}
                                </button>
                            </div>

                            {pickedSide && pickedSide !== "DRAW" && (
                                <div className="fight-row-pick-row">
                                    {METHOD_OPTIONS.map((m) => (
                                        <button
                                            type="button"
                                            key={m}
                                            className={`fight-row-method ${pickedMethod === m ? "selected" : ""}`}
                                            onClick={() => setPickedMethod(m)}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="fight-row-actions">
                                <span className="fight-row-reward-hint">{SLOT_REWARD_HINT[fight.slot]}</span>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={!canSubmit || submitting}
                                    onClick={submit}
                                >
                                    {submitting ? "Locking…" : "Lock in"}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </article>
    );
}

function FighterChip({ f, alignRight }) {
    return (
        <div className={`fight-chip ${alignRight ? "fight-chip-right" : ""}`}>
            <div className="fight-chip-name">{f.name}</div>
            {f.nickname && <div className="fight-chip-nickname">"{f.nickname}"</div>}
            <div className="fight-chip-meta">
                <span>OVR {f.overallRating}</span>
                <span>{f.style}</span>
                <span>{recordStr(f.record)}</span>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Just-resolved summary (after overlay dismissal)
// ─────────────────────────────────────────────────────────────

function JustResolvedSummary({ card, predictions }) {
    const right = predictions.filter((p) => p.resolution?.correctSide).length;
    const exact = predictions.filter((p) => p.resolution?.correctExact).length;
    const totalFame = predictions.reduce((s, p) => s + (p.resolution?.fameDelta || 0), 0);
    return (
        <div className="events-just-resolved">
            <span className="events-just-label">Last Card:</span>
            <span className="events-just-result">
                Fight Night #{card.cardNumber} — {right}/{predictions.length} winners, {exact} exact
                {totalFame !== 0 && (
                    <span className={totalFame > 0 ? "events-just-positive" : "events-just-negative"}>
                        {" · "}{totalFame > 0 ? `+${totalFame}` : totalFame} fame
                    </span>
                )}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// History row (per-fight)
// ─────────────────────────────────────────────────────────────

function HistoryRow({ prediction }) {
    const r = prediction.resolution || {};
    const side = prediction.pickedSide;
    const pickedWinner = side === "A" ? prediction.matchup?.aName : side === "B" ? prediction.matchup?.bName : "Draw";
    const actualWinner = r.actualSide === "A" ? prediction.matchup?.aName : r.actualSide === "B" ? prediction.matchup?.bName : "Draw";
    const tone = r.correctExact ? "pos" : r.correctSide ? "mid" : "neg";
    const icon = r.correctExact ? "✓✓" : r.correctSide ? "✓" : "✕";
    return (
        <li className={`events-history-row events-history-${tone}`}>
            <div className="events-history-col">
                <div className="events-history-pick">
                    <span className={`events-history-slot events-history-slot-${(prediction.fightSlot || "").toLowerCase()}`}>
                        {SLOT_LABEL[prediction.fightSlot] || prediction.fightSlot}
                    </span>
                    {" "}Picked <strong>{pickedWinner}</strong>
                    {side !== "DRAW" && prediction.pickedMethod ? ` · ${prediction.pickedMethod}` : ""}
                </div>
                <div className="events-history-matchup">
                    {prediction.matchup?.aName} vs {prediction.matchup?.bName}
                </div>
            </div>
            <div className="events-history-col events-history-actual">
                <div>Actual: <strong>{actualWinner}</strong>{r.actualMethod && r.actualSide !== "DRAW" ? ` · ${r.actualMethod}` : ""}</div>
            </div>
            <div className={`events-history-delta events-history-delta-${tone}`}>
                <span className="events-history-icon">{icon}</span>
                <span>{r.fameDelta > 0 ? `+${r.fameDelta}` : r.fameDelta} fame</span>
                {r.ironDelta > 0 && <span>+{r.ironDelta} ⊗</span>}
            </div>
        </li>
    );
}
