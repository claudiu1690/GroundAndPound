import { memo } from "react";
import { CAMP_SESSIONS, getRatingConfig, modifierToGradeLabel } from "../../constants/campConfig";

const MATCH_ICON = { matched: "✓", not_a_match: "✕" };
const MATCH_CLASS = { matched: "csd-matched", not_a_match: "csd-unmatched" };

// Dark banner background per grade
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
        campModifier,
        campBreakdown = [],
        wasSkipped,
        injuryChoice,
        injuryPenalty,
    } = summaryData;

    const ratingCfg = getRatingConfig(campRating);
    const modLabel = modifierToGradeLabel(campModifier);
    const hasPenalty = injuryChoice === "PUSH_THROUGH" && injuryPenalty;
    const bannerBg = GRADE_BANNER_BG[campRating] ?? "#2a2a2c";
    const isPositive = campModifier >= 0;

    return (
        <div className="cs-overlay" role="dialog" aria-modal="true" aria-label="Camp Summary">
            <div className="cs-card">

                {/* ── Banner ── */}
                <div className="cs-banner" style={{ background: bannerBg }}>
                    <div className="cs-banner-label">PRE-FIGHT CAMP SUMMARY</div>
                    <div className="cs-banner-body">
                        {/* Big grade circle */}
                        <div className="cs-grade-circle" style={{ borderColor: ratingCfg.color, color: ratingCfg.color }}>
                            {campRating}
                        </div>
                        <div className="cs-banner-info">
                            <div className="cs-grade-name" style={{ color: ratingCfg.color }}>
                                {ratingCfg.label}
                            </div>
                            <div className="cs-modifier-row">
                                <span className="cs-modifier-label">Camp bonus:</span>
                                <span
                                    className="cs-modifier-value"
                                    style={{ color: isPositive ? "#4ade80" : "#f87171" }}
                                >
                                    {modLabel} to all stats
                                </span>
                            </div>
                            {wasSkipped && (
                                <div className="cs-skipped-tag">Camp skipped</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="cs-body">

                    {/* Session breakdown */}
                    {campBreakdown.length > 0 && (
                        <div className="cs-breakdown">
                            <div className="cs-breakdown-title">Session Breakdown</div>
                            {campBreakdown.map((item, i) => {
                                const cfg = CAMP_SESSIONS[item.sessionType];
                                return (
                                    <div key={i} className={`cs-breakdown-row ${MATCH_CLASS[item.matchStatus] ?? ""}`}>
                                        <span className="csb-icon">{MATCH_ICON[item.matchStatus] ?? "·"}</span>
                                        <span className="csb-name">{cfg?.label ?? item.sessionType}</span>
                                        <span className="csb-status">
                                            {item.matchStatus === "matched" ? "matched" : "unmatched"}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Injury penalty notice */}
                    {hasPenalty && (
                        <div className="cs-injury-penalty">
                            <span className="cs-injury-icon">⚠</span>
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
                            {resolving ? "Fight night…" : "⚔ Begin Fight"}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
});
