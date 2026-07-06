import { memo } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Pre-fight warning shown when a fighter takes a bout while carrying a
 * non-fight-blocking injury (Broken Hand, Bruised Rib, Broken Nose, Sprained
 * Ankle). The fight is still allowed — the backend only hard-blocks cannotFight
 * injuries. This is informed consent, not a gate: fighting hurt lowers your
 * stats and raises the risk of a worse injury, so the player should know before
 * committing.
 */
export const InjuryWarnModal = memo(function InjuryWarnModal({ open, injuries = [], onCancel, onConfirm }) {
  if (!open) return null;

  return createPortal(
    <div
      className="training-result-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("fights.injuryWarn.title")}
      onClick={onCancel}
    >
      <div className="training-result-popup injury-warn-popup" onClick={(e) => e.stopPropagation()}>
        <h3 className="training-result-title injury-warn-title">
          <AlertTriangle size={16} /> {t("fights.injuryWarn.title")}
        </h3>
        <p className="injury-warn-intro">{t("fights.injuryWarn.intro")}</p>
        <ul className="injury-warn-list">
          {injuries.map((inj, i) => (
            <li key={inj.type ?? i} className="injury-warn-item">
              <span className="injury-warn-label">{inj.label}</span>
              {inj.effect && <span className="injury-warn-effect">{inj.effect}</span>}
            </li>
          ))}
        </ul>
        <p className="injury-warn-hint">{t("fights.injuryWarn.hospitalHint")}</p>
        <div className="injury-warn-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            {t("fights.injuryWarn.cancel")}
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onConfirm}>
            {t("fights.injuryWarn.confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});
