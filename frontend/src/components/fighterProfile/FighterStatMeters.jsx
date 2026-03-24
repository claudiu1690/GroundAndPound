import { memo } from "react";

/**
 * Stat values, XP bars, and tooltips from precomputed rows.
 */
export const FighterStatMeters = memo(function FighterStatMeters({ rows }) {
  return (
    <div className="stat-meters">
      <h3 className="stat-meters-title">Stats &amp; XP</h3>
      {rows.map(({ name, value, pct, xpLine, tooltip }) => (
        <div key={name} className="stat-row">
          <span className="stat-name stat-tooltip" title={tooltip}>
            {name}
          </span>
          <span className="stat-value">{value}</span>
          <div className="stat-bar-wrap">
            <div className="stat-bar" style={{ width: `${pct}%` }} />
          </div>
          <span className="stat-xp-text">{xpLine}</span>
        </div>
      ))}
    </div>
  );
});
