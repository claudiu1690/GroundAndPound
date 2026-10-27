import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * Loads the full fight-offer board for a fighter (GET /fights/offers/:id ->
 * {offers, board}). Used by the Fight Hub (components/fights/FightOffers.jsx),
 * which needs the full BoardOffer array for OfferCard/offerIntel. Home reads
 * its offers off the dashboard payload instead.
 *
 * Returns { offers, board, loading, error, reload }.
 * Fetches on mount and whenever `fighterId`/`refreshKey` change (same
 * cancel-signal pattern as useDashboard).
 */
export function useOfferBoard(fighterId, { refreshKey } = {}) {
  const [offers, setOffers] = useState([]);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (signal) => {
      if (!fighterId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getOffers(fighterId);
        if (signal?.cancelled) return;
        setOffers(Array.isArray(res?.offers) ? res.offers : []);
        setBoard(res?.board ?? null);
      } catch (e) {
        if (signal?.cancelled) return;
        setError(e?.message || "Failed to load your bookings");
        setOffers([]);
        setBoard(null);
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [fighterId]
  );

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

  return { offers, board, loading, error, reload };
}
