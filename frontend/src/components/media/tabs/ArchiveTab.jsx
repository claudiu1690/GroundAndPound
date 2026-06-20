import { useCallback, useEffect, useState } from "react";
import { api } from "../../../api";
import { archiveKindMeta, relativeTime, formatListeners } from "../mediaFormat";
import { t } from "@/lib/i18n";

const FILTERS = [
  { key: "all",         labelKey: "media.archive.filters.all" },
  { key: "podcast",     labelKey: "media.archive.filters.podcast" },
  { key: "postfight",   labelKey: "media.archive.filters.postfight" },
  { key: "appearances", labelKey: "media.archive.filters.appearances" },
];

function entryView(entry) {
  switch (entry.kind) {
    case "podcast":
      return {
        pill: t("media.archive.podcastPill", { n: entry.episodeNumber }),
        title: `"${entry.title}"`,
        sub: [
          (entry.segments || []).join(" · "),
          entry.listenersAtTime != null ? `${formatListeners(entry.listenersAtTime)} ${t("media.archive.listenersLabel")}` : null,
        ].filter(Boolean).join(" · "),
        reward: rewardStr(entry.fameEarned, entry.cashEarned),
      };
    case "postfight":
      return {
        pill: t("media.archive.pills.postfight"),
        title: t("media.archive.postfightTitle", { opponent: entry.opponentName }),
        sub: [
          entry.outcome,
          entry.choice ? `${entry.choice}` : null,
        ].filter(Boolean).join(" · "),
        reward: rewardStr(entry.fameEarned),
      };
    case "appearance":
      return {
        pill: t("media.archive.pills.appearance"),
        title: entry.label || entry.appearanceType,
        sub: entry.appearanceType ? entry.appearanceType.replace(/_/g, " ").toLowerCase() : "",
        reward: rewardStr(entry.fameEarned, entry.cashEarned),
      };
    case "documentary":
      return {
        pill: t("media.archive.pills.documentary"),
        title: t("media.archive.docTitle"),
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
        if (alive) setError(e.message || t("media.archive.error"));
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
      onMessage?.(e.message || t("media.archive.loadMoreError"));
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
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* Full "Loading…" only on the first load; a filter switch keeps the
          current list visible and swaps it in when the new page arrives. */}
      {loading && entries.length === 0 && <div className="media-state">{t("media.archive.loading")}</div>}
      {!loading && error && (
        <div className="media-state media-state--error">
          {error}
          <button type="button" className="media-mini-btn" onClick={() => setFilter((x) => x)}>{t("common.retry")}</button>
        </div>
      )}
      {!loading && !error && entries.length === 0 && (
        <div className="media-state">{t("media.archive.empty")}</div>
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
                {loadingMore ? t("media.archive.loadingMore") : t("media.archive.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
