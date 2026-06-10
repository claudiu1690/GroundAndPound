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
        <div className="badges-title">Badges</div>
        <div className="badges-count">{earnedCount} earned · {lockedCount} locked</div>
      </div>
      <div className="badges-body">
        {categories.length === 0 ? (
          <div className="career-empty">No badges available yet.</div>
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
