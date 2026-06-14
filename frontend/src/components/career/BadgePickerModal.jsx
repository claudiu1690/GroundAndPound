import { useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { badgeVisual } from "./badgeCatalog";

/**
 * Modal grid of EARNED badges. Selecting one pins it to the active slot. A
 * badge already pinned elsewhere is marked (selecting it from another slot
 * swaps positions, handled by the caller). The currently-pinned-to-this-slot
 * badge is highlighted.
 */
export function BadgePickerModal({ open, onClose, earnedBadges, pinnedIds, onSelect }) {
  const pinnedSet = useMemo(() => new Set(pinnedIds || []), [pinnedIds]);

  if (!open) return null;

  return createPortal(
    <div className="badge-picker-root" role="dialog" aria-modal="true" aria-label="Pin a badge">
      <div className="badge-picker-backdrop" onClick={onClose} />
      <div className="badge-picker-shell">
        <header className="badge-picker-header">
          <h2>Pin a badge</h2>
          <button type="button" className="badge-picker-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="badge-picker-body">
          {(!earnedBadges || earnedBadges.length === 0) ? (
            <div className="career-empty">No earned badges yet. Win fights to earn badges.</div>
          ) : (
            <div className="badge-picker-grid">
              {earnedBadges.map((badge) => {
                const { Icon, color, bg } = badgeVisual(badge.id, badge.category, badge);
                const isPinned = pinnedSet.has(badge.id);
                return (
                  <button
                    type="button"
                    key={badge.id}
                    className={`badge-picker-item${isPinned ? " pinned" : ""}`}
                    onClick={() => onSelect(badge.id)}
                    title={badge.name}
                  >
                    <span className="badge-picker-tile" style={{ background: bg, borderColor: color }}>
                      <Icon size={24} color={color} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="badge-picker-name">{badge.name}</span>
                    {isPinned && <span className="badge-picker-pinned-tag">Pinned</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
