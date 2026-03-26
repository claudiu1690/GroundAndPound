import { memo } from "react";
import { CAMP_INJURY_LABELS, getRatingConfig } from "../../constants/campConfig";

export const CampInjury = memo(function CampInjury({
    injuryType,
    slotsRemaining,
    previewRating,
    onStop,
    onPushThrough,
}) {
    const injuryLabel = CAMP_INJURY_LABELS[injuryType] ?? injuryType ?? "Unknown injury";
    const currentGrade = previewRating?.grade ?? "D";
    const ratingCfg = getRatingConfig(currentGrade);

    // Grade bracket drop labels for the STOP option
    const gradeDropLabels = { S: "A", A: "B", B: "C", C: "D", D: "F", F: "F" };
    const stoppedGrade = gradeDropLabels[currentGrade] ?? "F";
    const stoppedRatingCfg = getRatingConfig(stoppedGrade);

    return (
        <div className="camp-injury-banner">
            <div className="camp-injury-header">
                <span className="camp-injury-icon">⚠</span>
                <span className="camp-injury-title">Injury in Camp</span>
            </div>
            <p className="camp-injury-desc">
                You sustained a <strong>{injuryLabel}</strong> during sparring.
                {slotsRemaining > 0 && (
                    <> You have <strong>{slotsRemaining} slot{slotsRemaining > 1 ? "s" : ""} remaining</strong>.</>
                )}
            </p>

            <div className="camp-injury-options">
                {/* STOP CAMP */}
                <div className="camp-injury-option camp-injury-stop">
                    <div className="cio-heading">Option A — Stop Camp</div>
                    <ul className="cio-list">
                        <li>Remaining {slotsRemaining} slot{slotsRemaining !== 1 ? "s" : ""} unused</li>
                        <li>
                            Camp Rating drops: {" "}
                            <span style={{ color: ratingCfg.color }}>{currentGrade}</span>
                            {" → "}
                            <span style={{ color: stoppedRatingCfg.color }}>{stoppedGrade}</span>
                        </li>
                        <li>You enter the fight healthy</li>
                    </ul>
                    <button className="btn btn-secondary" onClick={onStop}>
                        Stop Camp
                    </button>
                </div>

                {/* PUSH THROUGH */}
                <div className="camp-injury-option camp-injury-push">
                    <div className="cio-heading">Option B — Push Through</div>
                    <ul className="cio-list">
                        <li>Complete remaining {slotsRemaining} slot{slotsRemaining !== 1 ? "s" : ""} as planned</li>
                        <li>
                            Camp Rating maintained at{" "}
                            <span style={{ color: ratingCfg.color }}>{currentGrade}</span>
                        </li>
                        <li>Enter fight with <strong>{injuryLabel}</strong> — stat penalties apply</li>
                    </ul>
                    <button className="btn btn-danger" onClick={onPushThrough}>
                        Push Through
                    </button>
                </div>
            </div>
        </div>
    );
});
