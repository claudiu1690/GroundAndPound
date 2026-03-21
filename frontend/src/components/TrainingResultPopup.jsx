import { memo } from "react";

/**
 * Popup shown after a gym training session: "You did '[Session]'" and XP gained per stat.
 */
const STAT_CHIP_CLASS = {
  STR: "stat-chip-str",
  SPD: "stat-chip-spd",
  LEG: "stat-chip-leg",
  WRE: "stat-chip-wre",
  GND: "stat-chip-gnd",
  SUB: "stat-chip-sub",
  CHN: "stat-chip-chn",
  FIQ: "stat-chip-fiq",
};

export const TrainingResultPopup = memo(function TrainingResultPopup({
  open,
  sessionLabel,
  xpGained,
  statLevelUps,
  onClose,
}) {
  if (!open) return null;

  const hasXp = xpGained && typeof xpGained === "object" && Object.keys(xpGained).length > 0;
  const entries = hasXp ? Object.entries(xpGained) : [];
  const levelUps = Array.isArray(statLevelUps) ? statLevelUps : (statLevelUps && typeof statLevelUps === "object" ? Object.keys(statLevelUps) : []);
  const hasLevelUps = levelUps.length > 0;

  return (
    <div className="training-result-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Training result">
      <div className="training-result-popup" onClick={(e) => e.stopPropagation()}>
        <h3 className="training-result-title">You did &ldquo;{sessionLabel}&rdquo;</h3>
        {hasXp ? (
          <div className="training-result-xp">
            <div className="training-result-xp-label">XP gained</div>
            <div className="training-result-xp-stats">
              {entries.map(([stat, xp]) => (
                <span key={stat} className={`stat-chip ${STAT_CHIP_CLASS[stat] ?? ""}`}>
                  {stat} +{xp}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="training-result-fallback">Session complete.</p>
        )}
        {hasLevelUps && (
          <div className="training-result-levelups">
            <div className="training-result-levelups-label">Level up!</div>
            <div className="training-result-levelups-stats">
              {levelUps.map((stat) => (
                <span key={stat} className={`stat-chip ${STAT_CHIP_CLASS[stat] ?? ""} training-result-levelup-chip`}>
                  {stat} ↑
                </span>
              ))}
            </div>
          </div>
        )}
        <button type="button" className="btn btn-primary btn-sm training-result-close" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
});
