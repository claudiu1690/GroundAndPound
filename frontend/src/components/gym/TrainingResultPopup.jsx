import { memo } from "react";
import { createPortal } from "react-dom";

/**
 * Popup shown after a gym training session.
 *
 * Two layouts, gated on `requested`:
 *   - requested <= 1 (N=1): EXACTLY today's layout (backward-compatible).
 *   - requested > 1: aggregated batch summary.
 *
 * Every aggregate field is null-guarded — any may be missing/empty.
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

const STOP_REASON_TEXT = {
  out_of_energy: "Stopped early — ran out of energy",
  injury: "Stopped early — injury",
};

export const TrainingResultPopup = memo(function TrainingResultPopup({
  open,
  sessionLabel,
  xpGained,
  statLevelUps,
  // Aggregate (batch) fields — all optional.
  requested,
  completed,
  stopReason,
  statChanges,
  energySpent,
  energyAfter,
  events,
  injurySustained,
  rankUp,
  maxStaminaGained,
  staminaCapHit,
  onClose,
}) {
  if (!open) return null;

  const hasXp = xpGained && typeof xpGained === "object" && Object.keys(xpGained).length > 0;
  const entries = hasXp ? Object.entries(xpGained).filter(([, xp]) => Number(xp) > 0) : [];
  const isBatch = Number(requested) > 1;

  // ── N=1 / legacy layout (byte-identical to today) ──────────────
  if (!isBatch) {
    const levelUps = Array.isArray(statLevelUps)
      ? statLevelUps
      : (statLevelUps && typeof statLevelUps === "object" ? Object.keys(statLevelUps) : []);
    const hasLevelUps = levelUps.length > 0;

    return createPortal(
      <div className="training-result-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Training result">
        <div className="training-result-popup" onClick={(e) => e.stopPropagation()}>
          <h3 className="training-result-title">You did &ldquo;{sessionLabel}&rdquo;</h3>
          {hasXp ? (
            <div className="training-result-xp">
              <div className="training-result-xp-label">XP gained</div>
              <div className="training-result-xp-stats">
                {Object.entries(xpGained).map(([stat, xp]) => (
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
    , document.body);
  }

  // ── Aggregated batch layout ────────────────────────────────────
  const doneCount = Number.isFinite(completed) ? completed : 0;
  const reqCount = Number(requested) || 0;
  const stopText = stopReason && stopReason !== "completed" ? STOP_REASON_TEXT[stopReason] : null;

  const changes = Array.isArray(statChanges) ? statChanges : [];
  const evts = Array.isArray(events) ? events : [];
  const injuries = Array.isArray(injurySustained) ? injurySustained : [];
  const injuryEvents = evts.filter((e) => e && e.type === "injury");
  const capEvents = evts.filter((e) => e && (e.type === "stat_cap_hit" || e.type === "stamina_cap_hit"));
  const staminaGain = Number(maxStaminaGained) || 0;
  const rankedUp = rankUp && rankUp.rankedUp;

  // Round label for an injury event from its session index (already 1-based).
  const roundOf = (e) =>
    e && Number.isFinite(e.sessionIndex) ? ` (round ${e.sessionIndex})` : "";

  return createPortal(
    <div className="training-result-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Training result">
      <div className="training-result-popup" onClick={(e) => e.stopPropagation()}>
        <h3 className="training-result-title">
          {sessionLabel} ×{doneCount} of {reqCount}
        </h3>
        {stopText && <p className="training-result-stopreason">{stopText}</p>}

        {entries.length > 0 ? (
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
          doneCount === 0 && <p className="training-result-fallback">No sessions completed.</p>
        )}

        {changes.length > 0 && (
          <div className="training-result-changes">
            <div className="training-result-xp-label">Stat changes</div>
            {changes.map((c) => (
              <div key={c.stat} className="training-result-change-row">
                <span className={`stat-chip ${STAT_CHIP_CLASS[c.stat] ?? ""}`}>{c.stat}</span>
                <span className="training-result-change-vals">
                  {c.before}&rarr;{c.after}
                </span>
                {Number(c.wasted) > 0 && (
                  <span className="training-result-wasted">(cap reached, {c.wasted} XP wasted)</span>
                )}
              </div>
            ))}
          </div>
        )}

        {(staminaGain > 0 || staminaCapHit) && (
          <div className="training-result-stamina">
            {staminaGain > 0 && <span>Max Stamina +{staminaGain}</span>}
            {staminaCapHit && <span className="training-result-wasted"> (stamina cap reached)</span>}
          </div>
        )}

        {(injuryEvents.length > 0 || injuries.length > 0 || capEvents.length > 0 || rankedUp) && (
          <div className="training-result-events">
            {injuryEvents.map((e, i) => (
              <div key={`inj-${i}`} className="training-result-event training-result-event-injury">
                <span>Injury: {e.label || injuries[0] || "injury sustained"}{roundOf(e)}</span>
              </div>
            ))}
            {injuryEvents.length === 0 && injuries.map((label, i) => (
              <div key={`injl-${i}`} className="training-result-event training-result-event-injury">
                <span>Injury: {label}</span>
              </div>
            ))}
            {rankedUp && (
              <div className="training-result-event training-result-event-rankup">
                <span>
                  Rank up{rankUp.rankName ? ` — ${rankUp.rankName}` : ""}
                  {rankUp.unlockDescription ? `: ${rankUp.unlockDescription}` : ""}
                </span>
              </div>
            )}
            {capEvents.map((e, i) => (
              <div key={`cap-${i}`} className="training-result-event training-result-event-cap">
                <span>
                  {e.type === "stamina_cap_hit" ? "Stamina cap reached" : `${e.stat || "Stat"} cap reached`}
                  {Number.isFinite(e.sessionIndex) ? ` (round ${e.sessionIndex})` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {Number.isFinite(energySpent) && (
          <div className="training-result-energy">
            &minus;{energySpent}E{Number.isFinite(energyAfter) ? ` · ${energyAfter}E left` : ""}
          </div>
        )}

        <button type="button" className="btn btn-primary btn-sm training-result-close" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  , document.body);
});
