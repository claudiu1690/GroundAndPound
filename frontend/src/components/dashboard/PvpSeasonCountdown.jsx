import { useEffect, useState } from "react";
import { timerColorFor, formatHMS, isFinalHour } from "../../lib/countdown";

/**
 * Compact pre-season countdown for the dashboard Proving Ground tile. Ticks
 * every second and reuses the shared countdown helpers so its color shift +
 * final-hour pulse match the landing band and the in-app hub exactly.
 */
export function PvpSeasonCountdown({ startsAt }) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(startsAt) - Date.now())
  );

  useEffect(() => {
    setRemainingMs(Math.max(0, new Date(startsAt) - Date.now()));
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(startsAt) - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [startsAt]);

  const isZero = remainingMs === 0;
  const finalHour = isFinalHour(remainingMs);

  return (
    <div className="pvp-countdown-mini">
      <div className="pvp-countdown-mini-label">Opens in</div>
      <div
        className={`pvp-countdown-mini-timer${finalHour ? " pvp-countdown-mini-timer--final" : ""}`}
        style={isZero ? undefined : { color: timerColorFor(remainingMs) }}
      >
        {isZero ? "Opening…" : formatHMS(remainingMs)}
      </div>
    </div>
  );
}
