/**
 * Shared PvP season helpers. Pure functions — no React, no I/O.
 */

/**
 * Human countdown to a season end timestamp. Guards a missing / invalid date.
 *   formatSeasonCountdown(ends_at) → "5d" | "18h" | "42m" | "ending" | null
 */
export function formatSeasonCountdown(endsAt) {
    if (!endsAt) return null;
    const ms = new Date(endsAt).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    if (ms <= 0) return "ending";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}

/**
 * Header label: "Season 3 · ends in 5d". Returns null when there's no usable
 * season data so the caller can render nothing (graceful blank).
 */
export function seasonHeaderLabel(season) {
    if (!season) return null;
    const n = season.season_number;
    const countdown = formatSeasonCountdown(season.ends_at);
    const prefix = n != null ? `Season ${n}` : "Season";
    if (!countdown) return n != null ? prefix : null;
    if (countdown === "ending") return `${prefix} · ending soon`;
    return `${prefix} · ends in ${countdown}`;
}
