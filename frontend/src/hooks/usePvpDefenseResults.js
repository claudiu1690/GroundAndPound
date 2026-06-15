import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/**
 * Fetches GET /pvp/defense-results with ack=false (peek — does not mark seen).
 * The unread state is only cleared when the user explicitly clicks "View defense report"
 * in the OfflineDefenseBanner, which calls api.pvpDefenseResults(true) directly.
 * Silent-refetch: loading only on first load (no prior data).
 */
export function usePvpDefenseResults() {
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
      const res = await api.pvpDefenseResults(false);
      setData(res);
    } catch (e) {
      setError(e.message || "Could not load defense results.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, refreshing, error, silentRefetch: () => fetch({ silent: true }) };
}
