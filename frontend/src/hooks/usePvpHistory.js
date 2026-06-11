import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/**
 * Fetches GET /pvp/fights/:seasonId?page=&limit=
 * Silent-refetch: loading only on first load (no prior data).
 */
export function usePvpHistory(seasonId, page = 1) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(
    async ({ silent = false } = {}) => {
      if (!seasonId) return;
      if (silent || data !== null) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await api.pvpFights(seasonId, page);
        setData(res);
      } catch (e) {
        setError(e.message || "Could not load fight history.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seasonId, page]
  );

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, refreshing, error, silentRefetch: () => fetch({ silent: true }) };
}
