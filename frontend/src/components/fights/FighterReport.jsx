import { memo } from "react";
import { createPortal } from "react-dom";
import { RELIABILITY_LABELS } from "../../constants/campConfig";
import { t } from "@/lib/i18n";

const STYLE_COLORS = {
    Wrestler:              { bg: "#1e3a5f", label: "#60a5fa" },
    "Brazilian Jiu-Jitsu": { bg: "#1a3d2e", label: "#4ade80" },
    Boxer:                 { bg: "#3d1a1a", label: "#f87171" },
    Kickboxer:             { bg: "#3d2a1a", label: "#fb923c" },
    "Muay Thai":           { bg: "#3d1a2e", label: "#f472b6" },
    Judo:                  { bg: "#2a1a3d", label: "#a78bfa" },
    Sambo:                 { bg: "#1a2e3d", label: "#38bdf8" },
    Capoeira:              { bg: "#3d3a1a", label: "#facc15" },
};

const DEFAULT_STYLE_COLOR = { bg: "#2a2a2c", label: "#94a3b8" };

function intelItemClasses(reliability, kind) {
    const badgeLabel = RELIABILITY_LABELS[reliability] ?? reliability;
    if (kind === "weakness") {
        return {
            stripeClass: reliability === "CONFIRMED" ? "fr-stripe-weak-conf" : "fr-stripe-weak-sus",
            badgeClass: "fr-badge-weak",
            badgeLabel,
        };
    }
    // strength
    return {
        stripeClass: reliability === "CONFIRMED" ? "fr-stripe-confirmed" : "fr-stripe-suspected",
        badgeClass: reliability === "CONFIRMED" ? "fr-badge-confirmed" : "fr-badge-suspected",
        badgeLabel,
    };
}

function IntelColumn({ label, labelClass, items, kind, emptyText }) {
    return (
        <div className="fr-intel-col">
            <div className={`fr-section-label ${labelClass}`}>{label}</div>
            {(!items || items.length === 0)
                ? <div className="fr-intel-empty">{emptyText}</div>
                : <div className="fr-intel-list">
                    {items.map((it, i) => {
                        const { stripeClass, badgeClass, badgeLabel } = intelItemClasses(it.reliability, kind);
                        return (
                            <div className="fr-intel-item" key={i}>
                                <span className={`fr-intel-stripe ${stripeClass}`} />
                                <div className="fr-intel-content">
                                    <span className="fr-intel-text">{it.label}</span>
                                    <span className={`fr-intel-badge ${badgeClass}`}>{badgeLabel}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>}
        </div>
    );
}

export const FighterReport = memo(function FighterReport({ report, onStartCamp, onClose, hideStartButton, isTitleFight }) {
    if (!report) return null;

    const styleColor = STYLE_COLORS[report.style] ?? DEFAULT_STYLE_COLOR;
    const isCallout = !!report.isCallout;
    const eyebrow = isTitleFight ? t("fights.report.eyebrowChampionship") : isCallout ? t("fights.report.eyebrowCallout") : t("fights.report.eyebrow");
    const unknown = report.unknownAreas ?? [];

    return createPortal(
        <div className="fr-overlay" role="dialog" aria-modal="true" aria-label="Fighter Report">
            <div className={`fr-modal${isTitleFight ? " fr-modal--title" : ""}`} data-tut="fighter-report">

                {isCallout && (
                    <div className="report-callout-banner">
                        {t("fights.report.calloutBanner")}
                    </div>
                )}

                <div className="fr-header">
                    <div className="fr-header-left">
                        <div className={`fr-eyebrow${isTitleFight ? " fr-eyebrow--gold" : ""}`}>{eyebrow}</div>
                        <div className="fr-name">
                            {report.name}
                            {isTitleFight && <span className="fr-champ-tag">{t("fights.report.champTag")}</span>}
                        </div>
                        {report.nickname && <div className="fr-nickname">&ldquo;{report.nickname}&rdquo;</div>}
                        <div className="fr-meta">
                            <span className="fr-style-pill" style={{ color: styleColor.label }}>{report.style}</span>
                            <span className="fr-record-val">{report.record}</span>
                            {report.recordDetail && <span className="fr-record-sub">{report.recordDetail}</span>}
                        </div>
                    </div>
                    <div className="fr-header-right">
                        <button className="fr-close" onClick={onClose} aria-label={t("fights.report.closeLabel")} title={t("fights.report.closeLabel")}>&times;</button>
                        <div className="fr-ovr-block">
                            <div className="fr-ovr-val">{report.overallRating}</div>
                            <div className="fr-ovr-label">{t("fights.report.overallLabel")}</div>
                        </div>
                    </div>
                </div>

                <div className="fr-body">
                    <div className="fr-section">
                        <div className="fr-intel-two-col">
                            <IntelColumn label={t("fights.report.strengthsLabel")} labelClass="fr-label-red" items={report.confirmedStrengths} kind="strength" emptyText={t("fights.report.strengthsEmpty")} />
                            <IntelColumn label={t("fights.report.weaknessesLabel")} labelClass="fr-label-green" items={report.suspectedWeaknesses} kind="weakness" emptyText={t("fights.report.weaknessesEmpty")} />
                        </div>
                    </div>

                    {unknown.length > 0 && (
                        <div className="fr-section">
                            <div className="fr-section-label fr-label-muted">{t("fights.report.unknownLabel")}</div>
                            <div className="fr-unverified-list">
                                {unknown.map((it, i) => (
                                    <div className="fr-unverified-item" key={i}>
                                        <span className="fr-unverified-icon">−</span>
                                        <span className="fr-unverified-text">{it.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="fr-section fr-section--last">
                        <div className="fr-info-rows">
                            <div className="fr-info-row">
                                <span className="fr-info-label">{t("fights.report.tendencyLabel")}</span>
                                <span className="fr-info-text">{report.tendency}</span>
                            </div>
                            <div className="fr-info-row">
                                <span className="fr-info-label fr-info-label--warn">{t("fights.report.warningLabel")}</span>
                                <span className="fr-info-text fr-info-text--warn">{report.warning}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {!hideStartButton && (
                    <div className="fr-footer">
                        <button className="fr-start-btn" onClick={onStartCamp}>{t("fights.report.startCamp")}</button>
                    </div>
                )}

            </div>
        </div>
    , document.body);
});
