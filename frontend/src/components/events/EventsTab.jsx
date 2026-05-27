import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { CardResultOverlay } from "./CardResultOverlay";
import { PredictionPickerModal } from "./PredictionPickerModal";

const SLOT_LABEL = {
    PRELIM: "Prelim",
    MAIN: "Main Card",
    HEADLINER: "Headliner",
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

export function EventsTab({ fighter, onMessage, onRefreshFighter, onLocalIronDelta }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pickerFight, setPickerFight] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [overlayDismissed, setOverlayDismissed] = useState(false);

    const fighterId = fighter?._id;
    const playerIron = fighter?.iron ?? 0;

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

    const submitBet = useCallback(async (fightIndex, betType, pickedSide, pickedMethod, stake) => {
        if (!data?.current?.id) return;
        setSubmitting(true);
        try {
            const res = await api.submitCardPrediction(data.current.id, {
                fighterId,
                fightIndex,
                betType,
                pickedSide,
                pickedMethod: betType === "EXACT" && pickedSide !== "DRAW" ? pickedMethod : null,
                stake,
            });
            onMessage?.(`Bet locked — ${stake} iron staked.`);
            setPickerFight(null);

            // Local state patch — no full reload. The whole app would re-render if we
            // called load() (replaces data, predictionsByIndex, history) AND
            // onRefreshFighter (replaces the fighter object everywhere it's read).
            // Instead we splice the new prediction into the existing card data and
            // ask the parent to decrement iron in-place via setFighter.
            const newPrediction = res?.prediction;
            if (newPrediction) {
                setData((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        myPredictions: [...(prev.myPredictions || []), newPrediction],
                    };
                });
            }
            if (onLocalIronDelta) onLocalIronDelta(-stake);
        } catch (e) {
            onMessage?.(e.message || "Could not place bet");
        }
        setSubmitting(false);
    }, [data, fighterId, onMessage, onLocalIronDelta]);

    const summaryStats = useMemo(() => {
        const h = data?.history || [];
        const won = h.filter((p) => p.resolution?.won).length;
        const totalStake = h.reduce((s, p) => s + (p.stake || 0), 0);
        const totalNet   = h.reduce((s, p) => s + (p.resolution?.netDelta || 0), 0);
        return { won, total: h.length, totalStake, totalNet };
    }, [data]);

    if (loading || !data) {
        return (
            <section className="events-tab">
                <div className="events-loading">Loading fight card…</div>
            </section>
        );
    }

    const { current, justResolved, myPredictions, history, betLimits } = data;
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

    // ── Bet potential — sum across all locked bets ───────────
    const potential = (() => {
        let staked = 0;
        let potentialPayout = 0;
        let lockedCount = 0, unpickedCount = 0;
        for (const f of current.fights) {
            const pred = predictionsByIndex[f.index];
            if (pred) {
                lockedCount += 1;
                staked += pred.stake || 0;
                potentialPayout += Math.round((pred.stake || 0) * (pred.lockedOdds || 1));
            } else {
                unpickedCount += 1;
            }
        }
        return {
            staked,
            potentialPayout,
            potentialProfit: potentialPayout - staked,
            lockedCount,
            unpickedCount,
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
                onSubmit={submitBet}
                submitting={submitting}
                betLimits={betLimits}
                playerIron={playerIron}
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

            {/* ── Card potential ── */}
            <PotentialBar potential={potential} />

            {/* ── Your bet history ── */}
            <section className="events-history">
                <h3>Your Bets</h3>
                <div className="events-history-stats">
                    {summaryStats.total > 0
                        ? (
                            <>
                                {summaryStats.won} / {summaryStats.total} won
                                {" · "}
                                <span className={summaryStats.totalNet >= 0 ? "events-stats-pos" : "events-stats-neg"}>
                                    {summaryStats.totalNet >= 0 ? "+" : ""}{summaryStats.totalNet.toLocaleString()} ⊗
                                </span>
                                {" net across "}
                                {summaryStats.totalStake.toLocaleString()} ⊗ staked
                            </>
                        )
                        : "No resolved bets yet."}
                </div>
                {history.length === 0 ? (
                    <div className="events-empty-hist">Your past bets will appear here after they resolve.</div>
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
    const aOdds = fight.oddsBoard?.winner?.A;
    const bOdds = fight.oddsBoard?.winner?.B;

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
                    {aOdds != null && <span className="headliner-odds">×{aOdds.toFixed(2)}</span>}
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
                    {bOdds != null && <span className="headliner-odds">×{bOdds.toFixed(2)}</span>}
                </div>
                <div className="headliner-meta">
                    <span>{b.style}</span>
                    <span>·</span>
                    <span>{recordStr(b.record)}</span>
                </div>
            </div>

            {locked ? (
                <div className="headliner-cta headliner-cta-locked">
                    LOCKED — <strong>{pickedName}</strong>
                    {prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                        <span> · {prediction.pickedMethod}</span>
                    )}
                    <span className="headliner-locked-meta">
                        · {prediction.stake} ⊗ at ×{prediction.lockedOdds?.toFixed(2)}
                    </span>
                </div>
            ) : (
                <div className="headliner-cta">★ Click to bet on the headliner ★</div>
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
    const aOdds = fight.oddsBoard?.winner?.A;
    const bOdds = fight.oddsBoard?.winner?.B;

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
                        {aOdds != null && <span className="compact-card-odds">×{aOdds.toFixed(2)}</span>}
                    </div>
                </div>
                <div className="compact-card-vs">VS</div>
                <div className="compact-card-fighter compact-card-fighter-right">
                    <div className="compact-card-name">{b.name}</div>
                    <div className="compact-card-meta">
                        <span>OVR {b.overallRating}</span>
                        {bOdds != null && <span className="compact-card-odds">×{bOdds.toFixed(2)}</span>}
                    </div>
                </div>
            </div>

            {locked ? (
                <div className="compact-card-locked-bar">
                    <strong>{pickedName}</strong>
                    {prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                        <span> · {prediction.pickedMethod}</span>
                    )}
                    <span className="compact-card-locked-stake">
                        {prediction.stake} ⊗ at ×{prediction.lockedOdds?.toFixed(2)}
                    </span>
                </div>
            ) : (
                <div className="compact-card-cta">Click to place a bet →</div>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// Potential bar — total stake / payout from the current locked bets
// ─────────────────────────────────────────────────────────────

function PotentialBar({ potential }) {
    const {
        staked, potentialPayout, potentialProfit,
        lockedCount, unpickedCount, total,
    } = potential;

    const hasLocked = lockedCount > 0;

    return (
        <section className="potential-bar" data-tut="event-potential">
            <header className="potential-header">
                <span className="potential-title">Card Bets</span>
                <span className="potential-progress">
                    {lockedCount} / {total} locked
                </span>
            </header>

            {!hasLocked && (
                <div className="potential-empty">
                    No bets placed yet — click a fight to place one.
                </div>
            )}

            {hasLocked && (
                <div className="potential-rows">
                    <div className="potential-row">
                        <span className="potential-row-label">Total staked</span>
                        <span className="potential-row-value">⊗ {staked.toLocaleString()}</span>
                    </div>
                    <div className="potential-row potential-row-best">
                        <span className="potential-row-label">If all bets land</span>
                        <span className="potential-row-value pos">
                            ⊗ {potentialPayout.toLocaleString()}
                            <span className="potential-row-aside">+{potentialProfit.toLocaleString()} profit</span>
                        </span>
                    </div>
                    <div className="potential-row potential-row-worst">
                        <span className="potential-row-label">If all bets lose</span>
                        <span className="potential-row-value neg">
                            −⊗ {staked.toLocaleString()}
                        </span>
                    </div>
                </div>
            )}

            {unpickedCount > 0 && (
                <div className="potential-unpicked">
                    {unpickedCount} fight{unpickedCount === 1 ? "" : "s"} still open.
                </div>
            )}
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Just-resolved summary banner (after overlay dismissal)
// ─────────────────────────────────────────────────────────────

function JustResolvedSummary({ card, predictions }) {
    const won = predictions.filter((p) => p.resolution?.won).length;
    const totalNet = predictions.reduce((s, p) => s + (p.resolution?.netDelta || 0), 0);
    return (
        <div className="events-just-resolved">
            <span className="events-just-label">Last Card:</span>
            <span className="events-just-result">
                Fight Night #{card.cardNumber} — {won}/{predictions.length} bets won
                <span className={totalNet >= 0 ? "events-just-positive" : "events-just-negative"}>
                    {" · "}{totalNet >= 0 ? `+${totalNet.toLocaleString()}` : totalNet.toLocaleString()} ⊗ net
                </span>
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
    const tone = r.won ? "pos" : "neg";
    return (
        <li className={`events-history-row events-history-${tone}`}>
            <div className="events-history-col">
                <div className="events-history-pick">
                    <span className={`events-history-slot events-history-slot-${(prediction.fightSlot || "").toLowerCase()}`}>
                        {SLOT_LABEL[prediction.fightSlot] || prediction.fightSlot}
                    </span>
                    <span className="events-history-bet-type">
                        {prediction.betType === "EXACT" ? "Exact" : "Winner"}
                    </span>
                    {" "}<strong>{pickedWinner}</strong>
                    {prediction.betType === "EXACT" && side !== "DRAW" && prediction.pickedMethod
                        ? ` · ${prediction.pickedMethod}` : ""}
                    {" "}<span className="events-history-stake">({prediction.stake} ⊗ @ ×{prediction.lockedOdds?.toFixed(2)})</span>
                </div>
                <div className="events-history-matchup">
                    {prediction.matchup?.aName} vs {prediction.matchup?.bName}
                </div>
            </div>
            <div className="events-history-col events-history-actual">
                <div>Actual: <strong>{actualWinner}</strong>{r.actualMethod && r.actualSide !== "DRAW" ? ` · ${r.actualMethod}` : ""}</div>
            </div>
            <div className={`events-history-delta events-history-delta-${tone}`}>
                <span className="events-history-icon">{r.won ? "✓" : "✕"}</span>
                {r.won ? (
                    <span>+{(r.netDelta || 0).toLocaleString()} ⊗</span>
                ) : (
                    <span>{(r.netDelta || 0).toLocaleString()} ⊗</span>
                )}
            </div>
        </li>
    );
}
