import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/**
 * Loads GET /fighters/:id/profile (the public career profile: fighter,
 * belts[], badges{categories}, pvp). Exposes loading/error/data and a
 * `reload` for the retry button, plus `setProfile` so callers can patch the
 * profile in place after a mutation (e.g. pinning a badge) without a refetch.
 */
export function useCareerProfile(fighterId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!fighterId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await api.getCareerProfile(fighterId);
      setData(res);
    } catch (e) {
      if (!silent) setError(e.message || "Could not load the profile.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fighterId]);

  useEffect(() => { load(); }, [load]);

  return { data, setData, loading, error, reload: load };
}
