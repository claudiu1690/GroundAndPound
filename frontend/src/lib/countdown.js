/**
 * Shared season-countdown presentation helpers — one home for the timer's color
 * shift and digit formatting so the landing band, the in-app PreSeasonCountdown,
 * and the dashboard Proving Ground tile all behave identically.
 */

// White → brand-red shift happens over the FINAL 6 HOURS (white before that), so
// the color itself signals "closing in".
export const REDSHIFT_WINDOW_MS = 6 * 3600000;

// Final hour → the timer pulses (see the per-surface CSS).
export const FINAL_HOUR_MS = 3600000;

/**
 * Interpolate the timer color between #F0F0F0 (far out) and #C8102E (at zero)
 * across the final 6 hours. Returns an `rgb(...)` string.
 */
export function timerColorFor(ms) {
  const t = Math.min(1, Math.max(0, ms / REDSHIFT_WINDOW_MS));
  const r = Math.round(200 + (240 - 200) * t);
  const g = Math.round(16 + (240 - 16) * t);
  const b = Math.round(46 + (240 - 46) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** True when the countdown is inside its final hour (and not yet at zero). */
export function isFinalHour(ms) {
  return ms > 0 && ms <= FINAL_HOUR_MS;
}

/**
 * Format remaining ms as the countdown string: `H:MM:SS` at 1h+, `MM:SS`
 * sub-hour. Does NOT handle the zero case — callers decide their own zero label
 * (e.g. "Opening…" vs "00:00").
 */
export function formatHMS(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const p = (n) => String(n).padStart(2, "0");
  return hours === 0 ? `${p(minutes)}:${p(seconds)}` : `${hours}:${p(minutes)}:${p(seconds)}`;
}
