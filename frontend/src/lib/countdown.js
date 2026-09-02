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

// Formats a Date/ISOstring as "Mon D, YYYY" e.g. "Jul 4, 2026"
export function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Formats a Date/ISOstring as "Mon D" e.g. "Jul 4"
export function formatDateShort(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Splits a countdown into day/hour/minute cells.
 * useSeasonBand's `countdown` string is H:MM:SS, which stops reading as a
 * countdown past ~48h — a season tease is usually weeks out, so days matter.
 */
export function countdownCells(isoStr) {
  const ms = Math.max(0, new Date(isoStr) - Date.now());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return [
    { n: String(days).padStart(2, "0"), l: days === 1 ? "Day" : "Days" },
    { n: String(hours).padStart(2, "0"), l: "Hours" },
    { n: String(mins).padStart(2, "0"), l: "Mins" },
  ];
}

// Whole days until an ISO date, ceiled so any remaining time still reads as
// at least 1 day (never shows 0 while time is left), floored at 0 past it.
export function daysUntil(isoStr) {
  return Math.max(0, Math.ceil((new Date(isoStr) - Date.now()) / 86400000));
}

/**
 * Weeks-remaining label for an ISO end date ("Final Week" | "N Weeks
 * Remaining"), derived from the SAME day count as daysUntil() so the hero's
 * "Days Left" and the PVP band's weeks pill can never disagree at a boundary
 * (e.g. "7 Days Left" up top can never pair with "Final Week" below — 7 days
 * or fewer IS the final week).
 */
export function weeksLeftLabel(isoStr) {
  const days = daysUntil(isoStr);
  if (days <= 7) return "Final Week";
  const weeks = Math.ceil(days / 7);
  return `${weeks} Weeks Remaining`;
}
