import { useCallback, useEffect, useState } from "react";

const METHOD_OPTIONS = ["KO/TKO", "Submission", "Decision"];

const SLOT_LABEL = {
    PRELIM: "Prelim",
    MAIN: "Main Card",
    HEADLINER: "Headliner",
};

const SLOT_REWARDS = {
    PRELIM:    "Exact: +100 fame · +200 ⊗  ·  Winner: +30 fame  ·  Wrong: −20 fame",
    MAIN:      "Exact: +200 fame · +400 ⊗  ·  Winner: +75 fame  ·  Wrong: −40 fame",
    HEADLINER: "Exact: +300 fame · +500 ⊗  ·  Winner: +100 fame  ·  Wrong: −50 fame",
};

function recordStr(r) {
    if (!r) return "—";
    return `${r.wins ?? 0}-${r.losses ?? 0}${r.draws ? `-${r.draws}` : ""}`;
}

/**
 * Modal that opens when a fight card is clicked. Lets the player pick winner
 * (or Draw) and method, then lock in.
 */
export function PredictionPickerModal({ open, fight, onClose, onSubmit, submitting }) {
    const [pickedSide, setPickedSide] = useState(null);
    const [pickedMethod, setPickedMethod] = useState(null);

    // Reset internal state whenever a new fight is selected.
    useEffect(() => {
        if (!open) return;
        setPickedSide(null);
        setPickedMethod(null);
    }, [open, fight?.id]);

    // Close on Escape.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const submit = useCallback(() => {
        if (!fight || !pickedSide) return;
        if (pickedSide !== "DRAW" && !pickedMethod) return;
        onSubmit?.(fight.index, pickedSide, pickedMethod);
    }, [fight, pickedSide, pickedMethod, onSubmit]);

    if (!open || !fight) return null;

    const canSubmit = !!pickedSide && (pickedSide === "DRAW" || !!pickedMethod);
    const slotKey = fight.slot || "PRELIM";

    return (
        <div className="picker-modal-root" role="dialog" aria-modal="true" aria-label="Prediction picker">
            <div className="picker-modal-backdrop" onClick={onClose} />
            <div className={`picker-modal-shell picker-modal-${slotKey.toLowerCase()}`}>
                <header className="picker-modal-header">
                    <div>
                        <div className="picker-modal-slot">{SLOT_LABEL[slotKey] || slotKey}</div>
                        <div className="picker-modal-class">{fight.weightClass}</div>
                    </div>
                    <button type="button" className="picker-modal-close" onClick={onClose} aria-label="Close">✕</button>
                </header>

                <div className="picker-modal-matchup">
                    <FighterPanel f={fight.fighterA} side="A" odds={fight.publicOdds?.A} />
                    <div className="picker-modal-vs">VS</div>
                    <FighterPanel f={fight.fighterB} side="B" odds={fight.publicOdds?.B} alignRight />
                </div>

                <div className="picker-modal-body">
                    <div className="picker-modal-row">
                        <div className="picker-modal-label">Pick winner</div>
                        <div className="picker-modal-sides">
                            <button
                                type="button"
                                className={`picker-side ${pickedSide === "A" ? "selected" : ""}`}
                                onClick={() => setPickedSide("A")}
                            >
                                {fight.fighterA.name}
                            </button>
                            <button
                                type="button"
                                className={`picker-side picker-side-draw ${pickedSide === "DRAW" ? "selected" : ""}`}
                                onClick={() => { setPickedSide("DRAW"); setPickedMethod(null); }}
                            >
                                Draw
                            </button>
                            <button
                                type="button"
                                className={`picker-side ${pickedSide === "B" ? "selected" : ""}`}
                                onClick={() => setPickedSide("B")}
                            >
                                {fight.fighterB.name}
                            </button>
                        </div>
                    </div>

                    {pickedSide && pickedSide !== "DRAW" && (
                        <div className="picker-modal-row">
                            <div className="picker-modal-label">By method</div>
                            <div className="picker-modal-methods">
                                {METHOD_OPTIONS.map((m) => (
                                    <button
                                        type="button"
                                        key={m}
                                        className={`picker-method ${pickedMethod === m ? "selected" : ""}`}
                                        onClick={() => setPickedMethod(m)}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="picker-modal-rewards">
                    {SLOT_REWARDS[slotKey]}
                </div>

                <footer className="picker-modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={submit}
                        disabled={!canSubmit || submitting}
                    >
                        {submitting ? "Locking…" : "Lock in pick"}
                    </button>
                </footer>
            </div>
        </div>
    );
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
                <div className="picker-fighter-odds">Odds: {odds}%</div>
            )}
        </div>
    );
}
