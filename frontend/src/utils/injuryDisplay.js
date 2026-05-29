/**
 * Format the remaining auto-heal time for an injury.
 *
 * The backend ticks `recoveryHoursLeft` once per hour and advances
 * `recoveryLastTickAt`. The exact heal moment is therefore:
 *   recoveryLastTickAt + recoveryHoursLeft * 1h
 *
 * Legacy fallback: pre-migration injuries may still carry `recoveryDaysLeft`.
 * Read it as 24× hours so the display works while the backend gradually
 * migrates documents on next tick.
 *
 * Returns a short human-readable string like "18h", "5h 12m", "23m" or "any moment".
 */
export function formatRecoveryRemaining(injury) {
    if (!injury) return "";
    const hours = (injury.recoveryHoursLeft && injury.recoveryHoursLeft > 0)
        ? injury.recoveryHoursLeft
        : ((injury.recoveryDaysLeft || 0) * 24);
    if (hours <= 0) return "any moment";

    const anchor = injury.recoveryLastTickAt || injury.sustainedAt;
    const anchorMs = anchor ? new Date(anchor).getTime() : NaN;
    if (!Number.isFinite(anchorMs)) {
        // Legacy / missing anchor — fall back to a coarse hour count.
        return `${hours}h`;
    }

    const healAt = anchorMs + hours * 3_600_000;
    const remainingMs = healAt - Date.now();
    if (remainingMs <= 0) return "any moment";

    const totalMinutes = Math.floor(remainingMs / 60_000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    if (m > 0) return `${m}m`;
    return "<1m";
}
