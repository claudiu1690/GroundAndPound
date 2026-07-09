import { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";
import { PRESETS } from "./sessionMeta";
import { t } from "@/lib/i18n";

/**
 * Per-card quantity control: stepper + presets + Max + live cost line + dynamic
 * Train button. Holds its own N (clamped to [1, cardMax]). cardMax derives from
 * the energy/cost passed in each render; when energy drops post-batch we clamp
 * N down. cardMax is guaranteed >= 1 by the caller (cardMax===0 falls through to
 * the "Need {cost}E" branch instead of rendering this control).
 *
 * `onNChange` (optional) reports the clamped N back to the caller on every
 * change — used by the Sparring Ring to recompute its live injury/drop-odds
 * meters from the same batch size without duplicating the stepper.
 * `extraLiveText` (optional) is appended to the default live-cost line — used
 * by the Ring to add "· odds shown for N rounds".
 */
export function SessionTrainControl({ sessionKey, cost, energy, cardMax, busy, onTrain, onNChange, extraLiveText }) {
    const [n, setN] = useState(1);

    // Clamp N down when cardMax shrinks (e.g. energy spent by a prior batch).
    useEffect(() => {
        setN((prev) => Math.min(Math.max(1, prev), cardMax));
    }, [cardMax]);

    const safeN = Math.min(Math.max(1, n), cardMax);
    const totalCost = safeN * cost;
    const after = energy - totalCost;

    useEffect(() => {
        onNChange?.(safeN);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeN]);

    return (
        <div className="session-train-control">
            <div className="session-qty-row">
                <div className="session-stepper" role="group" aria-label={t("gym.sessions.ariaStepperGroup")}>
                    <button
                        type="button"
                        className="session-stepper-btn"
                        aria-label={t("gym.sessions.ariaOneFewer")}
                        disabled={safeN <= 1 || busy}
                        onClick={() => setN((p) => Math.max(1, Math.min(p, cardMax) - 1))}
                    >
                        <Minus size={12} />
                    </button>
                    <span className="session-stepper-n">{safeN}</span>
                    <button
                        type="button"
                        className="session-stepper-btn"
                        aria-label={t("gym.sessions.ariaOneMore")}
                        disabled={safeN >= cardMax || busy}
                        onClick={() => setN((p) => Math.min(cardMax, Math.min(p, cardMax) + 1))}
                    >
                        <Plus size={12} />
                    </button>
                </div>
                <div className="session-presets">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            className={`session-preset${safeN === preset ? " active" : ""}`}
                            disabled={preset > cardMax || busy}
                            onClick={() => setN(Math.min(preset, cardMax))}
                        >
                            {preset}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={`session-preset${safeN === cardMax ? " active" : ""}`}
                        disabled={busy}
                        onClick={() => setN(cardMax)}
                    >
                        {t("gym.sessions.maxBtn")}
                    </button>
                </div>
            </div>
            <div className="session-live-line">
                {safeN} session{safeN > 1 ? "s" : ""} · {totalCost}E · {after}E after{extraLiveText ? ` · ${extraLiveText}` : ""}
            </div>
            <button
                type="button"
                className="session-card-btn session-train-btn"
                disabled={busy}
                onClick={() => onTrain(sessionKey, safeN)}
            >
                {safeN > 1 ? t("gym.sessions.trainMultiple", { n: safeN }) : t("gym.sessions.trainSingle")}
            </button>
        </div>
    );
}
