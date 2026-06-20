import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { api } from "../../api";
import { divisionColor, divisionLabel } from "../pvp/pvpConst";

/**
 * PVP history card — shown on the Career Profile page.
 * Fetches GET /pvp/record/:fighterId (§3.2) and renders the history rows.
 * Uses the silent-loading pattern: loading indicator only on first load (no prior data).
 */
export function PvpHistoryCard({ fighterId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fighterId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.pvpRecord(fighterId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Could not load PVP history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fighterId]);

  const history = data?.history ?? [];
  const record = data?.record ?? null;

  return (
    <div className="p-card">
      <div className="p-card-lbl">{t("career.pvpHistory.cardLabel")}</div>

      {loading && !data ? (
        <div className="career-empty">{t("career.pvpHistory.loading")}</div>
      ) : error ? (
        <div className="career-empty" style={{ color: "#C8102E" }}>{error}</div>
      ) : history.length === 0 ? (
        <div className="career-empty">{t("career.pvpHistory.noHistory")}</div>
      ) : (
        <div className="pvp-hist-card-list">
          {history.map((row) => {
            const color = row.divisionColor || divisionColor(row.division);
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return (
              <div key={row.seasonId} className="pvp-hist-card-row">
                <div className="pvp-hist-card-season">
                  <span
                    className="pvp-hc-season-tag"
                    style={
                      row.isActive
                        ? { background: "rgba(200,16,46,0.08)", color: "#C8102E", border: "1px solid rgba(200,16,46,0.15)" }
                        : {}
                    }
                  >
                    {row.seasonName ?? `S${row.seasonNumber}`}
                  </span>
                </div>
                <div className="pvp-hist-card-div">
                  <span
                    className="pvp-div-badge"
                    style={{
                      color,
                      background: `rgba(${r},${g},${b},0.12)`,
                      border: `1px solid rgba(${r},${g},${b},0.2)`,
                    }}
                  >
                    {divisionLabel(row.division)}
                  </span>
                  {row.isBeltHolder && (
                    <span style={{ marginLeft: 4, fontSize: 12 }}>🏆</span>
                  )}
                </div>
                {row.rank != null && (
                  <div className="pvp-hist-card-rank" style={{ fontSize: 11, color: "#888", minWidth: 32, textAlign: "right" }}>
                    #{row.rank}
                  </div>
                )}
                <div className="pvp-hist-card-dp" style={{ color: row.isActive ? "#F0F0F0" : "#888" }}>
                  {(row.dp ?? 0).toLocaleString()} DP
                </div>
              </div>
            );
          })}

          {/* Active season record summary */}
          {record && (
            <div className="pvp-hist-card-active">
              <span style={{ fontSize: 11, color: "#555" }}>
                {t("career.pvpHistory.thisSeason", { wins: record.wins ?? 0, losses: record.losses ?? 0 })}
                {record.winStreak >= 3 ? ` · 🔥 ${t("career.pvpHistory.winStreak", { n: record.winStreak })}` : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
