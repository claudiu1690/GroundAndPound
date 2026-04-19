import { memo } from "react";
import { api } from "../../api";
import { INJURY_SEVERITY_CLASS } from "./constants";

function severityClass(severity) {
  return INJURY_SEVERITY_CLASS[severity] ?? "";
}

/**
 * Active injuries with optional doctor visit or recovery copy.
 */
export const FighterInjuriesPanel = memo(function FighterInjuriesPanel({
  fighterId,
  injuries,
  onRefreshFighter,
  onMessage,
}) {
  if (!injuries?.length) return null;

  return (
    <div className="injuries-panel">
      <h3 className="injuries-title">Active Injuries</h3>
      {injuries.map((inj, index) => (
        <InjuryCard
          key={`${inj.type ?? inj.label ?? "injury"}-${index}`}
          fighterId={fighterId}
          injury={inj}
          onRefreshFighter={onRefreshFighter}
          onMessage={onMessage}
        />
      ))}
    </div>
  );
});

const InjuryCard = memo(function InjuryCard({
  fighterId,
  injury: inj,
  onRefreshFighter,
  onMessage,
}) {
  const needsDoctor = inj.requiresDoctorVisit && !inj.doctorVisited;

  async function handleDoctorVisit() {
    try {
      await api.doctorVisit(fighterId, inj.type);
      onMessage?.(`Doctor visit complete — ${inj.label} healed.`);
      if (onRefreshFighter) await onRefreshFighter(fighterId);
    } catch (e) {
      onMessage?.(e.message || "Doctor visit failed");
    }
  }

  return (
    <div className={`injury-item ${severityClass(inj.severity)}`}>
      <div className="injury-header">
        <span className="injury-label">{inj.label}</span>
        <span className="injury-severity-badge">{inj.severity}</span>
      </div>
      <p className="injury-effect">{inj.effect}</p>
      {needsDoctor && (
        <button
          type="button"
          className="btn btn-warning btn-sm"
          title={`Doctor: ${inj.docVisitEnergy} energy`}
          onClick={handleDoctorVisit}
        >
          Visit doctor ({inj.docVisitEnergy}E)
        </button>
      )}
      {!inj.requiresDoctorVisit && inj.recoverySessionsLeft > 0 && (
        <p className="injury-recovery">
          Recovery sessions left: <strong>{inj.recoverySessionsLeft}</strong>
        </p>
      )}
    </div>
  );
});
