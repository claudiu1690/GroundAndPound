import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";

const METHOD_OPTIONS = ["KO/TKO", "Submission", "Decision"];

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
    const [submitting, setSubmitting] = useState(false);
    const [pickedSide, setPickedSide] = useState(null);       // "A" | "B" | "DRAW"
    const [pickedMethod, setPickedMethod] = useState(null);   // "KO/TKO" | "Submission" | "Decision"

    const fighterId = fighter?._id;

    const load = useCallback(async () => {
        if (!fighterId) return;
        setLoading(true);
        try {
            const res = await api.getMainEvent(fighterId);
            setData(res);
            // Prefill picks if already predicted.
            if (res.myPrediction) {
                setPickedSide(res.myPrediction.pickedSide);
                setPickedMethod(res.myPrediction.pickedMethod);
            } else {
                setPickedSide(null);
                setPickedMethod(null);
            }
        } catch (e) {
            onMessage?.(e.message || "Could not load main event");
            setData(null);
        }
        setLoading(false);
    }, [fighterId, onMessage]);

    useEffect(() => { load(); }, [load]);

    const submit = useCallback(async () => {
        if (!data?.current?.id || !pickedSide) return;
        if (pickedSide !== "DRAW" && !pickedMethod) {
            onMessage?.("Pick a method (KO/Sub/Dec).");
            return;
        }
        setSubmitting(true);
        try {
            await api.submitPrediction(data.current.id, {
                fighterId,
                pickedSide,
                pickedMethod: pickedSide === "DRAW" ? "Draw" : pickedMethod,
            });
            onMessage?.("Prediction locked in.");
            await load();
        } catch (e) {
            onMessage?.(e.message || "Could not submit prediction");
        }
        setSubmitting(false);
    }, [data, pickedSide, pickedMethod, fighterId, load, onMessage]);

    const predictRecord = useMemo(() => {
        const h = data?.history || [];
        const right = h.filter((p) => p.resolution?.correctSide).length;
        const exact = h.filter((p) => p.resolution?.correctExact).length;
        return { right, exact, total: h.length };
    }, [data]);

    if (loading || !data) {
        return (
            <section className="events-tab">
                <div className="events-loading">Loading main event…</div>
            </section>
        );
    }

    const { current, justResolved, myPrediction, history } = data;
    if (!current) {
        return (
            <section className="events-tab">
                <div className="events-empty">No main event scheduled right now. Check back soon.</div>
            </section>
        );
    }

    const { fighterA, fighterB, publicOdds, predictionCount } = current;
    const alreadyPredicted = !!myPrediction?.resolution?.resolved || !!myPrediction;

    return (
        <section className="events-tab">
            <header className="events-header">
                <h2>Main Event of the Week</h2>
                <div className="events-countdown">
                    Resolves {relativeTime(current.resolvesAt)}
                </div>
            </header>

            {justResolved && justResolved.actualOutcome?.method && (
                <JustResolvedBanner event={justResolved} myPrediction={history?.[0] && history[0].mainEventId === justResolved.id ? history[0] : null} />
            )}

            <div className="events-card">
                <div className="events-weight">{current.weightClass}</div>

                <div className="events-matchup">
                    <FighterSlot fighter={fighterA} side="A" odds={publicOdds?.A} picks={predictionCount?.A} total={predictionCount?.total} />
                    <div className="events-vs">VS</div>
                    <FighterSlot fighter={fighterB} side="B" odds={publicOdds?.B} picks={predictionCount?.B} total={predictionCount?.total} />
                </div>

                {alreadyPredicted ? (
                    <MyPredictionPanel myPrediction={myPrediction} fighterA={fighterA} fighterB={fighterB} />
                ) : (
                    <PickerPanel
                        fighterA={fighterA}
                        fighterB={fighterB}
                        pickedSide={pickedSide}
                        pickedMethod={pickedMethod}
                        setPickedSide={setPickedSide}
                        setPickedMethod={setPickedMethod}
                        onSubmit={submit}
                        submitting={submitting}
                    />
                )}

                <div className="events-rewards-hint">
                    Exact call: <strong>+300 fame · +500 ⊗</strong> &nbsp;·&nbsp;
                    Winner only: <strong>+100 fame</strong> &nbsp;·&nbsp;
                    Wrong: <strong className="neg">−50 fame</strong>
                </div>
            </div>

            <section className="events-history">
                <h3>Your Predictions</h3>
                <div className="events-history-stats">
                    {predictRecord.total > 0
                        ? `${predictRecord.right} / ${predictRecord.total} winners · ${predictRecord.exact} exact calls`
                        : "No resolved predictions yet."}
                </div>
                {history.length === 0 ? (
                    <div className="events-empty-hist">Your past predictions will appear here after they resolve.</div>
                ) : (
                    <ul className="events-history-list">
                        {history.map((p) => (
                            <HistoryRow key={p.id} prediction={p} />
                        ))}
                    </ul>
                )}
            </section>
        </section>
    );
}

function FighterSlot({ fighter, side, odds, picks, total }) {
    if (!fighter) return null;
    const pickPct = total > 0 ? Math.round((picks / total) * 100) : 0;
    return (
        <div className={`event-fighter event-fighter-${side}`}>
            <div className="event-fighter-name">{fighter.name}</div>
            {fighter.nickname && <div className="event-fighter-nickname">"{fighter.nickname}"</div>}
            <div className="event-fighter-meta">
                <span>OVR {fighter.overallRating}</span>
                <span>{fighter.style}</span>
                <span>{recordStr(fighter.record)}</span>
            </div>
            <div className="event-fighter-odds">
                <div>Public odds: <strong>{odds}%</strong></div>
                {total > 0 && <div>Players picked: {pickPct}% ({picks})</div>}
            </div>
        </div>
    );
}

function PickerPanel({ fighterA, fighterB, pickedSide, pickedMethod, setPickedSide, setPickedMethod, onSubmit, submitting }) {
    return (
        <div className="events-picker">
            <div className="events-picker-row">
                <div className="events-picker-label">Your pick</div>
                <div className="events-picker-sides">
                    <button
                        type="button"
                        className={`events-side ${pickedSide === "A" ? "selected" : ""}`}
                        onClick={() => setPickedSide("A")}
                    >
                        {fighterA.name}
                    </button>
                    <button
                        type="button"
                        className={`events-side events-side-draw ${pickedSide === "DRAW" ? "selected" : ""}`}
                        onClick={() => { setPickedSide("DRAW"); setPickedMethod(null); }}
                    >
                        Draw
                    </button>
                    <button
                        type="button"
                        className={`events-side ${pickedSide === "B" ? "selected" : ""}`}
                        onClick={() => setPickedSide("B")}
                    >
                        {fighterB.name}
                    </button>
                </div>
            </div>

            {pickedSide && pickedSide !== "DRAW" && (
                <div className="events-picker-row">
                    <div className="events-picker-label">Method</div>
                    <div className="events-picker-methods">
                        {METHOD_OPTIONS.map((m) => (
                            <button
                                type="button"
                                key={m}
                                className={`events-method ${pickedMethod === m ? "selected" : ""}`}
                                onClick={() => setPickedMethod(m)}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="events-picker-footer">
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={submitting || !pickedSide || (pickedSide !== "DRAW" && !pickedMethod)}
                    onClick={onSubmit}
                >
                    {submitting ? "Submitting…" : "Lock in prediction"}
                </button>
                <span className="events-picker-note">Picks lock until the event resolves.</span>
            </div>
        </div>
    );
}

function MyPredictionPanel({ myPrediction, fighterA, fighterB }) {
    const side = myPrediction.pickedSide;
    const winnerName = side === "A" ? fighterA.name : side === "B" ? fighterB.name : "Draw";
    return (
        <div className="events-mypick">
            <div className="events-mypick-label">Your prediction</div>
            <div className="events-mypick-line">
                <strong>{winnerName}</strong>
                {side !== "DRAW" && myPrediction.pickedMethod && (
                    <span> · {myPrediction.pickedMethod}</span>
                )}
            </div>
            <div className="events-mypick-hint">Locked. Come back when it resolves to see your payout.</div>
        </div>
    );
}

function JustResolvedBanner({ event }) {
    const winner = event.actualOutcome?.winnerSide;
    const method = event.actualOutcome?.method;
    const winnerName = winner === "A" ? event.fighterA.name
        : winner === "B" ? event.fighterB.name
        : "Draw";
    return (
        <div className="events-just-resolved">
            <span className="events-just-label">Last Event:</span>
            <span className="events-just-result">
                <strong>{winnerName}</strong>{method && winner !== "DRAW" ? ` by ${method}` : ""}
                {" — "}{event.fighterA.name} vs {event.fighterB.name}
            </span>
        </div>
    );
}

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
                    Picked <strong>{pickedWinner}</strong>
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
