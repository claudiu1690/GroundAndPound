import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/**
 * usePvpPosition(seasonId)
 * Fetches GET /pvp/ladder/position?seasonId=
 * Exposes { position, loading, error, refetch }
 */
export function usePvpPosition(seasonId) {
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(
    async ({ silent = false } = {}) => {
      if (!seasonId) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await api.pvpLadderPosition(seasonId);
        setPosition(res.position ?? null);
      } catch (e) {
        if (!silent) setError(e.message || "Could not load your position.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [seasonId]
  );

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { position, loading, error, refetch: fetch };
}
