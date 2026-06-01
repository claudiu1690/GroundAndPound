import { memo } from "react";
import { createPortal } from "react-dom";
import {
    CAMP_SESSIONS,
    getRatingConfig,
    MATCH_STATUS_LABELS,
    MATCH_STATUS_COLORS,
} from "../../constants/campConfig";

const MATCH_ICON = {
    MATCHED: "✓",
    PARTIAL: "≈",
    UNMATCHED: "✕",
    WRONG: "⚠",
};

const WC_TONE = { easy: "safe", moderate: "moderate", aggressive: "aggressive" };

const WEIGHT_CUT_OPTIONS = [
    {
        key: "easy",
        label: "Easy Cut",
        staminaRange: "+0",
        missRisk: "0%",
        description: "No gamble — enter the fight at full stamina",
    },
    {
        key: "moderate",
        label: "Moderate Cut",
        staminaRange: "-5 to +10",
        missRisk: "5%",
        description: "Small gamble — could gain an edge or lose a little",
    },
    {
        key: "aggressive",
        label: "Aggressive Cut",
        staminaRange: "-12 to +18",
        missRisk: "20%",
        description: "High stakes — big upside, real downside",
    },
];

export const CampSummary = memo(function CampSummary({
    summaryData,
    onBeginFight,
    resolving,
    weightCut,
    onWeightCutChange,
    isTitleFight,
}) {
    if (!summaryData) return null;

    const {
        campRating,
        campBreakdown = [],
        wasSkipped,
        injuryChoice,
        injuryPenalty,
    } = summaryData;

    const ratingCfg = getRatingConfig(campRating);
    const heroColor = ratingCfg.color;
    const hasPenalty = injuryChoice === "PUSH_THROUGH" && injuryPenalty;
    const canFight = !!weightCut && !resolving;

    return createPortal(
        <div className="cs-overlay" role="dialog" aria-modal="true" aria-label="Camp Summary">
            <div className={`cs-card${isTitleFight ? " cs-card--title" : ""}`} data-tut="camp-summary">
                <div className="cs-grade-hero" style={{ "--cs-hero-color": heroColor }}>
                    <div
                        className="cs-grade-badge"
                        style={{ background: `${heroColor}1A`, borderColor: `${heroColor}59` }}
                    >
                        <div className="cs-grade-letter" style={{ color: heroColor }}>{campRating}</div>
                    </div>
                    <div className="cs-grade-text">
                        <div className="cs-grade-eyebrow">
                            {isTitleFight ? "Championship Bout" : "Pre-Fight Camp Summary"}
                        </div>
                        <div className="cs-grade-title" style={{ color: heroColor }}>{ratingCfg.label}</div>
                        <div className="cs-grade-sub">Both bonuses activate during the fight when conditions are met.</div>
                        {wasSkipped && <span className="cs-skipped-tag">Camp skipped</span>}
                    </div>
                </div>

                {campBreakdown.length > 0 && (
                    <div className="cs-section">
                        <div className="cs-section-label">Session Breakdown</div>
                        {campBreakdown.map((item, i) => {
                            const cfg = CAMP_SESSIONS[item.sessionType];
                            const statusColor = MATCH_STATUS_COLORS[item.matchStatus] ?? "#94a3b8";
                            return (
                                <div key={i} className="cs-session-row">
                                    <span
                                        className="cs-session-check"
                                        style={{ color: statusColor, borderColor: `${statusColor}55`, background: `${statusColor}1A` }}
                                    >
                                        {MATCH_ICON[item.matchStatus] ?? "·"}
                                    </span>
                                    <span className="cs-session-name">{cfg?.label ?? item.sessionType}</span>
                                    <span
                                        className="cs-matched-pill"
                                        style={{ color: statusColor, borderColor: `${statusColor}40`, background: `${statusColor}1A` }}
                                    >
                                        {MATCH_STATUS_LABELS[item.matchStatus] ?? item.matchStatus}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {hasPenalty && (
                    <div className="cs-injury-penalty">
                        <span className="cs-injury-icon">{"⚠"}</span>
                        <span>
                            Pushed through camp injury — fight penalties:{" "}
                            {Object.entries(injuryPenalty)
                                .map(([k, v]) => `${k.toUpperCase()} ${Math.round(v * 100)}%`)
                                .join(", ")}
                        </span>
                    </div>
                )}

                <div className="cs-wc-section">
                    <div className="cs-section-label">Weight Cut Strategy</div>
                    <div className="cs-wc-explanation">
                        Each cut rolls a random stamina swing when the cage door closes — bigger gambles mean bigger upside and worse crashes. Miss weight and you lose 20% of your purse.
                    </div>
                    <div className="cs-wc-grid" data-tut="weight-cut">
                        {WEIGHT_CUT_OPTIONS.map((opt) => {
                            const selected = weightCut === opt.key;
                            const tone = WC_TONE[opt.key];
                            return (
                                <button
                                    key={opt.key}
                                    type="button"
                                    className={`cs-wc-card cs-wc-card--${tone}${selected ? " cs-wc-card--selected" : ""}`}
                                    onClick={() => onWeightCutChange(opt.key)}
                                    disabled={resolving}
                                >
                                    <div className="cs-wc-card-inner">
                                        <div className="cs-wc-name">{opt.label}</div>
                                        <div className="cs-wc-stat">
                                            <div className="cs-wc-stat-label">Stamina Roll</div>
                                            <div className="cs-wc-stat-val">{opt.staminaRange}</div>
                                        </div>
                                        <div className="cs-wc-stat">
                                            <div className="cs-wc-stat-label">Miss Risk</div>
                                            <div className="cs-wc-stat-val">{opt.missRisk}</div>
                                        </div>
                                        <div className="cs-wc-divider" />
                                        <div className="cs-wc-desc">{opt.description}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="cs-modal-footer">
                    <button
                        type="button"
                        className="cs-begin-btn"
                        onClick={onBeginFight}
                        disabled={!canFight}
                    >
                        {resolving ? "Fight night…" : <>{"🔥"} Begin Fight</>}
                    </button>
                    {!weightCut && <div className="cs-wc-hint">Select a strategy to continue</div>}
                </div>
            </div>
        </div>
    , document.body);
});
