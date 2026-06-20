import { t } from "@/lib/i18n";
// The 8 fighter attributes, 2×4 grid. Bar width = value/50*100 (clamped 100).
const STATS = [
  { key: "str", label: "STR" },
  { key: "spd", label: "SPD" },
  { key: "leg", label: "LEG" },
  { key: "wre", label: "WRE" },
  { key: "gnd", label: "GND" },
  { key: "sub", label: "SUB" },
  { key: "chn", label: "CHN" },
  { key: "fiq", label: "FIQ" },
];

export function ProfileStatsCard({ fighter }) {
  return (
    <div className="p-card">
      <div className="p-card-lbl">{t("career.stats.cardLabel")}</div>
      <div className="stat-grid">
        {STATS.map(({ key, label }) => {
          const value = Number(fighter?.[key] ?? 0);
          const width = Math.min(100, (value / 50) * 100);
          return (
            <div className="sr" key={key}>
              <span className="snm">{label}</span>
              <span className="sv">{value}</span>
              <div className="sbar"><div className="sbar-f" style={{ width: `${width}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
