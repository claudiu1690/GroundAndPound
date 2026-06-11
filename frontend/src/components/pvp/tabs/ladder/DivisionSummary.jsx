import { divisionColor } from "../../pvpConst";

const DIV_ORDER = [
  { key: "prospect",   label: "Prospect" },
  { key: "contender",  label: "Contender" },
  { key: "challenger", label: "Challenger" },
  { key: "elite",      label: "Elite" },
  { key: "champion",   label: "Champion" },
];

/**
 * DivisionSummary — 5 count pills, one per division.
 * Selected pill gets a colored border + subtle bg tint.
 * Clicking a pill → setDivision(key) (or null to clear if already selected).
 */
export function DivisionSummary({ divisionCounts, division, setDivision }) {
  if (!divisionCounts) return null;

  return (
    <div className="lt-div-summary">
      {DIV_ORDER.map(({ key, label }) => {
        const count = divisionCounts[key] ?? 0;
        const color = divisionColor(key);
        const isSelected = division === key;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        const pillStyle = isSelected
          ? {
              borderColor: `rgba(${r},${g},${b},0.35)`,
              background: `rgba(${r},${g},${b},0.05)`,
            }
          : {};

        return (
          <div
            key={key}
            className={`lt-ds-pill${isSelected ? " lt-ds-pill-act" : ""}`}
            style={pillStyle}
            onClick={() => setDivision(isSelected ? null : key)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setDivision(isSelected ? null : key)}
          >
            <div className="lt-ds-count" style={{ color: isSelected ? color : undefined }}>
              {count}
            </div>
            <div className="lt-ds-lbl" style={{ color: isSelected ? color : undefined }}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
