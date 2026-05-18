import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { CardResultOverlay } from "./CardResultOverlay";
import { PredictionPickerModal } from "./PredictionPickerModal";

const SLOT_LABEL = {
    PRELIM: "Prelim",
    MAIN: "Main Card",
    HEADLINER: "Headliner",
};

/** Mirrored from consts/mainEventConfig.js — used to compute the potential bar locally. */
const REWARDS_BY_SLOT = {
    PRELIM:    { exactFame: 100, exactIron: 200, winnerFame:  30, wrongFame: -20 },
    MAIN:      { exactFame: 200, exactIron: 400, winnerFame:  75, wrongFame: -40 },
    HEADLINER: { exactFame: 300, exactIron: 500, winnerFame: 100, wrongFame: -50 },
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
    return `in ${Math.floor(hrs / 24)}d`;
}

function recordStr(r) {
    if (!r) return "—";
    return `${r.wins ?? 0}-${r.losses ?? 0}${r.draws ? `-${r.draws}` : ""}`;
}

function pickedNameFor(prediction, fight) {
    if (!prediction) return null;
    if (prediction.pickedSide === "A") return fight.fighterA.name;
    if (prediction.pickedSide === "B") return fight.fighterB.name;
    return "Draw";
}

export function EventsTab({ fighter, onMessage, onRefreshFighter }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pickerFight, setPickerFight] = useState(null);
    const [submitting, setSubmitting] = useState(false);
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

    const submitPrediction = useCallback(async (fightIndex, pickedSide, pickedMethod) => {
        if (!data?.current?.id) return;
        setSubmitting(true);
        try {
            await api.submitCardPrediction(data.current.id, {
                fighterId,
                fightIndex,
                pickedSide,
                pickedMethod: pickedSide === "DRAW" ? "Draw" : pickedMethod,
            });
            onMessage?.("Prediction locked.");
            setPickerFight(null);
            await load();
        } catch (e) {
            onMessage?.(e.message || "Could not submit prediction");
        }
        setSubmitting(false);
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

    const predictionsByIndex = (myPredictions || []).reduce((acc, p) => {
        acc[p.fightIndex] = p;
        return acc;
    }, {});

    // Reveal overlay tracking
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
        if (onRefreshFighter && fighterId) onRefreshFighter(fighterId);
    };

    const headliner = current.fights.find((f) => f.slot === "HEADLINER");
    const mainFights   = current.fights.filter((f) => f.slot === "MAIN");
    const prelimFights = current.fights.filter((f) => f.slot === "PRELIM");

    // ── Potential calculation ───────────────────────────────
    // Locked picks contribute their full exact-vs-wrong swing to the totals.
    // Unpicked fights are tallied separately so we can show "if you pick the rest, +X
    // more fame is on the table" — a nudge to actually fill out the card.
    const potential = (() => {
        let bestFame = 0, bestIron = 0, worstFame = 0;
        let unpickedExactFame = 0, unpickedExactIron = 0, unpickedWorstFame = 0;
        let lockedCount = 0, unpickedCount = 0;
        for (const f of current.fights) {
            const r = REWARDS_BY_SLOT[f.slot] || REWARDS_BY_SLOT.PRELIM;
            const pred = predictionsByIndex[f.index];
            if (pred) {
                lockedCount += 1;
                bestFame  += r.exactFame;
                bestIron  += r.exactIron;
                worstFame += r.wrongFame;
            } else {
                unpickedCount += 1;
                unpickedExactFame += r.exactFame;
                unpickedExactIron += r.exactIron;
                unpickedWorstFame += r.wrongFame;
            }
        }
        return {
            bestFame, bestIron, worstFame,
            unpickedExactFame, unpickedExactIron, unpickedWorstFame,
            lockedCount, unpickedCount,
            total: current.fights.length,
        };
    })();

    return (
        <section className="events-tab">
            {shouldShowOverlay && (
                <CardResultOverlay
                    card={justResolved}
                    predictions={justResolvedPredictions}
                    onClose={dismissOverlay}
                />
            )}

            <PredictionPickerModal
                open={!!pickerFight}
                fight={pickerFight}
                onClose={() => setPickerFight(null)}
                onSubmit={submitPrediction}
                submitting={submitting}
            />

            {justResolved && !shouldShowOverlay && justResolved.fights?.length > 0 && (
                <JustResolvedSummary card={justResolved} predictions={justResolvedPredictions} />
            )}

            {/* ── Headliner poster band ── */}
            {headliner && (
                <HeadlinerBand
                    fight={headliner}
                    cardNumber={current.cardNumber}
                    resolvesAt={current.resolvesAt}
                    prediction={predictionsByIndex[headliner.index] || null}
                    onPick={() => setPickerFight(headliner)}
                />
            )}

            {/* ── Main Card grid ── */}
            {mainFights.length > 0 && (
                <section className="card-grid-section">
                    <h3 className="card-grid-title card-grid-title-main">Main Card</h3>
                    <div className="card-grid">
                        {mainFights.map((f) => (
                            <CompactFightCard
                                key={f.id}
                                fight={f}
                                tone="main"
                                prediction={predictionsByIndex[f.index] || null}
                                onPick={() => setPickerFight(f)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* ── Prelims grid ── */}
            {prelimFights.length > 0 && (
                <section className="card-grid-section">
                    <h3 className="card-grid-title card-grid-title-prelim">Prelims</h3>
                    <div className="card-grid">
                        {prelimFights.map((f) => (
                            <CompactFightCard
                                key={f.id}
                                fight={f}
                                tone="prelim"
                                prediction={predictionsByIndex[f.index] || null}
                                onPick={() => setPickerFight(f)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* ── Potential bar ── */}
            <PotentialBar potential={potential} />

            {/* ── Your predictions history ── */}
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
// Headliner poster band
// ─────────────────────────────────────────────────────────────

function HeadlinerBand({ fight, cardNumber, resolvesAt, prediction, onPick }) {
    const a = fight.fighterA;
    const b = fight.fighterB;
    const locked = !!prediction;
    const pickedName = pickedNameFor(prediction, fight);

    return (
        <button
            type="button"
            data-tut="event-headliner"
            className={`headliner-band ${locked ? "headliner-band-locked" : ""}`}
            onClick={locked ? undefined : onPick}
            disabled={locked}
        >
            <div className="headliner-side headliner-side-a">
                <div className="headliner-name">{a.name}</div>
                {a.nickname && <div className="headliner-nickname">"{a.nickname.toUpperCase()}"</div>}
                <div className="headliner-stat-row">
                    <span className="headliner-ovr">OVR {a.overallRating}</span>
                </div>
                <div className="headliner-meta">
                    <span>{a.style}</span>
                    <span>·</span>
                    <span>{recordStr(a.record)}</span>
                </div>
            </div>

            <div className="headliner-center">
                <div className="headliner-kicker">FIGHT NIGHT</div>
                <div className="headliner-cardnum">#{cardNumber}</div>
                <div className="headliner-class">{fight.weightClass}</div>
                <div className="headliner-resolve">Resolves {relativeTime(resolvesAt)}</div>
                <div className="headliner-vs">VS</div>
            </div>

            <div className="headliner-side headliner-side-b">
                <div className="headliner-name">{b.name}</div>
                {b.nickname && <div className="headliner-nickname">"{b.nickname.toUpperCase()}"</div>}
                <div className="headliner-stat-row">
                    <span className="headliner-ovr">OVR {b.overallRating}</span>
                </div>
                <div className="headliner-meta">
                    <span>{b.style}</span>
                    <span>·</span>
                    <span>{recordStr(b.record)}</span>
                </div>
            </div>

            {locked ? (
                <div className="headliner-cta headliner-cta-locked">
                    🔒 LOCKED — <strong>{pickedName}</strong>
                    {prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                        <span> · {prediction.pickedMethod}</span>
                    )}
                </div>
            ) : (
                <div className="headliner-cta">⭐ Click to predict the headliner ⭐</div>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// Compact fight card
// ─────────────────────────────────────────────────────────────

function CompactFightCard({ fight, tone, prediction, onPick }) {
    const a = fight.fighterA;
    const b = fight.fighterB;
    const locked = !!prediction;
    const pickedName = pickedNameFor(prediction, fight);

    return (
        <button
            type="button"
            className={`compact-card compact-card-${tone} ${locked ? "compact-card-locked" : ""}`}
            onClick={locked ? undefined : onPick}
            disabled={locked}
        >
            <div className="compact-card-class">{fight.weightClass}</div>
            <div className="compact-card-pair">
                <div className="compact-card-fighter">
                    <div className="compact-card-name">{a.name}</div>
                    <div className="compact-card-meta">
                        <span>OVR {a.overallRating}</span>
                        <span>{a.style}</span>
                    </div>
                </div>
                <div className="compact-card-vs">VS</div>
                <div className="compact-card-fighter compact-card-fighter-right">
                    <div className="compact-card-name">{b.name}</div>
                    <div className="compact-card-meta">
                        <span>OVR {b.overallRating}</span>
                        <span>{b.style}</span>
                    </div>
                </div>
            </div>

            {locked ? (
                <div className="compact-card-locked-bar">
                    🔒 <strong>{pickedName}</strong>
                    {prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                        <span> · {prediction.pickedMethod}</span>
                    )}
                </div>
            ) : (
                <div className="compact-card-cta">Click to predict →</div>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// Potential bar — best/worst case from current locked picks
// ─────────────────────────────────────────────────────────────

function PotentialBar({ potential }) {
    const {
        bestFame, bestIron, worstFame,
        unpickedExactFame, unpickedExactIron,
        lockedCount, unpickedCount, total,
    } = potential;

    const hasLocked = lockedCount > 0;
    const hasUnpicked = unpickedCount > 0;

    return (
        <section className="potential-bar" data-tut="event-potential">
            <header className="potential-header">
                <span className="potential-title">Card Potential</span>
                <span className="potential-progress">
                    {lockedCount} / {total} locked
                </span>
            </header>

            {!hasLocked && (
                <div className="potential-empty">
                    No picks locked yet — start clicking fights to see your potential.
                </div>
            )}

            {hasLocked && (
                <div className="potential-rows">
                    <div className="potential-row potential-row-best">
                        <span className="potential-row-label">Best case</span>
                        <span className="potential-row-value pos">
                            +{bestFame.toLocaleString()} fame
                            {bestIron > 0 && <span className="potential-iron"> · +{bestIron.toLocaleString()} ⊗</span>}
                        </span>
                        <span className="potential-row-hint">if every pick lands exact</span>
                    </div>
                    <div className="potential-row potential-row-worst">
                        <span className="potential-row-label">Worst case</span>
                        <span className="potential-row-value neg">
                            {worstFame.toLocaleString()} fame
                        </span>
                        <span className="potential-row-hint">if every pick is wrong</span>
                    </div>
                </div>
            )}

            {hasUnpicked && (
                <div className="potential-unpicked">
                    {unpickedCount} fight{unpickedCount === 1 ? "" : "s"} still unpicked —
                    <strong> up to +{unpickedExactFame.toLocaleString()} fame</strong>
                    {unpickedExactIron > 0 && (
                        <strong> + {unpickedExactIron.toLocaleString()} ⊗</strong>
                    )}
                    {" "}more on the table.
                </div>
            )}
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Just-resolved summary banner (after overlay dismissal)
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
// History row
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
