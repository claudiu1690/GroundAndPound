import { memo } from "react";

/**
 * Stat values + XP bars in a 2-column grid.
 * The XP fraction lives in the row tooltip to keep the grid compact.
 */
export const FighterStatMeters = memo(function FighterStatMeters({ rows }) {
  return (
    <div className="stat-meters" data-tut="profile-stats">
      <h3 className="stat-meters-title">Stats &amp; XP</h3>
      <div className="stat-meters-grid">
        {rows.map(({ name, value, pct, xpLine, tooltip }) => (
          <div
            key={name}
            className="stat-row"
            title={xpLine ? `${tooltip} — ${xpLine}` : tooltip}
          >
            <span className="stat-name">{name}</span>
            <span className="stat-value">{value}</span>
            <div className="stat-bar-wrap">
              <div className="stat-bar" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
