import { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { t } from "../../lib/i18n";
import { CHANGELOG_ENTRIES } from "./changelogContent";

/**
 * "What's New" changelog modal.
 *
 * Props:
 *   open    — boolean
 *   onClose — () => void
 *
 * No fetch, no backend call — content comes straight from changelogContent.js.
 * Skeleton (escape-to-close, backdrop-click close, close button) mirrors
 * GazetteModal. No user-trapping.
 */
function ChangelogModalImpl({ open, onClose }) {
  // Escape key to close
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const [latest, ...older] = CHANGELOG_ENTRIES;

  const SECTION_ORDER = [
    { key: "changed", label: t("changelog.sections.changed"), cls: "cl-cat-changed" },
    { key: "fixed", label: t("changelog.sections.fixed"), cls: "cl-cat-fixed" },
    { key: "balance", label: t("changelog.sections.balance"), cls: "cl-cat-balance" },
  ];

  function renderSections(sections) {
    if (!sections) return null;
    return SECTION_ORDER.map(({ key, label, cls }) => {
      const items = sections[key];
      if (!Array.isArray(items) || items.length === 0) return null;
      return (
        <div key={key} className={`cl-section ${cls}`}>
          <div className="cl-section-label">{label}</div>
          <ul>
            {items.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      );
    });
  }

  return createPortal(
    <div
      className="cl-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("changelog.ariaLabel")}
      onClick={() => onClose?.()}
    >
      <div className="cl-paper" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cl-close" aria-label={t("changelog.closeAriaLabel")} onClick={() => onClose?.()}>✕</button>

        <div className="cl-head">
          <h2 className="cl-title">{t("changelog.title")}</h2>
        </div>

        {/* ── LATEST ENTRY (expanded) ── */}
        <div className="cl-entry cl-entry-latest">
          <div className="cl-entry-head">
            <span className="cl-version">v{latest.version}</span>
            <span className="cl-date">{latest.date}</span>
          </div>

          {Array.isArray(latest.highlights) && latest.highlights.length > 0 && (
            <ul className="cl-highlights">
              {latest.highlights.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}

          {renderSections(latest.sections)}
        </div>

        {/* ── OLDER ENTRIES (accordion) ── skip heading entirely with only one entry */}
        {older.length > 0 && (
          <div className="cl-older">
            <div className="cl-older-heading">{t("changelog.olderHeading")}</div>
            {older.map((entry) => (
              <details key={entry.version} className="cl-entry cl-entry-older">
                <summary className="cl-entry-head cl-entry-summary">
                  <span className="cl-version">v{entry.version}</span>
                  <span className="cl-date">{entry.date}</span>
                </summary>

                {Array.isArray(entry.highlights) && entry.highlights.length > 0 && (
                  <ul className="cl-highlights">
                    {entry.highlights.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}

                {renderSections(entry.sections)}
              </details>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export const ChangelogModal = memo(ChangelogModalImpl);
export default ChangelogModal;
