import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Check, X, Coins } from "lucide-react";
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

            <div className="content">
                {/* ── Main Card ── */}
                {mainFights.length > 0 && (
                    <section className="card-section">
                        <div className="slbl">Main Card</div>
                        <div className="fight-rows">
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

                {/* ── Prelims ── */}
                {prelimFights.length > 0 && (
                    <section className="card-section">
                        <div className="slbl">Prelims</div>
                        <div className="fight-rows">
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
                <section className="card-section">
                    <div className="slbl">Card Bets</div>
                    <PotentialBar potential={potential} />
                </section>

                {/* ── Your bet history ── */}
                <section className="card-section">
                    <div className="slbl">Your Bets</div>
                    <div className="your-bets">
                        <div className="your-bets-summary">
                            {summaryStats.total > 0
                                ? (
                                    <>
                                        {summaryStats.won}/{summaryStats.total} won
                                        {" · "}
                                        <span className={summaryStats.totalNet >= 0 ? "yb-pos" : "yb-neg"}>
                                            {summaryStats.totalNet >= 0 ? "+" : ""}{summaryStats.totalNet.toLocaleString()} iron
                                        </span>
                                        {" net across "}
                                        {summaryStats.totalStake.toLocaleString()} iron staked
                                    </>
                                )
                                : "No resolved bets yet."}
                        </div>
                        {history.length === 0 ? (
                            <div className="your-bets-empty">No resolved bets yet. Your past bets will appear here after they resolve.</div>
                        ) : (
                            <div className="yb-list">
                                {history.slice(0, 15).map((p) => (
                                    <HistoryRow key={p.id} prediction={p} />
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
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
            className={`headliner ${locked ? "headliner-locked" : ""}`}
            onClick={locked ? undefined : onPick}
            disabled={locked}
        >
            <div className="headliner-inner">
                <div className="headliner-top">
                    <div className="event-eyebrow">Fight Night</div>
                    <div className="event-name">#{cardNumber} — {fight.weightClass}</div>
                    <div className="event-sub">Resolves {relativeTime(resolvesAt)}</div>
                </div>

                <div className="headliner-fighters">
                    <div className="hl-fighter">
                        <div className="hl-name">{a.name}</div>
                        {a.nickname && <div className="hl-nick">"{a.nickname}"</div>}
                        <div className="hl-meta">
                            <span className="hl-ovr">OVR {a.overallRating}</span>
                            {aOdds != null && <span className="hl-odds">×{aOdds.toFixed(2)}</span>}
                            <span className="hl-style">{a.style}</span>
                            <span className="hl-record">{recordStr(a.record)}</span>
                        </div>
                    </div>

                    <div className="hl-vs">
                        <div className="hl-vs-text">VS</div>
                        <div className="hl-division">{fight.weightClass}</div>
                    </div>

                    <div className="hl-fighter right">
                        <div className="hl-name">{b.name}</div>
                        {b.nickname && <div className="hl-nick">"{b.nickname}"</div>}
                        <div className="hl-meta">
                            <span className="hl-record">{recordStr(b.record)}</span>
                            <span className="hl-style">{b.style}</span>
                            {bOdds != null && <span className="hl-odds">×{bOdds.toFixed(2)}</span>}
                            <span className="hl-ovr">OVR {b.overallRating}</span>
                        </div>
                    </div>
                </div>

                {locked ? (
                    <div className="headliner-locked-pick">
                        <span className="hlp-tag">Locked</span>
                        <span className="hlp-name">{pickedName}</span>
                        {prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                            <span className="hlp-method">{prediction.pickedMethod}</span>
                        )}
                        <span className="hlp-stake">
                            {prediction.stake} iron at ×{prediction.lockedOdds?.toFixed(2)}
                        </span>
                    </div>
                ) : (
                    <div className="headliner-bet-btn">
                        <Star size={15} /> Click to Bet on the Headliner
                    </div>
                )}
            </div>
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
            className={`fight-row ${tone}-fight ${locked ? "fight-row-locked" : ""}`}
            onClick={locked ? undefined : onPick}
            disabled={locked}
        >
            <div className="fr-fighter">
                <div className="fr-name">{a.name}</div>
                <div className="fr-meta">
                    <span className="fr-div">{fight.weightClass}</span>
                    <span className="fr-ovr">OVR {a.overallRating}</span>
                    {aOdds != null && <span className="fr-odds">×{aOdds.toFixed(2)}</span>}
                </div>
            </div>

            <div className="fr-vs">
                <span className="fr-vs-text">VS</span>
                {!locked && <span className="fr-bet-link">Bet →</span>}
            </div>

            <div className="fr-fighter right">
                <div className="fr-name">{b.name}</div>
                <div className="fr-meta">
                    {bOdds != null && <span className="fr-odds">×{bOdds.toFixed(2)}</span>}
                    <span className="fr-ovr">OVR {b.overallRating}</span>
                </div>
            </div>

            {locked && (
                <div className="fr-locked-bar">
                    <strong>{pickedName}</strong>
                    {prediction.pickedSide !== "DRAW" && prediction.pickedMethod && (
                        <span>{prediction.pickedMethod}</span>
                    )}
                    <span className="fr-locked-stake">
                        {prediction.stake} iron at ×{prediction.lockedOdds?.toFixed(2)}
                    </span>
                </div>
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
        <section className="bets-status" data-tut="event-potential">
            <div className="bets-status-top">
                <span className="bets-status-label">Bets Locked</span>
                <span className="bets-progress">{lockedCount} / {total}</span>
            </div>

            <div className="bets-track">
                <div className="bets-fill" style={{ width: `${total ? (lockedCount / total) * 100 : 0}%` }} />
            </div>

            {hasLocked ? (
                <div className="bets-rows">
                    <div className="bets-row">
                        <span>Total staked</span>
                        <span className="bets-val"><Coins size={13} />{staked.toLocaleString()}</span>
                    </div>
                    <div className="bets-row">
                        <span>If all bets land</span>
                        <span className="bets-val pos">
                            <Coins size={13} />{potentialPayout.toLocaleString()}
                            <em>+{potentialProfit.toLocaleString()} profit</em>
                        </span>
                    </div>
                    <div className="bets-row">
                        <span>If all bets lose</span>
                        <span className="bets-val neg">−{staked.toLocaleString()}</span>
                    </div>
                </div>
            ) : (
                <div className="bets-hint">No bets placed yet — click a fight to place one.</div>
            )}

            {unpickedCount > 0 && (
                <div className="bets-hint bets-open">
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
        <div className="events-just-banner">
            <span>
                Last Card — Fight Night #{card.cardNumber} — {won}/{predictions.length} bets won
            </span>
            <span className={totalNet >= 0 ? "ej-positive" : "ej-negative"}>
                {totalNet >= 0 ? `+${totalNet.toLocaleString()}` : totalNet.toLocaleString()} iron net
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
        <div className={`yb-row yb-row-${tone}`}>
            <span className={`yb-slot yb-slot-${(prediction.fightSlot || "").toLowerCase()}`}>
                {SLOT_LABEL[prediction.fightSlot] || prediction.fightSlot}
            </span>
            <span className="yb-bet-type">
                {prediction.betType === "EXACT" ? "Exact" : "Winner"}
            </span>
            <span className="yb-pick">
                <strong>{pickedWinner}</strong>
                {prediction.betType === "EXACT" && side !== "DRAW" && prediction.pickedMethod
                    ? ` · ${prediction.pickedMethod}` : ""}
                {" "}<span className="yb-stake">({prediction.stake} iron @ ×{prediction.lockedOdds?.toFixed(2)})</span>
            </span>
            <span className="yb-matchup">
                {prediction.matchup?.aName} vs {prediction.matchup?.bName}
            </span>
            <span className="yb-actual">
                Actual: <strong>{actualWinner}</strong>{r.actualMethod && r.actualSide !== "DRAW" ? ` · ${r.actualMethod}` : ""}
            </span>
            <span className={`yb-delta yb-delta-${tone}`}>
                {r.won ? <Check size={14} /> : <X size={14} />}
                {r.won ? (
                    <span>+{(r.netDelta || 0).toLocaleString()} iron</span>
                ) : (
                    <span>{(r.netDelta || 0).toLocaleString()} iron</span>
                )}
            </span>
        </div>
    );
}
