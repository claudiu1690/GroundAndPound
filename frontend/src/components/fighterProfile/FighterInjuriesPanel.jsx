import { memo } from "react";
import { INJURY_SEVERITY_CLASS } from "./constants";
import { formatRecoveryRemaining } from "../../utils/injuryDisplay";
import { t } from "@/lib/i18n";

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
      <h3 className="injuries-title">{t("fighterProfile.injuries.sectionTitle")}</h3>
      {injuries.map((inj, index) => (
        <InjuryCard key={`${inj.type ?? inj.label ?? "injury"}-${index}`} injury={inj} />
      ))}
      <p className="injuries-hint">{t("fighterProfile.injuries.hint")}</p>
    </div>
  );
});

const InjuryCard = memo(function InjuryCard({ injury: inj }) {
  const hoursLeft = inj.recoveryHoursLeft > 0 ? inj.recoveryHoursLeft : (inj.recoveryDaysLeft || 0) * 24;
  const ticking = hoursLeft > 0 && !inj.doctorVisited;

  return (
    <div className={`injury-item ${severityClass(inj.severity)}`}>
      <div className="injury-header">
        <span className="injury-label">{inj.label}</span>
        <span className="injury-severity-badge">{inj.severity}</span>
      </div>
      <p className="injury-effect">{inj.effect}</p>
      {ticking && (
        <p className="injury-recovery">
          {t("fighterProfile.injuries.healsIn")} <strong>{formatRecoveryRemaining(inj)}</strong>
        </p>
      )}
    </div>
  );
});
