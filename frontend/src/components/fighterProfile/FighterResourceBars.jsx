import { memo } from "react";

function barWidthPct(value, max) {
  if (max <= 0) return 0;
  return Math.min(100, (value / max) * 100);
}

/**
 * Energy / health / stamina bars from pre-shaped row descriptors.
 */
export const FighterResourceBars = memo(function FighterResourceBars({ rows }) {
  return (
    <div className="fighter-resources">
      {rows.map(({ key, label, value, max, barClass }) => (
        <div className="resource-row" key={key}>
          <span className="resource-label">{label}</span>
          <div className="resource-bar-wrap">
            <div
              className={`resource-bar ${barClass}`}
              style={{ width: `${barWidthPct(value, max)}%` }}
            />
          </div>
          <span className="resource-value">
            {value}/{max}
          </span>
        </div>
      ))}
    </div>
  );
});
