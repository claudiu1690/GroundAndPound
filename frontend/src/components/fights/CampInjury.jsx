import { memo } from "react";
import { CAMP_INJURY_LABELS, getRatingConfig } from "../../constants/campConfig";
import { t } from "@/lib/i18n";

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
                <span className="camp-injury-title">{t("fights.campInjury.title")}</span>
            </div>
            <p className="camp-injury-desc">
                {t("fights.campInjury.desc", { injury: injuryLabel })}
                {slotsRemaining > 0 && (
                    <> {t("fights.campInjury.slotsRemaining", { n: slotsRemaining, plural: slotsRemaining > 1 ? "s" : "" })}</>
                )}
            </p>

            <div className="camp-injury-options">
                {/* STOP CAMP */}
                <div className="camp-injury-option camp-injury-stop">
                    <div className="cio-heading">{t("fights.campInjury.optionStopHeading")}</div>
                    <ul className="cio-list">
                        <li>{t("fights.campInjury.stopSlotUnused", { n: slotsRemaining, plural: slotsRemaining !== 1 ? "s" : "" })}</li>
                        <li>
                            {t("fights.campInjury.stopRatingDrop")}{" "}
                            <span style={{ color: ratingCfg.color }}>{currentGrade}</span>
                            {" → "}
                            <span style={{ color: stoppedRatingCfg.color }}>{stoppedGrade}</span>
                        </li>
                        <li>{t("fights.campInjury.stopHealthy")}</li>
                    </ul>
                    <button className="btn btn-secondary" onClick={onStop}>
                        {t("fights.campInjury.stopBtn")}
                    </button>
                </div>

                {/* PUSH THROUGH */}
                <div className="camp-injury-option camp-injury-push">
                    <div className="cio-heading">{t("fights.campInjury.optionPushHeading")}</div>
                    <ul className="cio-list">
                        <li>{t("fights.campInjury.pushCompleteSlots", { n: slotsRemaining, plural: slotsRemaining !== 1 ? "s" : "" })}</li>
                        <li>
                            {t("fights.campInjury.pushRatingMaintained")}{" "}
                            <span style={{ color: ratingCfg.color }}>{currentGrade}</span>
                        </li>
                        <li>{t("fights.campInjury.pushEnterWithInjury", { injury: injuryLabel })}</li>
                    </ul>
                    <button className="btn btn-danger" onClick={onPushThrough}>
                        {t("fights.campInjury.pushBtn")}
                    </button>
                </div>
            </div>
        </div>
    );
});
