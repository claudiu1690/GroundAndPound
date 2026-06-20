import { divisionColor } from "../../pvpConst";
import { t } from "../../../../lib/i18n";

const DIV_ORDER = [
  { key: "prospect",   label: "Prospect" },
  { key: "contender",  label: "Contender" },
  { key: "challenger", label: "Challenger" },
  { key: "elite",      label: "Elite" },
  { key: "champion",   label: "Champion" },
];

/**
 * DivisionSummary — one connected colored spectrum strip spanning all 5 divisions.
 *
 * Each segment has flex proportional to that division's fighter count, tinted in
 * the division color. Clicking a segment → setDivision(key) (toggle: clicking
 * the active segment clears to null / "All").
 *
 * Optional YOU marker: a small ▲ YOU tick positioned at the player's fraction
 * across the strip. Requires the `myPosition` prop (from usePvpPosition).
 *
 * Props:
 *   divisionCounts  {object}        map of divKey → count
 *   division        {string|null}   currently selected division filter
 *   setDivision     {fn}
 *   myPosition      {object|null}   from usePvpPosition (optional)
 */
export function DivisionSummary({ divisionCounts, division, setDivision, myPosition }) {
  if (!divisionCounts) return null;

  // Total fighters across all divisions (for YOU marker calculation)
  const total = DIV_ORDER.reduce((sum, d) => sum + (divisionCounts[d.key] ?? 0), 0);

  // Determine the YOU marker position as a fraction 0..1 across the strip.
  // We use the player's division and within-division fraction.
  let youFrac = null;
  if (myPosition?.division && total > 0) {
    const myDiv = myPosition.division;
    let countsBefore = 0;
    let myDivCount = 0;
    let withinFrac = 0;

    for (const d of DIV_ORDER) {
      const cnt = divisionCounts[d.key] ?? 0;
      if (d.key === myDiv) {
        myDivCount = cnt;
        // Use position rank within the division to estimate fraction
        // We know the player's rank from myPosition.rank; approximate within-div rank
        // by looking at fraction from position data if available, else 0.5
        if (myPosition.divisionFloor != null && myPosition.nextDivisionThreshold != null) {
          const dp = myPosition.dp ?? 0;
          const floor = myPosition.divisionFloor ?? 0;
          const ceil = myPosition.nextDivisionThreshold ?? floor;
          if (ceil > floor) {
            withinFrac = Math.min(1, Math.max(0, (dp - floor) / (ceil - floor)));
          } else {
            withinFrac = 0.5;
          }
        } else {
          withinFrac = 0.5;
        }
        break;
      }
      countsBefore += cnt;
    }

    // Position = (fighters before + fraction * fighters in div) / total
    youFrac = total > 0 ? (countsBefore + withinFrac * myDivCount) / total : null;
  }

  return (
    <div className="lt-ds-strip-wrap">
      {/* Main spectrum strip */}
      <div className="lt-ds-strip">
        {DIV_ORDER.map(({ key, label }) => {
          const count = divisionCounts[key] ?? 0;
          const color = divisionColor(key);
          const isSelected = division === key;
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);

          // Use at least flex:1 so zero-count segments don't collapse entirely
          const flexWeight = Math.max(1, count);

          return (
            <div
              key={key}
              className={`lt-ds-seg${isSelected ? " lt-ds-seg-act" : ""}`}
              style={{
                flex: flexWeight,
                background: isSelected
                  ? `rgba(${r},${g},${b},0.28)`
                  : `rgba(${r},${g},${b},0.10)`,
                borderTop: `1px solid rgba(${r},${g},${b},0.${isSelected ? "40" : "20"})`,
                borderBottom: `1px solid rgba(${r},${g},${b},0.${isSelected ? "40" : "20"})`,
              }}
              onClick={() => setDivision(isSelected ? null : key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setDivision(isSelected ? null : key)}
              aria-pressed={isSelected}
            >
              <span
                className="lt-ds-seg-lbl"
                style={{ color: isSelected ? color : `rgba(${r},${g},${b},0.7)` }}
              >
                {count} {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* YOU marker row */}
      {youFrac != null && (
        <div className="lt-ds-you-row" aria-label={t("pvp.ladder.posYouMarkerAriaLabel", { rank: myPosition?.overallRank ?? myPosition?.rank })}>
          <div
            className="lt-ds-you-marker"
            style={{ left: `${youFrac * 100}%` }}
          >
            <div className="lt-ds-you-tick" />
            <span className="lt-ds-you-lbl">
              ▲ YOU · #{myPosition?.overallRank ?? myPosition?.rank}
            </span>
          </div>
        </div>
      )}

      {/* Old pill classes kept as dead CSS — no JSX needed */}
    </div>
  );
}
