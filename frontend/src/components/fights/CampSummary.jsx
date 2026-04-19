import { memo } from "react";
import {
    CAMP_SESSIONS,
    getRatingConfig,
    MATCH_STATUS_LABELS,
    MATCH_STATUS_COLORS,
} from "../../constants/campConfig";

const MATCH_ICON = {
    MATCHED: "\u2713",
    PARTIAL: "\u2248",
    UNMATCHED: "\u2715",
    WRONG: "\u26A0",
};

const GRADE_BANNER_BG = {
    S: "#1a2e1a",
    A: "#1a2e1a",
    B: "#1a2338",
    C: "#2a2a1a",
    D: "#2a2a2c",
    F: "#2e1a1a",
};

const WEIGHT_CUT_OPTIONS = [
    {
        key: "easy",
        label: "Easy Cut",
        staminaRange: "+0",
        missRisk: "0%",
        description: "No gamble — enter the fight at full stamina",
        color: "#4ade80",
    },
    {
        key: "moderate",
        label: "Moderate Cut",
        staminaRange: "-5 to +10",
        missRisk: "5%",
        description: "Small gamble — could gain an edge or lose a little",
        color: "#facc15",
    },
    {
        key: "aggressive",
        label: "Aggressive Cut",
        staminaRange: "-12 to +18",
        missRisk: "20%",
        description: "High stakes — big upside, real downside",
        color: "#f87171",
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
    const hasPenalty = injuryChoice === "PUSH_THROUGH" && injuryPenalty;
    const bannerBg = isTitleFight ? "#2a1f0a" : (GRADE_BANNER_BG[campRating] ?? "#2a2a2c");
    const canFight = !!weightCut && !resolving;

    return (
        <div className="cs-overlay" role="dialog" aria-modal="true" aria-label="Camp Summary">
            <div className={`cs-card${isTitleFight ? " cs-card--title" : ""}`}>

                {/* Banner */}
                <div className="cs-banner" style={{ background: bannerBg }}>
                    <div className="cs-banner-label">{isTitleFight ? "CHAMPIONSHIP BOUT" : "PRE-FIGHT CAMP SUMMARY"}</div>
                    <div className="cs-banner-body">
                        <div className="cs-grade-circle" style={{ borderColor: ratingCfg.color, color: ratingCfg.color }}>
                            {campRating}
                        </div>
                        <div className="cs-banner-info">
                            <div className="cs-grade-name" style={{ color: ratingCfg.color }}>
                                {ratingCfg.label}
                            </div>
                            <div className="cs-modifier-row">
                                <span className="cs-modifier-label" style={{ color: "#94a3b8" }}>
                                    Bonuses activate during fight when conditions are met
                                </span>
                            </div>
                            {wasSkipped && (
                                <div className="cs-skipped-tag">Camp skipped</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="cs-body">

                    {campBreakdown.length > 0 && (
                        <div className="cs-breakdown">
                            <div className="cs-breakdown-title">Session Breakdown</div>
                            {campBreakdown.map((item, i) => {
                                const cfg = CAMP_SESSIONS[item.sessionType];
                                const statusColor = MATCH_STATUS_COLORS[item.matchStatus] ?? "#94a3b8";
                                return (
                                    <div key={i} className="cs-breakdown-row">
                                        <span className="csb-icon" style={{ color: statusColor }}>
                                            {MATCH_ICON[item.matchStatus] ?? "\u00B7"}
                                        </span>
                                        <span className="csb-name">{cfg?.label ?? item.sessionType}</span>
                                        <span className="csb-status" style={{ color: statusColor }}>
                                            {MATCH_STATUS_LABELS[item.matchStatus] ?? item.matchStatus}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {hasPenalty && (
                        <div className="cs-injury-penalty">
                            <span className="cs-injury-icon">{"\u26A0"}</span>
                            <span>
                                Pushed through camp injury — fight penalties:{" "}
                                {Object.entries(injuryPenalty)
                                    .map(([k, v]) => `${k.toUpperCase()} ${Math.round(v * 100)}%`)
                                    .join(", ")}
                            </span>
                        </div>
                    )}

                    {/* Weight Cut Selector */}
                    <div className="cs-wc">
                        <div className="cs-wc-title">Weight Cut Strategy</div>
                        <div className="cs-wc-explainer">
                            <p>
                                Stamina is your cardio in the cage — it drains every round from strikes, takedowns, and scrambles.
                                Low stamina means weaker strikes, a softer chin, and a higher chance of being stopped by exhaustion.
                            </p>
                            <p>
                                Cutting weight makes you bigger than your opponent on fight night, but draining your body is a gamble.
                                Each cut rolls a random stamina bonus or penalty when the cage door closes — aggressive cuts offer the biggest rewards and the worst crashes.
                                Miss weight and you lose 20% of your purse.
                            </p>
                        </div>
                        <div className="cs-wc-grid">
                            {WEIGHT_CUT_OPTIONS.map((opt) => {
                                const selected = weightCut === opt.key;
                                return (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        className={`cs-wc-card${selected ? " cs-wc-card--selected" : ""}`}
                                        style={{
                                            borderColor: selected ? opt.color : undefined,
                                            background: selected ? `${opt.color}11` : undefined,
                                        }}
                                        onClick={() => onWeightCutChange(opt.key)}
                                        disabled={resolving}
                                    >
                                        <div className="cs-wc-label" style={{ color: selected ? opt.color : "#e2e8f0" }}>
                                            {opt.label}
                                        </div>
                                        <div className="cs-wc-stats">
                                            <span>Stamina roll: <strong>{opt.staminaRange}</strong></span>
                                            <span>Miss risk: <strong style={{ color: opt.missRisk === "0%" ? "#4ade80" : opt.color }}>{opt.missRisk}</strong></span>
                                        </div>
                                        <div className="cs-wc-desc">{opt.description}</div>
                                    </button>
                                );
                            })}
                        </div>
                        {!weightCut && (
                            <div className="cs-wc-hint">Select a weight cut strategy to continue</div>
                        )}
                    </div>

                    <div className="cs-actions">
                        <button
                            className="btn btn-primary cs-fight-btn"
                            onClick={onBeginFight}
                            disabled={!canFight}
                        >
                            {resolving ? "Fight night\u2026" : "\u2694 Begin Fight"}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
});
