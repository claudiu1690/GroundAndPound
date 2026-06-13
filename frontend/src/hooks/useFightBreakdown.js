import { useState, useRef, useEffect } from "react";
import { api } from "../api.js";

/**
 * useFightBreakdown({ fightId, kind } | null)
 * Fetches fight breakdown data for the given fight.
 * - kind "pve" → GET /fights/:fightId/breakdown
 * - kind "pvp" → GET /pvp/fights/by-id/:fightId/breakdown
 * Caches results per fightId in a ref Map: re-opening the same fight
 * shows instantly with no re-fetch.
 * Returns { data, loading, error }
 */
export function useFightBreakdown(openFight) {
  const cache = useRef(new Map());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!openFight?.fightId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const { fightId, kind } = openFight;

    // Instant cache hit
    if (cache.current.has(fightId)) {
      setData(cache.current.get(fightId));
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    const fetcher = kind === "pvp"
      ? api.pvpFightBreakdown(fightId)
      : api.getFightBreakdown(fightId);

    fetcher
      .then((result) => {
        if (cancelled) return;
        cache.current.set(fightId, result);
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load fight breakdown.");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [openFight?.fightId, openFight?.kind]);

  return { data, loading, error };
}
