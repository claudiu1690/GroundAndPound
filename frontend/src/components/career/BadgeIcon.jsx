import { badgeVisual } from "./badgeCatalog";
import { BadgeTooltip } from "./BadgeTooltip";

/**
 * A single 48px badge tile.
 * - earned: full colour (icon + colour from the client catalog by id)
 * - locked: 25% opacity greyscale
 * - locked + progress: a 2px bottom progress bar (current/target)
 * Hover surfaces BadgeTooltip above the tile.
 *
 * `categoryKey` is used as a visual fallback when the id isn't in the catalog.
 */
export function BadgeIcon({ badge, categoryKey }) {
  const { Icon, color, bg } = badgeVisual(badge.id, categoryKey);
  const earned = !!badge.earned;
  const progress = !earned && badge.progress && badge.progress.target ? badge.progress : null;
  const pct = progress
    ? Math.max(0, Math.min(100, (progress.current / progress.target) * 100))
    : 0;

  return (
    <div className="bw">
      {badge.new && <span className="badge-new-dot" title="Newly unlocked">NEW</span>}
      <div
        className={`bi${earned ? "" : " locked"}`}
        style={earned
          ? { background: bg, borderColor: color }
          : { background: "rgba(100,100,100,0.08)", borderColor: "var(--bos, #1E1E1E)" }}
      >
        <Icon size={26} color={earned ? color : "#888"} strokeWidth={1.8} aria-hidden="true" />
        {progress && (
          <div className="prog">
            <div className="prog-f" style={{ width: `${pct}%`, background: color }} />
          </div>
        )}
      </div>
      <div className="bn">{badge.name}</div>
      <BadgeTooltip badge={badge} />
    </div>
  );
}
