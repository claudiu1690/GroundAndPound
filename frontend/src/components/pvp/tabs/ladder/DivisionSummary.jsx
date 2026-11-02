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
 * DivisionSummary — one connected colored strip spanning all 5 divisions.
 *
 * Five equal segments, tinted in the division color, each labelled with its
 * fighter count. (Sizing them by count squeezed the small divisions to a sliver
 * whose labels piled on top of each other, unreadable on a phone.) Clicking a segment → setDivision(key) (toggle: clicking
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
    let divIndex = -1;
    let withinFrac = 0;

    for (const [i, d] of DIV_ORDER.entries()) {
      if (d.key === myDiv) {
        divIndex = i;
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
    }

    // Equal segments: the marker sits in its division's fifth, at the DP fraction.
    youFrac = divIndex >= 0 ? (divIndex + withinFrac) / DIV_ORDER.length : null;
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

          return (
            <div
              key={key}
              className={`lt-ds-seg${isSelected ? " lt-ds-seg-act" : ""}`}
              style={{
                flex: 1,
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
                <b>{count}</b> {label}
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
            // Kept off the very edges so the "▲ YOU · #n" label is never cut off.
            style={{ left: `${Math.min(92, Math.max(8, youFrac * 100))}%` }}
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
