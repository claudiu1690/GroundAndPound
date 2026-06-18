import { LadderRow } from "./LadderRow";

/**
 * LadderTable — column header + rows + Load More block.
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
        <div className="lt-empty">Loading ladder…</div>
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
        <div className="lt-head-cell">#</div>
        <div className="lt-head-cell">Fighter</div>
        <div className="lt-head-cell lt-head-r">DP</div>
        <div className="lt-head-cell lt-head-r">Record</div>
        <div className="lt-head-cell lt-head-r">OVR</div>
        <div className="lt-head-cell lt-head-r">Last Active</div>
      </div>

      {/* Rows */}
      {rows.length === 0 && !loading ? (
        <div className="lt-empty">
          {division
            ? `No fighters in ${division.charAt(0).toUpperCase() + division.slice(1)} yet.`
            : "No fighters yet."}
        </div>
      ) : (
        rows.map((row) => (
          <LadderRow
            key={row.playerId}
            row={row}
            season={season}
            onOpenProfile={onOpenProfile}
            showDivisionBadge={division == null}
          />
        ))
      )}

      {/* Load More block */}
      {hasMore && (
        <>
          <div className="lt-sep">
            <span className="lt-sep-text">· · · {total - rows.length} more fighters · · ·</span>
          </div>
          <div className="lt-load-more-wrap">
            <button
              className="lt-load-more-btn"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load More"}
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
