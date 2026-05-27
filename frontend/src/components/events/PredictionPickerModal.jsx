import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const METHOD_OPTIONS = ["KO/TKO", "Submission", "Decision"];

const SLOT_LABEL = {
    PRELIM: "Prelim",
    MAIN: "Main Card",
    HEADLINER: "Headliner",
};

function recordStr(r) {
    if (!r) return "—";
    return `${r.wins ?? 0}-${r.losses ?? 0}${r.draws ? `-${r.draws}` : ""}`;
}

/** Pull the odds value for the current selection from the card's odds board. */
function oddsForSelection(board, betType, side, method) {
    if (!board) return null;
    if (betType === "WINNER") {
        return board.winner?.[side] ?? null;
    }
    if (side === "DRAW") return board.exact?.DRAW?.Draw ?? null;
    return board.exact?.[side]?.[method] ?? null;
}

/**
 * Bet picker modal. Two bet types — WINNER (just pick a side) and EXACT (pick
 * side + method). Player enters a stake in iron; we lock the decimal odds
 * shown at submit time. Payout on a win = stake × locked odds; loss = stake
 * gone. No fame involved.
 */
export function PredictionPickerModal({
    open,
    fight,
    onClose,
    onSubmit,             // (fightIndex, betType, pickedSide, pickedMethod, stake) => void
    submitting,
    betLimits,            // { min, max } — required to bound the stake input
    playerIron = 0,
}) {
    const [betType, setBetType] = useState("WINNER");
    const [pickedSide, setPickedSide] = useState(null);
    const [pickedMethod, setPickedMethod] = useState(null);
    const [stakeInput, setStakeInput] = useState("");

    const limits = betLimits || { min: 50, max: 1000 };
    // The max the player can actually wager — the lower of their balance and the tier cap.
    const effectiveMax = Math.min(limits.max, playerIron);

    // Reset internal state whenever a new fight is selected.
    useEffect(() => {
        if (!open) return;
        setBetType("WINNER");
        setPickedSide(null);
        setPickedMethod(null);
        setStakeInput(String(limits.min));
    }, [open, fight?.id, limits.min]);

    // Close on Escape.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const stakeNum = parseInt(stakeInput, 10);
    const stakeValid =
        Number.isFinite(stakeNum) && Number.isInteger(stakeNum) &&
        stakeNum >= limits.min && stakeNum <= limits.max && stakeNum <= playerIron;

    const currentOdds = useMemo(() => {
        if (!fight || !pickedSide) return null;
        if (betType === "EXACT" && pickedSide !== "DRAW" && !pickedMethod) return null;
        return oddsForSelection(fight.oddsBoard, betType, pickedSide, pickedMethod);
    }, [fight, betType, pickedSide, pickedMethod]);

    const potentialPayout = currentOdds && stakeValid ? Math.round(stakeNum * currentOdds) : null;
    const potentialProfit = potentialPayout != null ? potentialPayout - stakeNum : null;

    const canSubmit =
        !!pickedSide &&
        (betType === "WINNER" || pickedSide === "DRAW" || !!pickedMethod) &&
        stakeValid &&
        currentOdds != null &&
        !submitting;

    const submit = useCallback(() => {
        if (!canSubmit || !fight) return;
        onSubmit?.(fight.index, betType, pickedSide, pickedMethod, stakeNum);
    }, [canSubmit, fight, onSubmit, betType, pickedSide, pickedMethod, stakeNum]);

    if (!open || !fight) return null;
    const slotKey = fight.slot || "PRELIM";
    const aOdds = fight.oddsBoard?.winner?.A;
    const bOdds = fight.oddsBoard?.winner?.B;
    const drawOdds = fight.oddsBoard?.winner?.DRAW;

    // Stake validation message — shown subtly below the stake row when relevant.
    let stakeHint = "";
    if (playerIron < limits.min) {
        stakeHint = `You need ⊗${limits.min} to bet at this tier. Available: ⊗${playerIron}.`;
    } else if (stakeInput && !Number.isFinite(stakeNum)) {
        stakeHint = "Enter a whole number.";
    } else if (stakeNum < limits.min) {
        stakeHint = `Below the ⊗${limits.min} minimum.`;
    } else if (stakeNum > limits.max) {
        stakeHint = `Above the ⊗${limits.max} tier cap.`;
    } else if (stakeNum > playerIron) {
        stakeHint = `Only ⊗${playerIron} available.`;
    }

    const sliderMax = Math.min(limits.max, playerIron);
    const stepFor = (delta) => () => {
        const next = Math.max(limits.min, Math.min(sliderMax, (stakeNum || 0) + delta));
        setStakeInput(String(next));
    };
    const setPercent = (pct) => () => {
        const next = Math.max(limits.min, Math.round(sliderMax * pct));
        setStakeInput(String(next));
    };

    return createPortal(
        <div className="picker-modal-root" role="dialog" aria-modal="true" aria-label="Bet picker">
            <div className="picker-modal-backdrop" onClick={onClose} />
            <div className={`picker-modal-shell picker-modal-${slotKey.toLowerCase()}`}>
                {/* Compact header — slot/class + inline matchup line, no big poster. */}
                <header className="slip-header">
                    <div className="slip-header-meta">
                        <span className="slip-slot">{SLOT_LABEL[slotKey] || slotKey}</span>
                        <span className="slip-class">{fight.weightClass}</span>
                    </div>
                    <div className="slip-matchup">
                        <span className="slip-fighter slip-fighter-a">{fight.fighterA.name}</span>
                        <span className="slip-vs">vs</span>
                        <span className="slip-fighter slip-fighter-b">{fight.fighterB.name}</span>
                    </div>
                    <button type="button" className="picker-modal-close" onClick={onClose} aria-label="Close">✕</button>
                </header>

                <div className="slip-body">
                    {/* Bet-type pill switch */}
                    <div className="slip-bettype">
                        <button
                            type="button"
                            className={`slip-bettype-pill ${betType === "WINNER" ? "selected" : ""}`}
                            onClick={() => { setBetType("WINNER"); setPickedMethod(null); }}
                        >
                            Winner
                        </button>
                        <button
                            type="button"
                            className={`slip-bettype-pill ${betType === "EXACT" ? "selected" : ""}`}
                            onClick={() => setBetType("EXACT")}
                        >
                            Exact outcome
                        </button>
                    </div>

                    {/* Pick row — each fighter button shows OVR, style, record */}
                    <div className="slip-picks">
                        <button
                            type="button"
                            className={`slip-pick ${pickedSide === "A" ? "selected" : ""}`}
                            onClick={() => setPickedSide("A")}
                        >
                            <span className="slip-pick-name">{fight.fighterA.name}</span>
                            {fight.fighterA.nickname && (
                                <span className="slip-pick-nick">"{fight.fighterA.nickname}"</span>
                            )}
                            <span className="slip-pick-meta">
                                <span className="slip-pick-ovr">OVR {fight.fighterA.overallRating}</span>
                                <span className="slip-pick-dot">·</span>
                                <span>{fight.fighterA.style}</span>
                                <span className="slip-pick-dot">·</span>
                                <span>{recordStr(fight.fighterA.record)}</span>
                            </span>
                            <span className="slip-pick-odds">×{aOdds?.toFixed(2)}</span>
                        </button>

                        <button
                            type="button"
                            className={`slip-pick slip-pick-draw ${pickedSide === "DRAW" ? "selected" : ""}`}
                            onClick={() => { setPickedSide("DRAW"); setPickedMethod(null); }}
                        >
                            <span className="slip-pick-name">Draw</span>
                            <span className="slip-pick-meta slip-pick-meta-muted">no winner</span>
                            <span className="slip-pick-odds">×{drawOdds?.toFixed(2)}</span>
                        </button>

                        <button
                            type="button"
                            className={`slip-pick ${pickedSide === "B" ? "selected" : ""}`}
                            onClick={() => setPickedSide("B")}
                        >
                            <span className="slip-pick-name">{fight.fighterB.name}</span>
                            {fight.fighterB.nickname && (
                                <span className="slip-pick-nick">"{fight.fighterB.nickname}"</span>
                            )}
                            <span className="slip-pick-meta">
                                <span className="slip-pick-ovr">OVR {fight.fighterB.overallRating}</span>
                                <span className="slip-pick-dot">·</span>
                                <span>{fight.fighterB.style}</span>
                                <span className="slip-pick-dot">·</span>
                                <span>{recordStr(fight.fighterB.record)}</span>
                            </span>
                            <span className="slip-pick-odds">×{bOdds?.toFixed(2)}</span>
                        </button>
                    </div>

                    {/* Methods — collapsed unless EXACT + a real side is picked */}
                    {betType === "EXACT" && pickedSide && pickedSide !== "DRAW" && (
                        <div className="slip-methods">
                            {METHOD_OPTIONS.map((m) => {
                                const o = fight.oddsBoard?.exact?.[pickedSide]?.[m];
                                return (
                                    <button
                                        type="button"
                                        key={m}
                                        className={`slip-method ${pickedMethod === m ? "selected" : ""}`}
                                        onClick={() => setPickedMethod(m)}
                                    >
                                        <span>{m}</span>
                                        <span className="slip-method-odds">×{o?.toFixed(2)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Stake row — input + chips, single line on wide screens */}
                    <div className="slip-stake-row">
                        <div className="slip-stake-input-wrap">
                            <span className="slip-coin">⊗</span>
                            <input
                                type="number"
                                className="slip-stake-input"
                                value={stakeInput}
                                onChange={(e) => setStakeInput(e.target.value)}
                                min={limits.min}
                                max={sliderMax}
                                step="10"
                                disabled={playerIron < limits.min}
                                aria-label="Stake amount"
                            />
                        </div>
                        <div className="slip-stake-chips">
                            <button type="button" onClick={stepFor(-10)}  disabled={playerIron < limits.min}>−10</button>
                            <button type="button" onClick={stepFor(+10)}  disabled={playerIron < limits.min}>+10</button>
                            <button type="button" onClick={setPercent(0.25)} disabled={playerIron < limits.min}>25%</button>
                            <button type="button" onClick={setPercent(0.50)} disabled={playerIron < limits.min}>50%</button>
                            <button type="button" onClick={setPercent(1.00)} disabled={playerIron < limits.min}>Max</button>
                        </div>
                    </div>

                    {/* Single-line summary: stake hint OR returns/profit, never both */}
                    {stakeHint ? (
                        <div className="slip-stake-hint">{stakeHint}</div>
                    ) : currentOdds != null && potentialPayout != null ? (
                        <div className="slip-summary">
                            Wallet <strong className="slip-wallet">⊗ {playerIron.toLocaleString()}</strong>
                            <span className="slip-sep">·</span>
                            Returns <strong className="slip-returns">⊗ {potentialPayout.toLocaleString()}</strong>
                            <span className="slip-sep">·</span>
                            Profit <strong className="slip-profit">+⊗ {(potentialProfit ?? 0).toLocaleString()}</strong>
                        </div>
                    ) : (
                        <div className="slip-summary slip-summary-empty">
                            Wallet <strong className="slip-wallet">⊗ {playerIron.toLocaleString()}</strong>
                            <span className="slip-sep">·</span>
                            Pick an option to see the payout.
                        </div>
                    )}
                </div>

                <footer className="picker-modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {submitting ? "Locking…" : stakeValid ? `Place bet · ⊗ ${stakeNum.toLocaleString()}` : "Place bet"}
                    </button>
                </footer>
            </div>
        </div>
    , document.body);
}

function FighterPanel({ f, side, odds, alignRight }) {
    if (!f) return null;
    return (
        <div className={`picker-fighter ${alignRight ? "picker-fighter-right" : ""} picker-fighter-${side}`}>
            <div className="picker-fighter-name">{f.name}</div>
            {f.nickname && <div className="picker-fighter-nickname">"{f.nickname}"</div>}
            <div className="picker-fighter-meta">
                <span>OVR <strong>{f.overallRating}</strong></span>
                <span>{f.style}</span>
                <span>{recordStr(f.record)}</span>
            </div>
            {odds != null && (
                <div className="picker-fighter-odds">×{odds.toFixed(2)}</div>
            )}
        </div>
    );
}
