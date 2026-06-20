import { LadderRow } from "./LadderRow";
import { t } from "../../../../lib/i18n";

/**
 * LadderTable — column header + rows + Load More block.
 *
 * Grid: 48px 1fr 88px 82px 52px 96px
 *   #  |  Fighter  |  DP  |  Record  |  OVR  |  Last Active
 *
 * Props:
 *   rows           {array}
 *   total          {number}
 *   hasMore        {bool}
 *   loading        {bool}    initial load
 *   loadingMore    {bool}    pagination load
 *   error          {string|null}
 *   loadMore       {fn}
 *   season         {object}
 *   onOpenProfile  {fn}
 *   division       {string|null}  currently filtered division (for empty message)
 */
export function LadderTable({
  rows,
  total,
  hasMore,
  loading,
  loadingMore,
  error,
  loadMore,
  season,
  onOpenProfile,
  division,
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="lt-table">
        <div className="lt-empty">{t("pvp.ladder.tableLoadingLadder")}</div>
      </div>
    );
  }

  if (error && rows.length === 0) {
    return (
      <div className="lt-table">
        <div className="lt-empty lt-empty-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="lt-table">
      {/* Column headers */}
      <div className="lt-head">
        <div className="lt-head-cell">{t("pvp.ladder.tableColRank")}</div>
        <div className="lt-head-cell">{t("pvp.ladder.tableColFighter")}</div>
        <div className="lt-head-cell lt-head-r">{t("pvp.ladder.tableColDp")}</div>
        <div className="lt-head-cell lt-head-r">{t("pvp.ladder.tableColRecord")}</div>
        <div className="lt-head-cell lt-head-r">{t("pvp.ladder.tableColOvr")}</div>
        <div className="lt-head-cell lt-head-r">{t("pvp.ladder.tableColLastActive")}</div>
      </div>

      {/* Rows */}
      {rows.length === 0 && !loading ? (
        <div className="lt-empty">
          {division
            ? t("pvp.ladder.tableNoFightersDiv", { division: division.charAt(0).toUpperCase() + division.slice(1) })
            : t("pvp.ladder.tableNoFighters")}
        </div>
      ) : (
        rows.map((row) => (
          <LadderRow
            key={row.playerId}
            row={row}
            season={season}
            onOpenProfile={onOpenProfile}
          />
        ))
      )}

      {/* Load More block */}
      {hasMore && (
        <>
          <div className="lt-sep">
            <span className="lt-sep-text">· · · {t("pvp.ladder.loadMoreSep", { n: total - rows.length })} · · ·</span>
          </div>
          <div className="lt-load-more-wrap">
            <button
              className="lt-load-more-btn"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? t("pvp.ladder.loadingMoreBtn") : t("pvp.ladder.loadMoreBtn")}
            </button>
          </div>
        </>
      )}

      {/* Inline error after initial rows are shown */}
      {error && rows.length > 0 && (
        <div className="lt-empty lt-empty-error">{error}</div>
      )}
    </div>
  );
}
