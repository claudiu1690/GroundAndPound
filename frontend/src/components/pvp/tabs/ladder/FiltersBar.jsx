import { divisionColor } from "../../pvpConst";

const DIVISIONS = [
  { key: "prospect",   label: "Prospect" },
  { key: "contender",  label: "Contender" },
  { key: "challenger", label: "Challenger" },
  { key: "elite",      label: "Elite" },
  { key: "champion",   label: "Champion" },
];

const WC_OPTIONS = ["All", "FW", "LW", "MW", "HW"];

/**
 * FiltersBar — division single-select + optional weight-class filter.
 *
 * Props:
 *   division       {string|null}  currently selected division key
 *   setDivision    {fn}
 *   weightClass    {string}       "All" | "FW" | "LW" | "MW" | "HW"
 *   setWeightClass {fn}
 *   season         {object}       season DTO (crossWeightClass bool)
 *   total          {number}
 */
export function FiltersBar({ division, setDivision, weightClass, setWeightClass, season, total }) {
  const isCrossWc = !!season?.crossWeightClass;

  const divLabel = division
    ? DIVISIONS.find((d) => d.key === division)?.label ?? division
    : "All";

  const wcLabel = isCrossWc
    ? (weightClass && weightClass !== "All" ? weightClass : "All weights")
    : null;

  const summaryParts = [
    `${total ?? 0} fighters`,
    divLabel,
    ...(wcLabel ? [wcLabel] : []),
  ];

  return (
    <div className="lt-filters-bar">
      <span className="lt-filter-lbl">Division</span>
      <div className="lt-filter-group">
        <button
          className={`lt-fb${!division ? " lt-fb-act" : ""}`}
          onClick={() => setDivision(null)}
        >
          All
        </button>
        {DIVISIONS.map(({ key, label }) => {
          const isActive = division === key;
          const color = divisionColor(key);
          // Division-specific active colors to match the mock
          const activeStyle = isActive ? activeDivStyle(key, color) : {};
          return (
            <button
              key={key}
              className={`lt-fb${isActive ? " lt-fb-act" : ""}`}
              style={activeStyle}
              onClick={() => setDivision(isActive ? null : key)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isCrossWc && (
        <>
          <div className="lt-filter-sep" />
          <span className="lt-filter-lbl">Weight</span>
          <div className="lt-filter-group">
            {WC_OPTIONS.map((wc) => {
              const isActive = (weightClass ?? "All") === wc;
              return (
                <button
                  key={wc}
                  className={`lt-fb${isActive ? " lt-fb-act" : ""}`}
                  onClick={() => setWeightClass(wc)}
                >
                  {wc}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="lt-filters-right">{summaryParts.join(" · ")}</div>
    </div>
  );
}

function activeDivStyle(key, color) {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return {
    background: `rgba(${r},${g},${b},0.10)`,
    borderColor: `rgba(${r},${g},${b},0.28)`,
    color,
  };
}
