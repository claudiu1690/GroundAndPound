import { memo } from "react";
import { Check, X, TrendingUp, AlertTriangle, ShieldCheck, Coins } from "lucide-react";
import { STAT_CHIP_CLASS } from "./GymTraining";
import { t } from "@/lib/i18n";

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
  // Badge-unlock toast — a lightweight, distinct variant (raised on fight
  // resolve when newlyEarnedBadges is present). Rendered before the training VM
  // destructure so it never touches training-only fields.
  if (toast.kind === "badge") {
    return (
      <div className={`train-toast train-toast--badge${toast.dismissing ? " dismissing" : ""}`}>
        <div className="train-toast-top">
          <div className="train-toast-title">
            <ShieldCheck size={19} className="train-toast-badge-icon" />
            <span>{t("gym.toast.badgeUnlocked", { name: toast.badgeName })}</span>
          </div>
          <button
            type="button"
            className="train-toast-close"
            aria-label={t("gym.toast.dismiss")}
            onClick={() => onDismiss(toast.id)}
          >
            <X size={18} />
          </button>
        </div>
        {toast.badgeContext && (
          <div className="train-toast-xp">
            <span className="train-toast-xp-label">{toast.badgeContext}</span>
          </div>
        )}
        <div className="train-toast-progress" />
      </div>
    );
  }

  // Duplicate special-move drop — a compact cash line, deliberately NOT a
  // big card (the tall reveal card is reserved for NEW/UPGRADE outcomes,
  // rendered via DropRevealModal instead).
  if (toast.kind === "moveDupe") {
    return (
      <div className={`train-toast train-toast--movedupe${toast.dismissing ? " dismissing" : ""}`}>
        <div className="train-toast-top">
          <div className="train-toast-title">
            <Coins size={18} className="train-toast-movedupe-icon" />
            <span>{t("gym.toast.moveDuplicate", { name: toast.name, cash: (toast.cashAwarded || 0).toLocaleString() })}</span>
          </div>
          <button
            type="button"
            className="train-toast-close"
            aria-label={t("gym.toast.dismiss")}
            onClick={() => onDismiss(toast.id)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="train-toast-progress" />
      </div>
    );
  }

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
      rollBadge = <span className="train-toast-badge train-toast-badge--great">{t("gym.toast.greatSession")}</span>;
    } else if (rollTier === "sluggish") {
      rollBadge = <span className="train-toast-badge train-toast-badge--sluggish">{t("gym.toast.sluggish")}</span>;
    }
  } else if (greatCount > 0) {
    rollBadge = (
      <span className="train-toast-badge train-toast-badge--great">
        {t("gym.toast.greatCount", { n: greatCount, plural: greatCount > 1 ? "s" : "" })}
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
          <span>{t("gym.toast.sessionComplete", { name: sessionName })}</span>
          {rollBadge}
        </div>
        <button
          type="button"
          className="train-toast-close"
          aria-label={t("gym.toast.dismiss")}
          onClick={() => onDismiss(id)}
        >
          <X size={18} />
        </button>
      </div>

      {/* XP / conditioning row */}
      <div className="train-toast-xp">
        <span className="train-toast-xp-label">
          {showCapLabel ? t("gym.toast.maxStaminaAtCap") : t("gym.toast.xpGained")}
        </span>
        {hasXp &&
          xpGained.map(({ stat, amount }) => (
            <span key={stat} className={`train-toast-chip stat-chip ${STAT_CHIP_CLASS[stat] ?? ""}`}>
              {stat} +{amount}
            </span>
          ))}
        {showStaminaChip && (
          <span className="train-toast-chip train-toast-chip-stam">{t("gym.toast.staminaGained", { amount: maxStaminaGained })}</span>
        )}
      </div>

      {/* Level-up rows — gated on data, not variant, so they still show
          alongside an injury (a sparring session can do both). */}
      {levelUps.map(({ stat, oldValue, newValue }) => (
        <div key={`lvl-${stat}`} className="train-toast-levelup-row">
          <TrendingUp size={18} className="train-toast-levelup-icon" />
          <span className="train-toast-levelup-text">{t("gym.toast.levelledUp", { stat })}</span>
          <span className="train-toast-levelup-value">{oldValue} → {newValue}</span>
        </div>
      ))}

      {/* Injury rows — after level-ups, before meta. Red accent wins. */}
      {injuries.map(({ label, round }, i) => (
        <div key={`inj-${i}-${label}`} className="train-toast-injury-row">
          <AlertTriangle size={19} className="train-toast-injury-icon" />
          <span className="train-toast-injury-text">{t("gym.toast.injured", { label })}</span>
          {isBatch && round != null && (
            <span className="train-toast-injury-round">{t("gym.toast.round", { round })}</span>
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
            <span className="train-toast-booster-depleted">{t("gym.toast.boosterDepleted")}</span>
          ) : (
            <span className="train-toast-booster-left">
              {t("gym.toast.boosterLeft", { n: booster.sessionsLeftAfter, plural: booster.sessionsLeftAfter === 1 ? "" : "s" })}
            </span>
          )}
        </div>
      )}

      {/* Meta row */}
      <div className="train-toast-meta">
        <span className="train-toast-meta-left">
          ⚡ <span className="train-toast-energy">{t("gym.toast.energyRemaining", { energy: energyRemaining })}</span>
        </span>
        <span className="train-toast-meta-right">
          <span className="train-toast-sessions">{t("gym.toast.sessionsToday", { n: sessionsToday })}</span>
        </span>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="train-toast-progress" />
    </div>
  );
});
