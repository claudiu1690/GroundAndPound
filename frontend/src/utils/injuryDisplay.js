/**
 * Format the remaining auto-heal time for an injury.
 *
 * The backend cron decrements `recoveryDaysLeft` once per 24h and advances
 * `recoveryLastTickAt`. The exact heal moment is therefore:
 *   recoveryLastTickAt + recoveryDaysLeft * 24h
 *
 * Returns a short human-readable string like "4d 12h", "8h", "23m" or "any moment".
 */
export function formatRecoveryRemaining(injury) {
    if (!injury) return "";
    const days = injury.recoveryDaysLeft || 0;
    if (days <= 0) return "any moment";

    const anchor = injury.recoveryLastTickAt || injury.sustainedAt;
    const anchorMs = anchor ? new Date(anchor).getTime() : NaN;
    if (!Number.isFinite(anchorMs)) {
        // Legacy / missing anchor — fall back to a coarse day count.
        return `${days}d`;
    }

    const healAt = anchorMs + days * 86_400_000;
    const remainingMs = healAt - Date.now();
    if (remainingMs <= 0) return "any moment";

    const totalMinutes = Math.floor(remainingMs / 60_000);
    const d = Math.floor(totalMinutes / (60 * 24));
    const h = Math.floor((totalMinutes % (60 * 24)) / 60);
    const m = totalMinutes % 60;

    if (d > 0 && h > 0) return `${d}d ${h}h`;
    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;
    if (m > 0) return `${m}m`;
    return "<1m";
}
