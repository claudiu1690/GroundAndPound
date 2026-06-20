import { useState } from "react";
import { usePvpHistory } from "../../../hooks/usePvpHistory";
import { t } from "../../../lib/i18n";

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function methodLabel(m) {
  if (!m) return "";
  if (m === "ko") return "KO";
  if (m === "submission") return "Sub";
  if (m === "decision") return "Decision";
  if (m === "draw") return "Draw";
  return m;
}

export function HistoryTab({ season }) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = usePvpHistory(season?.id, page);
  const fights = data?.fights ?? [];

  return (
    <div className="pvp-history-wrap">
      {loading && fights.length === 0 ? (
        <div className="pvp-loading">{t("pvp.history.loading")}</div>
      ) : error ? (
        <div className="pvp-error-note">{error}</div>
      ) : fights.length === 0 ? (
        <div className="pvp-empty-history">{t("pvp.history.empty")}</div>
      ) : (
        <>
          <div className="pvp-hist-list">
            {fights.map((f) => {
              const won = f.youWon;
              const dp = f.dpChange ?? 0;
              return (
                <div key={f.fightId} className="pvp-hist-row">
                  <div className={`pvp-hist-stripe ${won ? "pvp-hist-stripe-w" : "pvp-hist-stripe-l"}`} />
                  <div className="pvp-hist-body">
                    <div className="pvp-hist-top">
                      <span className={`pvp-hist-result ${won ? "pvp-hist-result-w" : "pvp-hist-result-l"}`}>
                        {won ? t("pvp.history.win") : t("pvp.history.loss")}
                      </span>
                      <span className="pvp-hist-opp">vs {f.opponentName}</span>
                      {f.isRivalryFight && (
                        <span className="pvp-hist-tag pvp-hist-tag-rival">{t("pvp.history.tagRival")}</span>
                      )}
                      {f.isBeltHolderFight && (
                        <span className="pvp-hist-tag pvp-hist-tag-belt">{t("pvp.history.tagChamp")}</span>
                      )}
                    </div>
                    <div className="pvp-hist-sub">
                      {methodLabel(f.method)} · {f.divisionAfter}
                      {f.role === "defender" && (
                        <span className="pvp-hist-tag pvp-hist-tag-def">{t("pvp.history.tagDefense")}</span>
                      )}
                    </div>
                  </div>
                  <div className="pvp-hist-right">
                    <div className={`pvp-hist-dp ${won ? "pvp-hist-dp-w" : "pvp-hist-dp-l"}`}>
                      {dp >= 0 ? "+" : ""}{dp} DP
                    </div>
                    <div className="pvp-hist-time">{relativeTime(f.fightAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {data?.totalPages > 1 && (
            <div className="pvp-pagination">
              <button
                className="pvp-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                {t("pvp.history.prevBtn")}
              </button>
              <span className="pvp-page-info">{t("pvp.history.pageInfo", { page, total: data.totalPages })}</span>
              <button
                className="pvp-page-btn"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
              >
                {t("pvp.history.nextBtn")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
