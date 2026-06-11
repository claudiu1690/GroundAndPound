import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/**
 * Fetches GET /pvp/opponents
 * Silent-refetch: loading only on first load (no prior data).
 */
export function usePvpOpponents() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async ({ silent = false } = {}) => {
    if (silent || data !== null) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await api.pvpOpponents();
      setData(res);
    } catch (e) {
      setError(e.message || "Could not load opponents.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, refreshing, error, silentRefetch: () => fetch({ silent: true }) };
}
