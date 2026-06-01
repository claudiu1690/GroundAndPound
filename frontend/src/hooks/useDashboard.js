import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * Loads the home/dashboard payload for a fighter.
 *
 * Returns { data, loading, error, reload }. Fetches on mount and whenever
 * `fighterId` or `refreshKey` change. Manages all three states (loading /
 * success / error) so callers can render defensively — the backend endpoint
 * is built in parallel against a frozen shape, so every field may be missing.
 */
export function useDashboard(fighterId, { refreshKey } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (signal) => {
      if (!fighterId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getDashboard(fighterId);
        if (signal?.cancelled) return;
        setData(res ?? null);
      } catch (e) {
        if (signal?.cancelled) return;
        setError(e?.message || "Failed to load dashboard");
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [fighterId]
  );

  // Tracks the latest in-flight request so reload() (and unmount) can cancel it.
  const signalRef = useRef(null);

  useEffect(() => {
    const signal = { cancelled: false };
    signalRef.current = signal;
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load, refreshKey]);

  const reload = useCallback(() => {
    if (signalRef.current) signalRef.current.cancelled = true;
    const signal = { cancelled: false };
    signalRef.current = signal;
    load(signal);
  }, [load]);

  useEffect(() => () => {
    if (signalRef.current) signalRef.current.cancelled = true;
  }, []);

  return { data, loading, error, reload };
}
