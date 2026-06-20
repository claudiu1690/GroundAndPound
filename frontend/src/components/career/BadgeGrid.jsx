import { t } from "@/lib/i18n";
import { BadgeIcon } from "./BadgeIcon";

/**
 * Full badge collection. Header shows earned/locked counts; body renders each
 * category (in server order) with a labelled rule and a wrapping row of tiles.
 */
export function BadgeGrid({ badges }) {
  const earnedCount = badges?.earnedCount ?? 0;
  const lockedCount = badges?.lockedCount ?? 0;
  const categories = badges?.categories ?? [];

  return (
    <div className="badges-full">
      <div className="badges-header">
        <div className="badges-title">{t("career.badges.title")}</div>
        <div className="badges-count">{t("career.badges.earnedLocked", { earned: earnedCount, locked: lockedCount })}</div>
      </div>
      <div className="badges-body">
        {categories.length === 0 ? (
          <div className="career-empty">{t("career.badges.noCategories")}</div>
        ) : (
          categories.map((cat) => (
            <div key={cat.key}>
              <div className="cat-lbl">{cat.label}</div>
              <div className="badge-row">
                {(cat.badges ?? []).map((badge) => (
                  <BadgeIcon key={badge.id} badge={badge} categoryKey={cat.key} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
