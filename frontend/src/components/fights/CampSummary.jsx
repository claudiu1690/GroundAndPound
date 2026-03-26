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

export const CampSummary = memo(function CampSummary({ summaryData, onBeginFight, resolving }) {
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
    const bannerBg = GRADE_BANNER_BG[campRating] ?? "#2a2a2c";

    return (
        <div className="cs-overlay" role="dialog" aria-modal="true" aria-label="Camp Summary">
            <div className="cs-card">

                {/* Banner */}
                <div className="cs-banner" style={{ background: bannerBg }}>
                    <div className="cs-banner-label">PRE-FIGHT CAMP SUMMARY</div>
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

                    <div className="cs-actions">
                        <button
                            className="btn btn-primary cs-fight-btn"
                            onClick={onBeginFight}
                            disabled={resolving}
                        >
                            {resolving ? "Fight night\u2026" : "\u2694 Begin Fight"}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
});
