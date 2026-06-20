import { memo } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";

/**
 * Generic modal used for fight limit/cap blocking messages.
 */
export const FightLimitPopup = memo(function FightLimitPopup({ open, message, onClose }) {
  if (!open) return null;

  return createPortal(
    <div
      className="training-result-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Fight limit reached"
      onClick={onClose}
    >
      <div className="training-result-popup" onClick={(e) => e.stopPropagation()}>
        <h3 className="training-result-title">{t("fights.fightLimit.title")}</h3>
        <p className="training-result-fallback">{message || t("fights.fightLimit.fallback")}</p>
        <button type="button" className="btn btn-primary btn-sm training-result-close" onClick={onClose}>
          {t("fights.fightLimit.gotIt")}
        </button>
      </div>
    </div>
  , document.body);
});
