import { memo } from "react";

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

export const FighterReport = memo(function FighterReport({ report, onStartCamp, onClose }) {
    if (!report) return null;

    const styleColor = STYLE_COLORS[report.style] ?? DEFAULT_STYLE_COLOR;

    return (
        <div className="fr-overlay" role="dialog" aria-modal="true" aria-label="Fighter Report">
            <div className="fr-card">

                {/* ── Coloured header banner ── */}
                <div className="fr-banner" style={{ background: styleColor.bg }}>
                    <div className="fr-banner-top">
                        <span className="fr-banner-label">FIGHTER REPORT</span>
                        <button className="fr-close" onClick={onClose} title="Close">✕</button>
                    </div>

                    <div className="fr-identity">
                        <div className="fr-identity-name">
                            {report.name}
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

                {/* ── Body ── */}
                <div className="fr-body">

                    {/* Intel grid */}
                    <div className="fr-intel">
                        <div className="fr-intel-col">
                            <div className="fr-intel-heading fr-intel-danger">Known Strengths</div>
                            <ul className="fr-intel-list">
                                {report.knownStrengths.map((s, i) => (
                                    <li key={i} className="fr-intel-item fr-intel-item-danger">
                                        <span className="fr-arrow">→</span> {s}
                                    </li>
                                ))}
                                {report.knownStrengths.length === 0 && (
                                    <li className="fr-intel-item fr-intel-muted">No standout strengths identified</li>
                                )}
                            </ul>
                        </div>
                        <div className="fr-intel-col">
                            <div className="fr-intel-heading fr-intel-safe">Suspected Weaknesses</div>
                            <ul className="fr-intel-list">
                                {report.suspectedWeaknesses.map((w, i) => (
                                    <li key={i} className="fr-intel-item fr-intel-item-safe">
                                        <span className="fr-arrow">→</span> {w}
                                    </li>
                                ))}
                                {report.suspectedWeaknesses.length === 0 && (
                                    <li className="fr-intel-item fr-intel-muted">No clear weaknesses identified</li>
                                )}
                            </ul>
                        </div>
                    </div>

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

                    <div className="fr-actions">
                        <button className="btn btn-primary fr-start-btn" onClick={onStartCamp}>
                            Start Camp
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
});
