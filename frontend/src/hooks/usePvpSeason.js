import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/**
 * Fetches GET /pvp/season/current/:weightClass
 * Silent-refetch pattern: loading=true only on initial fetch (no prior data).
 * Subsequent refreshes use `refreshing` flag and preserve prior data on screen.
 */
export function usePvpSeason(weightClass) {
  const [data, setData] = useState(null);
  // Starts TRUE when a fetch is going to happen on mount. With `false`, the
  // first render had no data and no loading flag, so PvpHub fell through to the
  // full hub and painted an empty hero for a frame before the fetch even
  // started. Consumers gate on `loading && !data`, so this removes that flash.
  const [loading, setLoading] = useState(Boolean(weightClass));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(
    async ({ silent = false } = {}) => {
      if (!weightClass) { setLoading(false); return; }
      if (silent || data !== null) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await api.pvpCurrentSeason(weightClass);
        setData(res);
      } catch (e) {
        setError(e.message || "Could not load PVP season.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightClass]
  );

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, refreshing, error, silentRefetch: () => fetch({ silent: true }) };
}
