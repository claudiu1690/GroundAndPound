import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { t } from "@/lib/i18n";
import { badgeVisual } from "./badgeCatalog";

/**
 * One-time celebration modal listing the player's newly-unlocked (unseen) badges.
 * Shown on Profile open when there are new badges; dismissing acknowledges them.
 *
 * @param {Array<{id,name,description,category}>} badges  the new badges
 * @param {() => void} onClose  called on dismiss (acknowledges + clears)
 */
export function BadgeUnlockModal({ badges, onClose }) {
  if (!badges || badges.length === 0) return null;
  const multiple = badges.length > 1;

  return createPortal(
    <div className="badge-modal-root" role="dialog" aria-modal="true" aria-label={t("career.badges.unlockModalAriaLabel")}>
      <div className="badge-modal-backdrop" onClick={onClose} />
      <div className="badge-modal-card">
        <div className="badge-modal-head">
          <Sparkles size={18} className="badge-modal-spark" />
          <span>{multiple ? t("career.badges.unlockMultipleTitle", { n: badges.length }) : t("career.badges.unlockSingleTitle")}</span>
        </div>

        <div className="badge-modal-list">
          {badges.map((b) => {
            const { Icon, color, bg } = badgeVisual(b.id, b.category, b);
            return (
              <div className="badge-modal-item" key={b.id}>
                <div className="badge-modal-icon" style={{ background: bg, borderColor: color }}>
                  <Icon size={26} color={color} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <div className="badge-modal-info">
                  <div className="badge-modal-name">{b.name}</div>
                  {b.description && <div className="badge-modal-desc">{b.description}</div>}
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" className="badge-modal-btn" onClick={onClose}>
          {multiple ? t("career.badges.unlockDismissMultiple") : t("career.badges.unlockDismissSingle")}
        </button>
      </div>
    </div>,
    document.body
  );
}
