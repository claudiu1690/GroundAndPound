import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { timerColorFor, formatHMS, isFinalHour } from "../lib/countdown";

/**
 * useSeasonBand — fetches GET /pvp/season/public (unauthenticated) and drives
 * the landing page PVP band countdown + auto-flip from upcoming → active.
 *
 * Shape/cleanup discipline mirrors usePvpSeason.js.
 * Timer + poll logic mirrors PreSeasonCountdown.jsx.
 *
 * Returns:
 *   data        — DTO | null  (null on genuine "no season" from the server, or
 *                 the initial load failing; a POLL failure keeps the last
 *                 known-good DTO instead of wiping it — see `error`)
 *   loading     — true only on the FIRST fetch (avoids flicker; fallback renders immediately)
 *   error       — true when the most recent poll failed. Data is stale-but-real
 *                 in that case, not a fallback — callers that want to surface
 *                 "can't reach the server" separately from "no season" can
 *                 check this instead of inferring it from `data === null`.
 *   countdown   — formatted string per spec: "Opening..." | "MM:SS" | "H:MM:SS"
 *   remainingMs — raw ms until startDate (only meaningful when status==="upcoming")
 */
export function useSeasonBand() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  // Ref so the poll cadence effect can read the latest data without being in
  // its dep array (avoids restarting the interval on every data change).
  const dataRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchSeason = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    try {
      const res = await api.pvpPublicSeason();
      // The contract says the server returns the DTO or literal null on 200.
      // request() parses JSON; null → null, DTO → object.
      const dto = res && typeof res === "object" && res.status ? res : null;
      dataRef.current = dto;
      setData(dto);
      setError(false);
      if (dto?.startDate) {
        setRemainingMs(Math.max(0, new Date(dto.startDate) - Date.now()));
      }
    } catch {
      // A poll failure is transient and indistinguishable from "no season" —
      // do NOT wipe last-known-good data, or a single dropped request makes
      // the hero/PVP band regress to hardcoded placeholders mid-session.
      // The initial load has no last-known-good data to protect, so it keeps
      // falling back to null exactly as before.
      setError(true);
      if (initial) {
        dataRef.current = null;
        setData(null);
      }
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  // ── Initial fetch on mount ────────────────────────────────────────────────────
  useEffect(() => {
    fetchSeason({ initial: true });
  }, [fetchSeason]);

  // ── 1-second tick (only ticks down when upcoming) ────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      const d = dataRef.current;
      if (d?.status === "upcoming" && d?.startDate) {
        setRemainingMs(Math.max(0, new Date(d.startDate) - Date.now()));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []); // stable — reads dataRef each tick

  // ── Polling cadence ──────────────────────────────────────────────────────────
  // • upcoming + remaining ≤ 60 000 ms → 5 s (fast flip upcoming → active)
  // • active, null, error              → 30 s (catch season end or new season)
  // • upcoming + remaining > 60 000 ms → 30 s
  //
  // We derive the desired cadence from state; when it changes we clear and
  // restart the interval. pollIntervalRef prevents stacking.
  const isNearZero =
    data?.status === "upcoming" && remainingMs <= 60000;
  const pollMs = isNearZero ? 5000 : 30000;

  useEffect(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      fetchSeason();
    }, pollMs);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [pollMs, fetchSeason]);

  // ── Countdown string ─────────────────────────────────────────────────────────
  const isUpcoming = data?.status === "upcoming";
  const finalHour = isUpcoming && isFinalHour(remainingMs);
  const timerColor = isUpcoming ? timerColorFor(remainingMs) : undefined;

  let countdown = "";
  if (isUpcoming) {
    countdown = remainingMs === 0 ? "Opening..." : formatHMS(remainingMs);
  }

  return { data, loading, error, countdown, remainingMs, timerColor, finalHour };
}
