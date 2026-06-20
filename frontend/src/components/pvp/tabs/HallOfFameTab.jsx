import { useState, useEffect } from "react";
import { api } from "../../../api";
import { Crown } from "lucide-react";
import { t } from "../../../lib/i18n";

export function HallOfFameTab({ season }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.pvpHof(season?.weightClass)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e.message || t("common.error")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [season?.weightClass]);

  const entries = data?.entries ?? [];

  return (
    <div className="pvp-hof-wrap">
      <div className="pvp-hof-card">
        <div className="pvp-hof-head">
          <Crown size={15} strokeWidth={2} style={{ color: "#D4A820" }} />
          <div className="pvp-hof-title">{t("pvp.hof.title")}</div>
        </div>

        {loading ? (
          <div className="pvp-hof-empty">{t("pvp.hof.loading")}</div>
        ) : error ? (
          <div className="pvp-hof-empty pvp-hof-error">{error}</div>
        ) : entries.length === 0 ? (
          <div className="pvp-hof-empty">{t("pvp.hof.noHolders")}</div>
        ) : (
          entries.map((entry) => {
            const isCurrent = season && entry.seasonNumber === season.seasonNumber;
            return (
              <div key={entry.seasonId + entry.weightClass} className="pvp-hof-row">
                <span className={`pvp-hof-stag ${isCurrent ? "pvp-hof-stag-cur" : ""}`}>
                  S{entry.seasonNumber}
                </span>
                <div className="pvp-hof-wc">{entry.weightClass}</div>
                <div className="pvp-hof-fighter">{entry.beltHolderName}</div>
                <div className={`pvp-hof-detail ${isCurrent ? "" : "pvp-hof-detail-gold"}`}>
                  {isCurrent ? t("pvp.hof.currentLabel") : `${(entry.finalDp ?? 0).toLocaleString()} DP`}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Record summary card */}
      {entries.length > 0 && (
        <div className="pvp-hof-card">
          <div className="pvp-hof-head">
            <span style={{ fontSize: 15, color: "#AAAAAA" }}>★</span>
            <div className="pvp-hof-title">{t("pvp.hof.allTimeTitle")}</div>
          </div>
          <div style={{ padding: "10px 13px" }}>
            <div className="pvp-hof-sub-lbl">{t("pvp.hof.mostBeltsLabel")}</div>
            {buildBeltCounts(entries).slice(0, 3).map((rec, i) => (
              <div key={rec.name} className="pvp-hof-record-row">
                <div className="pvp-hof-record-count" style={{ color: i === 0 ? "#D4A820" : "#888" }}>
                  {rec.count}
                </div>
                <div>
                  <div className="pvp-hof-fighter">{rec.name}</div>
                  <div className="pvp-hof-detail">{rec.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function buildBeltCounts(entries) {
  const map = {};
  for (const e of entries) {
    if (!e.beltHolderName) continue;
    if (!map[e.beltHolderName]) {
      map[e.beltHolderName] = { name: e.beltHolderName, count: 0, seasons: [] };
    }
    map[e.beltHolderName].count += 1;
    map[e.beltHolderName].seasons.push(`S${e.seasonNumber} ${e.weightClass}`);
  }
  return Object.values(map)
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ ...r, detail: r.seasons.join(" · ") }));
}
