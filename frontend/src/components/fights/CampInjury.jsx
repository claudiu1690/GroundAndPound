import { memo } from "react";
import { CAMP_INJURY_LABELS, getRatingConfig, modifierToGradeLabel } from "../../constants/campConfig";

export const CampInjury = memo(function CampInjury({
    injuryType,
    slotsRemaining,
    previewRating,
    onStop,
    onPushThrough,
}) {
    const injuryLabel = CAMP_INJURY_LABELS[injuryType] ?? injuryType ?? "Unknown injury";
    const currentGrade = previewRating?.grade ?? "D";
    const currentModifier = previewRating?.campModifier ?? 0;
    const ratingCfg = getRatingConfig(currentGrade);

    // Grade bracket drop labels for the STOP option
    const gradeDropLabels = { S: "A", A: "B", B: "C", C: "D", D: "F", F: "F" };
    const stoppedGrade = gradeDropLabels[currentGrade] ?? "F";
    const stoppedRatingCfg = getRatingConfig(stoppedGrade);

    // Approx modifier for stopped grade
    const gradeModifiers = { S: 0.40, A: 0.30, B: 0.20, C: 0.10, D: 0.00, F: -0.10 };
    const stoppedModifier = gradeModifiers[stoppedGrade] ?? -0.10;

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
                        <li>
                            Total fight modifier:{" "}
                            <strong>{modifierToGradeLabel(stoppedModifier)}</strong>
                        </li>
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
                        <li>
                            Total fight modifier if camp maintained:{" "}
                            <strong>{modifierToGradeLabel(currentModifier)}</strong>
                        </li>
                    </ul>
                    <button className="btn btn-danger" onClick={onPushThrough}>
                        Push Through
                    </button>
                </div>
            </div>
        </div>
    );
});
