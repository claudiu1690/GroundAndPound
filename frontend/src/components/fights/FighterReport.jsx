import { memo } from "react";
import { RELIABILITY_LABELS, RELIABILITY_COLORS } from "../../constants/campConfig";

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

function ReliabilityTag({ tier }) {
    const label = RELIABILITY_LABELS[tier] ?? tier;
    const color = RELIABILITY_COLORS[tier] ?? "#94a3b8";
    return (
        <span
            className="fr-reliability-tag"
            style={{
                color,
                background: `${color}22`,
                border: `1px solid ${color}55`,
            }}
        >
            {label}
        </span>
    );
}

function IntelSection({ title, items, colorClass, emptyText }) {
    if (!items || items.length === 0) {
        return (
            <div className="fr-intel-section">
                <div className={`fr-intel-heading ${colorClass}`}>{title}</div>
                <div className="fr-intel-item fr-intel-muted">{emptyText}</div>
            </div>
        );
    }
    return (
        <div className="fr-intel-section">
            <div className={`fr-intel-heading ${colorClass}`}>{title}</div>
            <ul className="fr-intel-list">
                {items.map((item, i) => (
                    <li key={i} className={`fr-intel-item ${colorClass}-item`}>
                        <span className="fr-arrow">&rarr;</span>
                        <span className="fr-intel-text">{item.label}</span>
                        <ReliabilityTag tier={item.reliability} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

export const FighterReport = memo(function FighterReport({ report, onStartCamp, onClose, hideStartButton, isTitleFight }) {
    if (!report) return null;

    const styleColor = STYLE_COLORS[report.style] ?? DEFAULT_STYLE_COLOR;
    const bannerBg = isTitleFight ? "#2a1f0a" : styleColor.bg;

    return (
        <div className="fr-overlay" role="dialog" aria-modal="true" aria-label="Fighter Report">
            <div className={`fr-card${isTitleFight ? " fr-card--title" : ""}`}>

                {/* Coloured header banner */}
                <div className="fr-banner" style={{ background: bannerBg }}>
                    <div className="fr-banner-top">
                        <span className="fr-banner-label">{isTitleFight ? "CHAMPIONSHIP BOUT \u2014 FIGHTER REPORT" : "FIGHTER REPORT"}</span>
                        <button className="fr-close" onClick={onClose} title="Close">&times;</button>
                    </div>

                    <div className="fr-identity">
                        <div className="fr-identity-name">
                            {report.name}
                            {isTitleFight && <span className="fr-champ-tag">CHAMPION</span>}
                        </div>
                        {report.nickname && (
                            <div className="fr-identity-nickname">&ldquo;{report.nickname}&rdquo;</div>
                        )}
                        <div className="fr-identity-meta">
                            <span
                                className="fr-style-pill"
                                style={{ background: "rgba(255,255,255,.12)", color: styleColor.label }}
                            >
                                {report.style}
                            </span>
                            <span className="fr-record-pill">{report.record}</span>
                            <span className="fr-ovr-pill">OVR {report.overallRating}</span>
                        </div>
                        {report.recordDetail && (
                            <div className="fr-record-detail">{report.recordDetail}</div>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="fr-body">

                    {/* Intel sections with reliability tiers */}
                    <div className="fr-intel-grid">
                        <IntelSection
                            title="Confirmed Strengths"
                            items={report.confirmedStrengths}
                            colorClass="fr-intel-danger"
                            emptyText="No confirmed strengths identified"
                        />
                        <IntelSection
                            title="Suspected Weaknesses"
                            items={report.suspectedWeaknesses}
                            colorClass="fr-intel-safe"
                            emptyText="No suspected weaknesses identified"
                        />
                    </div>

                    {(report.unverifiedAreas?.length > 0 || report.unknownAreas?.length > 0) && (
                        <div className="fr-intel-grid fr-intel-grid-secondary">
                            {report.unverifiedAreas?.length > 0 && (
                                <IntelSection
                                    title="Unverified"
                                    items={report.unverifiedAreas}
                                    colorClass="fr-intel-neutral"
                                    emptyText=""
                                />
                            )}
                            {report.unknownAreas?.length > 0 && (
                                <IntelSection
                                    title="Unknown"
                                    items={report.unknownAreas}
                                    colorClass="fr-intel-unknown"
                                    emptyText=""
                                />
                            )}
                        </div>
                    )}

                    {/* Tendency + warning */}
                    <div className="fr-tendency">
                        <div className="fr-tendency-row">
                            <span className="fr-tendency-label">Tendency:</span>
                            <span className="fr-tendency-text">{report.tendency}</span>
                        </div>
                        <div className="fr-tendency-row fr-warning-row">
                            <span className="fr-tendency-label fr-warning-label">Warning:</span>
                            <span className="fr-warning-text">{report.warning}</span>
                        </div>
                    </div>

                </div>

                {!hideStartButton && (
                    <div className="fr-actions">
                        <button className="btn btn-primary fr-start-btn" onClick={onStartCamp}>
                            Start Camp
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
});
