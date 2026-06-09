import { useCallback, useEffect, useState } from "react";
import { api } from "../../../api";
import { archiveKindMeta, relativeTime, formatListeners } from "../mediaFormat";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "podcast", label: "Podcast" },
  { key: "postfight", label: "Post-fight" },
  { key: "appearances", label: "Appearances" },
];

function entryView(entry) {
  switch (entry.kind) {
    case "podcast":
      return {
        pill: `Podcast Ep ${entry.episodeNumber}`,
        title: `"${entry.title}"`,
        sub: [
          (entry.segments || []).join(" · "),
          entry.listenersAtTime != null ? `${formatListeners(entry.listenersAtTime)} listeners` : null,
        ].filter(Boolean).join(" · "),
        reward: rewardStr(entry.fameEarned, entry.cashEarned),
      };
    case "postfight":
      return {
        pill: "Post-fight",
        title: `Interview — vs ${entry.opponentName}`,
        sub: [
          entry.outcome,
          entry.choice ? `${entry.choice}` : null,
        ].filter(Boolean).join(" · "),
        reward: rewardStr(entry.fameEarned),
      };
    case "appearance":
      return {
        pill: "Appearance",
        title: entry.label || entry.appearanceType,
        sub: entry.appearanceType ? entry.appearanceType.replace(/_/g, " ").toLowerCase() : "",
        reward: rewardStr(entry.fameEarned, entry.cashEarned),
      };
    case "documentary":
      return {
        pill: "Documentary",
        title: "Career Documentary",
        sub: (entry.choices ? Object.values(entry.choices) : []).join(" · "),
        reward: rewardStr(entry.reward?.fame, entry.reward?.cash),
      };
    default:
      return { pill: entry.kind, title: "", sub: "", reward: "" };
  }
}

function rewardStr(fame, cash) {
  const parts = [];
  if (fame) parts.push(`+${fame} fame`);
  if (cash) parts.push(`+$${cash}`);
  return parts.join(" ");
}

export function ArchiveTab({ fighter, onMessage }) {
  const fighterId = fighter?._id;
  const [filter, setFilter] = useState("all");
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = useCallback(async (f, p) => {
    return api.getArchive(fighterId, f, p);
  }, [fighterId]);

  // Initial / filter-change load — always resets to page 1.
  useEffect(() => {
    if (!fighterId) return;
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetchPage(filter, 1);
        if (!alive) return;
        setEntries(res.entries || []);
        setPage(res.page || 1);
        setHasMore(!!res.hasMore);
      } catch (e) {
        if (alive) setError(e.message || "Could not load the archive.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fighterId, filter, fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetchPage(filter, next);
      setEntries((prev) => [...prev, ...(res.entries || [])]);
      setPage(res.page || next);
      setHasMore(!!res.hasMore);
    } catch (e) {
      onMessage?.(e.message || "Could not load more entries.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, filter, fetchPage, onMessage]);

  return (
    <div className="media-pane">
      <div className="media-arch-filters">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            className={`media-arch-f${filter === f.key ? " act" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Full "Loading…" only on the first load; a filter switch keeps the
          current list visible and swaps it in when the new page arrives. */}
      {loading && entries.length === 0 && <div className="media-state">Loading archive…</div>}
      {!loading && error && (
        <div className="media-state media-state--error">
          {error}
          <button type="button" className="media-mini-btn" onClick={() => setFilter((x) => x)}>Retry</button>
        </div>
      )}
      {!loading && !error && entries.length === 0 && (
        <div className="media-state">Nothing logged here yet. Record podcasts, take appearances and give interviews to fill your archive.</div>
      )}

      {entries.length > 0 && (
        <>
          <div className="media-arch-list">
            {entries.map((entry, i) => {
              const meta = archiveKindMeta(entry);
              const v = entryView(entry);
              return (
                <div key={`${entry.kind}-${i}-${entry.date}`} className="media-arch-row">
                  <div className="media-arch-stripe" style={{ background: meta.color }} />
                  <div className="media-arch-body">
                    <div className="media-arch-top">
                      <span className={`media-arch-pill ${meta.pillClass}`}>{v.pill}</span>
                      <span className="media-arch-title">{v.title}</span>
                    </div>
                    {v.sub && <div className="media-arch-sub">{v.sub}</div>}
                  </div>
                  <div className="media-arch-right">
                    {v.reward && <div className="media-arch-reward">{v.reward}</div>}
                    <div className="media-arch-time">{relativeTime(entry.date)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="media-arch-more">
              <button type="button" className="media-mini-btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
