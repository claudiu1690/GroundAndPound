import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * usePvpLadder({ seasonId, division, weightClass })
 *
 * Manages pagination internally:
 * - Filter change → reset page=1, REPLACE rows
 * - loadMore()    → increment page, APPEND rows
 *
 * No flicker on loadMore: prior rows are preserved while the next page loads
 * (tracked via loadingMore, separate from the initial loading flag).
 */
export function usePvpLadder({ seasonId, division, weightClass } = {}) {
  const [rows, setRows] = useState([]);
  const [divisionCounts, setDivisionCounts] = useState(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Track the "current filter key" so stale responses from prior filters are
  // discarded when filters change quickly.
  const filterKey = `${seasonId}|${division ?? ""}|${weightClass ?? ""}`;
  const filterKeyRef = useRef(filterKey);

  const fetchPage = useCallback(
    async (targetPage, isAppend) => {
      if (!seasonId) return;
      const currentKey = filterKeyRef.current;
      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await api.pvpLadder({
          seasonId,
          division: division || undefined,
          weightClass: weightClass || undefined,
          page: targetPage,
          limit: 20,
        });
        // Discard if the filter changed while we were fetching.
        if (filterKeyRef.current !== currentKey) return;
        setTotal(res.total ?? 0);
        setHasMore(res.hasMore ?? false);
        if (res.divisionCounts) setDivisionCounts(res.divisionCounts);
        if (isAppend) {
          setRows((prev) => [...prev, ...(res.rows ?? [])]);
        } else {
          setRows(res.rows ?? []);
        }
      } catch (e) {
        if (filterKeyRef.current !== currentKey) return;
        setError(e.message || "Could not load the ladder.");
      } finally {
        if (filterKeyRef.current === currentKey) {
          if (isAppend) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seasonId, division, weightClass]
  );

  // On filter change: reset page to 1, replace rows.
  useEffect(() => {
    filterKeyRef.current = filterKey;
    setPage(1);
    fetchPage(1, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, true);
  }, [fetchPage, hasMore, loadingMore, page]);

  return { rows, divisionCounts, total, hasMore, loading, loadingMore, error, loadMore };
}
