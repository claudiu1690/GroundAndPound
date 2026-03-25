import { memo } from "react";

/**
 * Generic modal used for fight limit/cap blocking messages.
 */
export const FightLimitPopup = memo(function FightLimitPopup({ open, message, onClose }) {
  if (!open) return null;

  return (
    <div
      className="training-result-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Fight limit reached"
      onClick={onClose}
    >
      <div className="training-result-popup" onClick={(e) => e.stopPropagation()}>
        <h3 className="training-result-title">Fight unavailable</h3>
        <p className="training-result-fallback">{message || "You cannot accept this fight right now."}</p>
        <button type="button" className="btn btn-primary btn-sm training-result-close" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
});
