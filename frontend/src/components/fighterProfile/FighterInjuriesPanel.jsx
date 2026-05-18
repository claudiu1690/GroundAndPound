import { memo } from "react";
import { INJURY_SEVERITY_CLASS } from "./constants";
import { formatRecoveryRemaining } from "../../utils/injuryDisplay";

function severityClass(severity) {
  return INJURY_SEVERITY_CLASS[severity] ?? "";
}

/**
 * Active injuries — sidebar summary. Read-only.
 *
 * All iron-paid actions live on the dedicated Hospital tab. This panel just
 * surfaces the at-a-glance state (label, severity, blocking flags, days remaining)
 * with a hint pointing the player to the Hospital.
 */
export const FighterInjuriesPanel = memo(function FighterInjuriesPanel({ injuries }) {
  if (!injuries?.length) return null;

  return (
    <div className="injuries-panel">
      <h3 className="injuries-title">Active Injuries</h3>
      {injuries.map((inj, index) => (
        <InjuryCard key={`${inj.type ?? inj.label ?? "injury"}-${index}`} injury={inj} />
      ))}
      <p className="injuries-hint">Visit the 🏥 Hospital tab to treat injuries.</p>
    </div>
  );
});

const InjuryCard = memo(function InjuryCard({ injury: inj }) {
  const ticking = inj.recoveryDaysLeft > 0 && !inj.doctorVisited;

  return (
    <div className={`injury-item ${severityClass(inj.severity)}`}>
      <div className="injury-header">
        <span className="injury-label">{inj.label}</span>
        <span className="injury-severity-badge">{inj.severity}</span>
      </div>
      <p className="injury-effect">{inj.effect}</p>
      {ticking && (
        <p className="injury-recovery">
          Heals in: <strong>{formatRecoveryRemaining(inj)}</strong>
        </p>
      )}
    </div>
  );
});
