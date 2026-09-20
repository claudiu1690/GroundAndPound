import { memo } from "react";
import { Star, Frown, AlertTriangle, Search, HelpCircle } from "lucide-react";
import { t } from "@/lib/i18n";
import { needToneClass } from "./campConstants";

const ICONS = { star: Star, frown: Frown, warning: AlertTriangle, search: Search };

/**
 * "Needs You Today" — the API's `needs[]` rendered as click-to-jump cards.
 * Every field (title/subtitle/ctaLabel/tone/icon) comes straight from the
 * payload; this component only maps tone -> CSS class and icon -> glyph.
 */
export const NeedsToday = memo(function NeedsToday({ needs, onNeedClick }) {
  if (!needs || needs.length === 0) return null;

  return (
    <div className="yc-needs">
      <div className="yc-needs-head">
        <span className="yc-needs-eyebrow">{t("yourCamp.needs.eyebrow")}</span>
        <span className="yc-needs-count">{needs.length}</span>
      </div>
      <div className="yc-needs-grid">
        {needs.map((need, i) => {
          const Icon = ICONS[need.icon] || HelpCircle;
          const tone = needToneClass(need.tone);
          return (
            <div
              key={`${need.type}-${need.targetCoachId || i}`}
              className={`yc-need-card ${tone}`}
              tabIndex={0}
              role="button"
              aria-label={need.title}
              onClick={() => onNeedClick(need)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNeedClick(need);
                }
              }}
            >
              <div className="yc-need-icon">
                <Icon size={13} />
              </div>
              <div className="yc-need-text">
                <div className="yc-need-title">{need.title}</div>
                {need.subtitle && <div className="yc-need-sub">{need.subtitle}</div>}
              </div>
              {need.ctaLabel && (
                <button
                  type="button"
                  className={`yc-need-btn ${tone}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNeedClick(need);
                  }}
                >
                  {need.ctaLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
