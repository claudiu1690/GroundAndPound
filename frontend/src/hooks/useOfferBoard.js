import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * Reroll mutation only, no board state of its own. Used directly by
 * DashboardTab (which gets its offers/board display data from useDashboard,
 * not from GET /fights/offers) and composed into useOfferBoard below (used by
 * the Fight Hub, which browses the full board).
 *
 * @returns {{ reroll: () => Promise<{ok:true,cashAfter,offers,board}|{ok:false,code,message}>,
 *             rerolling: boolean, rerollError: string|null, clearError: () => void }}
 */
export function useOfferReroll(fighterId) {
  const [rerolling, setRerolling] = useState(false);
  const [rerollError, setRerollError] = useState(null);

  const reroll = useCallback(async () => {
    if (!fighterId) return { ok: false, code: null, message: "No fighter loaded" };
    setRerolling(true);
    setRerollError(null);
    try {
      const res = await api.rerollOffers(fighterId);
      setRerolling(false);
      return { ok: true, cashAfter: res.cashAfter, offers: res.offers, board: res.board };
    } catch (e) {
      const message = e?.message || "Reroll failed. Try again.";
      setRerollError(message);
      setRerolling(false);
      return { ok: false, code: e?.code || null, message };
    }
  }, [fighterId]);

  const clearError = useCallback(() => setRerollError(null), []);

  return { reroll, rerolling, rerollError, clearError };
}

/**
 * Loads the full fight-offer board for a fighter (GET /fights/offers/:id ->
 * {offers, board}). Used by the Fight Hub (components/fights/FightOffers.jsx),
 * which needs the full BoardOffer array for OfferCard/offerIntel. Home reads
 * its offers off the dashboard payload instead (see useOfferReroll above).
 *
 * Returns { offers, board, loading, error, reload, reroll, rerolling, rerollError }.
 * Fetches on mount and whenever `fighterId`/`refreshKey` change (same
 * cancel-signal pattern as useDashboard). A successful reroll replaces
 * `offers`/`board` locally without a refetch; `OFFER_BOARD_STALE` triggers a
 * full reload instead, since the caller's local board is out of date.
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

  const { reroll: rerollMutation, rerolling, rerollError } = useOfferReroll(fighterId);

  const reroll = useCallback(async () => {
    const res = await rerollMutation();
    if (res.ok) {
      setOffers(Array.isArray(res.offers) ? res.offers : []);
      setBoard(res.board ?? null);
    } else if (res.code === "OFFER_BOARD_STALE") {
      reload();
    }
    return res;
  }, [rerollMutation, reload]);

  return { offers, board, loading, error, reload, reroll, rerolling, rerollError };
}
