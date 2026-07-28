import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * Your Camp (Home Camp, Phase 0) — the ONLY place that calls the camp API.
 *
 * Loads `GET /home-camp/:fighterId` on mount / whenever `fighterId` changes,
 * and exposes mutations that either patch the cached CampState in place
 * (rename, promote — both return enough to do so) or silently reload the
 * full CampState afterwards (train — the train response is a superset of
 * the gym training shape and does NOT carry a full `camp` object, see
 * architect contract §3.3).
 *
 * Request isolation: an in-flight load is cancellable (mirrors useDashboard),
 * so a fast fighter-switch or unmount never lets a stale response clobber
 * newer state.
 *
 * Returns { camp, loading, error, refetch, train, promote, claimPerk, rename,
 * market, marketLoading, marketError, loadMarket, hire, fire, renovate,
 * deepClean }.
 * `camp` is the raw CampState payload (`{ camp, condition, wages, slots,
 * coaches, fallbackSession, market, needs }`) — components read it exactly
 * as documented in the API contract §3.1.
 * `error` / `marketError` are `{ code, message, body }` (never a bare string)
 * so callers can branch on `error.code`, never on the message text. `body` is
 * the full error response so a caller can read whitelisted extras
 * (requiredTier, daysLeft, cost/have, etc.) without re-parsing the message.
 *
 * Phase 1 (Trainer Market): `market` is loaded lazily and kept SEPARATE from
 * `camp` (its own loading/error pair) because it's only fetched when the
 * player opens the market panel — the camp GET only ever predicts
 * `market.candidateCount`, never the full candidate array (contract §4.2).
 * hire/fire/renovate/deepClean all adopt the returned `camp` wholesale (same
 * "promote" pattern as Phase 0) — this hook stays the ONLY camp API caller.
 */
export function useHomeCamp(fighterId) {
  const [camp, setCamp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [market, setMarket] = useState(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState(null);

  const signalRef = useRef(null);
  const marketSignalRef = useRef(null);

  const load = useCallback(
    async (signal, { silent = false } = {}) => {
      if (!fighterId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await api.getHomeCamp(fighterId);
        if (signal?.cancelled) return;
        setCamp(data);
      } catch (e) {
        if (signal?.cancelled) return;
        setError({ code: e.code || null, message: e.message || "Could not load your camp.", body: e.body || null });
      } finally {
        if (!signal?.cancelled && !silent) setLoading(false);
      }
    },
    [fighterId]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    signalRef.current = signal;
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const refetch = useCallback(
    ({ silent = false } = {}) => {
      if (signalRef.current) signalRef.current.cancelled = true;
      const signal = { cancelled: false };
      signalRef.current = signal;
      return load(signal, { silent });
    },
    [load]
  );

  /** PATCH /home-camp/:fighterId/name — patches the cached name in place. */
  const rename = useCallback(
    async (name) => {
      const res = await api.renameHomeCamp(fighterId, name);
      setCamp((prev) => (prev ? { ...prev, camp: { ...prev.camp, name: res.camp.name } } : prev));
      return res;
    },
    [fighterId]
  );

  /**
   * POST /home-camp/:fighterId/train — the response has no `camp` field
   * (it's the gym-train superset), so we silently reload the full CampState
   * afterwards (condition/coach/needs/drills all may have shifted). The raw
   * train result is returned so the caller can build a toast view-model.
   */
  const train = useCallback(
    async ({ coachId = null, drillKey, quantity = 1 } = {}) => {
      const res = await api.trainHomeCamp(fighterId, { coachId, drillKey, quantity });
      await refetch({ silent: true });
      return res;
    },
    [fighterId, refetch]
  );

  /**
   * POST /home-camp/:fighterId/coaches/:coachId/promote — the response
   * carries the full CampState verbatim (contract §3.4), so we can adopt it
   * directly without a second round trip.
   */
  const promote = useCallback(
    async (coachId) => {
      const res = await api.promoteHomeCampCoach(fighterId, coachId);
      if (res?.camp) setCamp(res.camp);
      return res;
    },
    [fighterId]
  );

  /**
   * POST /home-camp/:fighterId/coaches/:coachId/claim-perk — delivers the
   * rank-4 archetype perk owed to a migrated coach (free). Same shape as
   * promote: the response carries the full CampState verbatim, so we adopt
   * it directly. The raw `perkGranted` is returned so the caller can toast it.
   */
  const claimPerk = useCallback(
    async (coachId) => {
      const res = await api.claimHomeCampCoachPerk(fighterId, coachId);
      if (res?.camp) setCamp(res.camp);
      return res;
    },
    [fighterId]
  );

  /**
   * GET /home-camp/:fighterId/market — rolls the week lazily on read
   * (contract §4.2). Kept in its own {market, marketLoading, marketError}
   * trio rather than folded into `camp` because it's a separate, heavier
   * fetch the player only triggers by opening the Trainer Market panel.
   * Cancellable the same way as the main load, so a fast open/close/reopen
   * never lets a stale response clobber a newer one.
   */
  const loadMarket = useCallback(
    async ({ silent = false } = {}) => {
      if (!fighterId) return;
      if (marketSignalRef.current) marketSignalRef.current.cancelled = true;
      const signal = { cancelled: false };
      marketSignalRef.current = signal;
      if (!silent) setMarketLoading(true);
      setMarketError(null);
      try {
        const data = await api.getHomeCampMarket(fighterId);
        if (signal.cancelled) return;
        setMarket(data.market);
      } catch (e) {
        if (signal.cancelled) return;
        setMarketError({ code: e.code || null, message: e.message || "Could not load the Trainer Market.", body: e.body || null });
      } finally {
        if (!signal.cancelled && !silent) setMarketLoading(false);
      }
    },
    [fighterId]
  );

  /**
   * POST /home-camp/:fighterId/market/:candidateId/hire — body {}. The 200
   * carries the full CampState verbatim (contract §3.3), adopted directly.
   * The stored candidate array is authoritative and a hire mutates it
   * (candidate pulled, coach pushed), so any cached `market` is now stale —
   * refreshed silently (never re-throws; a failed refresh just leaves the
   * pre-hire list visible a beat longer) whether the hire succeeded or not,
   * since a lost race (candidate_expired/no_slot/etc.) is itself proof the
   * cached list drifted from the stored one.
   */
  const hire = useCallback(
    async (candidateId) => {
      try {
        const res = await api.hireHomeCampCoach(fighterId, candidateId);
        if (res?.camp) setCamp(res.camp);
        return res;
      } finally {
        loadMarket({ silent: true });
      }
    },
    [fighterId, loadMarket]
  );

  /**
   * DELETE /home-camp/:fighterId/coaches/:coachId — the 200 carries the full
   * CampState verbatim (contract §3.4), adopted directly. Returns the raw
   * `fired` summary (real costs — moraleHitTo, condition before/after,
   * cooldown) so the caller can render the exact, non-predicted result.
   */
  const fire = useCallback(
    async (coachId) => {
      const res = await api.fireHomeCampCoach(fighterId, coachId);
      if (res?.camp) setCamp(res.camp);
      return res;
    },
    [fighterId]
  );

  /**
   * POST /home-camp/:fighterId/renovate — body {}. The 200 carries the full
   * CampState verbatim (contract §3.5); a successful renovation is also the
   * moment the Trainer Market opens, so the caller re-derives the "market is
   * now open" state from the freshly-adopted `camp.market`, not from here.
   */
  const renovate = useCallback(
    async () => {
      const res = await api.renovateHomeCamp(fighterId);
      if (res?.camp) setCamp(res.camp);
      return res;
    },
    [fighterId]
  );

  /**
   * POST /home-camp/:fighterId/deep-clean — body {}. The 200 carries the
   * full CampState verbatim (contract §3.6), adopted directly.
   */
  const deepClean = useCallback(
    async () => {
      const res = await api.deepCleanHomeCamp(fighterId);
      if (res?.camp) setCamp(res.camp);
      return res;
    },
    [fighterId]
  );

  return {
    camp, loading, error, refetch, train, promote, claimPerk, rename,
    market, marketLoading, marketError, loadMarket, hire, fire, renovate, deepClean,
  };
}
