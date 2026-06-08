import { memo } from "react";
import { Check, X, TrendingUp, AlertTriangle } from "lucide-react";
import { STAT_CHIP_CLASS } from "./GymTraining";

/**
 * Single post-training toast (presentational).
 *
 * View-model shape (built in App.jsx):
 *   { id, sessionName, xpGained: [{stat, amount}], levelUps: [{stat, oldValue, newValue}],
 *     injuries: [{label, round}], completed,
 *     energyRemaining, sessionsToday, maxStaminaGained, staminaCapHit,
 *     variant: "normal" | "levelup" | "injury", dismissing }
 *
 * Variant precedence: injury > levelup > normal. A toast carries exactly one
 * variant accent class. A sparring session can both level up a stat AND injure,
 * so the gold level-up rows still render under the injury variant — only the
 * border/progress accent turns red.
 */
export const TrainingToast = memo(function TrainingToast({ toast, onDismiss }) {
  const {
    id,
    sessionName,
    xpGained = [],
    levelUps = [],
    injuries = [],
    completed = 0,
    energyRemaining,
    sessionsToday = 0,
    maxStaminaGained = 0,
    staminaCapHit = false,
    variant = "normal",
    rollTier = null,
    greatCount = 0,
    booster = null,
    dismissing = false,
  } = toast;

  const isInjury = variant === "injury";
  const isLevelup = variant === "levelup";
  const isBatch = completed > 1;

  // Per-session XP RNG badge (presentational; server-resolved).
  // Single session: show great/sluggish from rollTier. Batch: show great count.
  // Sluggish counts are intentionally not surfaced for batches.
  let rollBadge = null;
  if (completed <= 1) {
    if (rollTier === "great") {
      rollBadge = <span className="train-toast-badge train-toast-badge--great">Great session!</span>;
    } else if (rollTier === "sluggish") {
      rollBadge = <span className="train-toast-badge train-toast-badge--sluggish">Sluggish</span>;
    }
  } else if (greatCount > 0) {
    rollBadge = (
      <span className="train-toast-badge train-toast-badge--great">
        {greatCount} great session{greatCount > 1 ? "s" : ""}
      </span>
    );
  }

  // XP / conditioning branch.
  const hasXp = xpGained.length > 0;
  const showStaminaChip = !hasXp && maxStaminaGained > 0;
  const showCapLabel = !hasXp && maxStaminaGained === 0;

  return (
    <div className={`train-toast${isInjury ? " train-toast--injury" : isLevelup ? " train-toast--levelup" : ""}${dismissing ? " dismissing" : ""}`}>
      {/* Top row: title + close */}
      <div className="train-toast-top">
        <div className="train-toast-title">
          <Check size={19} className="train-toast-check" />
          <span>{sessionName} Complete</span>
          {rollBadge}
        </div>
        <button
          type="button"
          className="train-toast-close"
          aria-label="Dismiss"
          onClick={() => onDismiss(id)}
        >
          <X size={18} />
        </button>
      </div>

      {/* XP / conditioning row */}
      <div className="train-toast-xp">
        <span className="train-toast-xp-label">
          {showCapLabel ? "Max Stamina at cap" : "XP gained"}
        </span>
        {hasXp &&
          xpGained.map(({ stat, amount }) => (
            <span key={stat} className={`train-toast-chip stat-chip ${STAT_CHIP_CLASS[stat] ?? ""}`}>
              {stat} +{amount}
            </span>
          ))}
        {showStaminaChip && (
          <span className="train-toast-chip train-toast-chip-stam">STAM +{maxStaminaGained}</span>
        )}
      </div>

      {/* Level-up rows — gated on data, not variant, so they still show
          alongside an injury (a sparring session can do both). */}
      {levelUps.map(({ stat, oldValue, newValue }) => (
        <div key={`lvl-${stat}`} className="train-toast-levelup-row">
          <TrendingUp size={18} className="train-toast-levelup-icon" />
          <span className="train-toast-levelup-text">{stat} levelled up</span>
          <span className="train-toast-levelup-value">{oldValue} → {newValue}</span>
        </div>
      ))}

      {/* Injury rows — after level-ups, before meta. Red accent wins. */}
      {injuries.map(({ label, round }, i) => (
        <div key={`inj-${i}-${label}`} className="train-toast-injury-row">
          <AlertTriangle size={19} className="train-toast-injury-icon" />
          <span className="train-toast-injury-text">Injured: {label}</span>
          {isBatch && round != null && (
            <span className="train-toast-injury-round">round {round}</span>
          )}
        </div>
      ))}

      {/* XP booster status — active boost chip + sessions remaining, or a
          depletion notice when the last charge was spent in this batch. */}
      {booster && (
        <div className="train-toast-booster-row">
          <TrendingUp size={16} className="train-toast-booster-icon" />
          <span className="train-toast-booster-text">
            {booster.label || booster.name || "XP Booster"}
            {booster.pct ? ` +${booster.pct <= 1 ? Math.round(booster.pct * 100) : Math.round(booster.pct)}%` : ""}
          </span>
          {booster.depletedThisBatch ? (
            <span className="train-toast-booster-depleted">Booster depleted</span>
          ) : (
            <span className="train-toast-booster-left">
              {booster.sessionsLeftAfter} session{booster.sessionsLeftAfter === 1 ? "" : "s"} left
            </span>
          )}
        </div>
      )}

      {/* Meta row */}
      <div className="train-toast-meta">
        <span className="train-toast-meta-left">
          ⚡ <span className="train-toast-energy">{energyRemaining}E</span> remaining
        </span>
        <span className="train-toast-meta-right">
          <span className="train-toast-sessions">{sessionsToday}</span> sessions today
        </span>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="train-toast-progress" />
    </div>
  );
});
