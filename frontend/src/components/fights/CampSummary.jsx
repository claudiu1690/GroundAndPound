import { memo } from "react";
import { createPortal } from "react-dom";
import {
    CAMP_SESSIONS,
    getRatingConfig,
    MATCH_STATUS_LABELS,
    MATCH_STATUS_COLORS,
} from "../../constants/campConfig";
import { BUFF_DISPLAY, buffStatTags } from "../shop/shopConstants";
import { t } from "@/lib/i18n";

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
        labelKey: "fights.campSummary.wcEasyCutLabel",
        staminaRange: "+0",
        missRisk: "0%",
        descKey: "fights.campSummary.wcEasyCutDesc",
    },
    {
        key: "moderate",
        labelKey: "fights.campSummary.wcModerateCutLabel",
        staminaRange: "-5 to +10",
        missRisk: "5%",
        descKey: "fights.campSummary.wcModerateCutDesc",
    },
    {
        key: "aggressive",
        labelKey: "fights.campSummary.wcAggressiveCutLabel",
        staminaRange: "-12 to +18",
        missRisk: "20%",
        descKey: "fights.campSummary.wcAggressiveCutDesc",
    },
];

export const CampSummary = memo(function CampSummary({
    summaryData,
    onBeginFight,
    resolving,
    weightCut,
    onWeightCutChange,
    isTitleFight,
    selectedBuffLabel,
    selectedBuffId,
}) {
    if (!summaryData) return null;

    const buffCfg = selectedBuffId ? BUFF_DISPLAY[selectedBuffId] : null;
    const buffTags = buffCfg ? buffStatTags(buffCfg) : [];
    const buffName = buffCfg?.name || selectedBuffLabel;

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
                            {isTitleFight ? t("fights.campSummary.eyebrowChampionship") : t("fights.campSummary.eyebrowPreFight")}
                        </div>
                        <div className="cs-grade-title" style={{ color: heroColor }}>{ratingCfg.label}</div>
                        <div className="cs-grade-sub">{t("fights.campSummary.subBonuses")}</div>
                        {wasSkipped && <span className="cs-skipped-tag">{t("fights.campSummary.skippedTag")}</span>}
                    </div>
                </div>

                {campBreakdown.length > 0 && (
                    <div className="cs-section">
                        <div className="cs-section-label">{t("fights.campSummary.sectionBreakdown")}</div>
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

                <div className="cs-section">
                    <div className="cs-supp-row">
                        <span className="cs-supp-label">{t("fights.campSummary.suppLabel")}</span>
                        <div className="cs-supp-right">
                            <span className={`cs-supp-val${buffName ? " cs-supp-val--active" : ""}`}>
                                {buffName || t("fights.campSummary.suppNone")}
                            </span>
                            {buffTags.length > 0 && (
                                <div className="cs-supp-tags">
                                    {buffTags.map((t, i) => (
                                        <span key={i} className={`shop-bt shop-bt-${t.slug}`}>{t.text}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {hasPenalty && (
                    <div className="cs-injury-penalty">
                        <span className="cs-injury-icon">{"⚠"}</span>
                        <span>
                            {t("fights.campSummary.injuryPenaltyLabel", { penalties: Object.entries(injuryPenalty).map(([k, v]) => `${k.toUpperCase()} ${Math.round(v * 100)}%`).join(", ") })}
                        </span>
                    </div>
                )}

                <div className="cs-wc-section">
                    <div className="cs-section-label">{t("fights.campSummary.wcSection")}</div>
                    <div className="cs-wc-explanation">
                        {t("fights.campSummary.wcExplanation")}
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
                                        <div className="cs-wc-name">{t(opt.labelKey)}</div>
                                        <div className="cs-wc-stat">
                                            <div className="cs-wc-stat-label">{t("fights.campSummary.wcStaminaRoll")}</div>
                                            <div className="cs-wc-stat-val">{opt.staminaRange}</div>
                                        </div>
                                        <div className="cs-wc-stat">
                                            <div className="cs-wc-stat-label">{t("fights.campSummary.wcMissRisk")}</div>
                                            <div className="cs-wc-stat-val">{opt.missRisk}</div>
                                        </div>
                                        <div className="cs-wc-divider" />
                                        <div className="cs-wc-desc">{t(opt.descKey)}</div>
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
                        {resolving ? t("fights.campSummary.fightNight") : <>{t("fights.campSummary.beginFight")}</>}
                    </button>
                    {!weightCut && <div className="cs-wc-hint">{t("fights.campSummary.wcHint")}</div>}
                </div>
            </div>
        </div>
    , document.body);
});
