import { Users } from "lucide-react";
import { seasonWeightClassLabel } from "./pvpConst";

/**
 * Screen 7 — shown in LadderTab when poolCount < 5.
 * Receives poolCount, beltUnclaimed, season data, and a CTA callback.
 */
export function EmptyState({ season, poolCount = 0, beltUnclaimed = true, onFight }) {
  const weeksLeft = season
    ? Math.max(0, Math.ceil((new Date(season.endDate) - Date.now()) / (7 * 86400000)))
    : null;

  return (
    <div className="pvp-empty-wrap">
      <div className="pvp-empty-hero">
        <div className="pvp-eh-icon">
          <Users size={40} strokeWidth={1.4} />
        </div>
        <div className="pvp-eh-title">
          {season ? `Season ${season.seasonNumber} is Live` : "The Proving Ground"}
        </div>
        <div className="pvp-eh-sub">
          The ladder is empty. You could be the first fighter to claim the belt.
          Everyone starts as a Prospect — the only way is up.
        </div>
      </div>

      <div className="pvp-empty-body">
        <div className="pvp-pool-card">
          <div className="pvp-pc-title">Current Player Pool · {seasonWeightClassLabel(season) ?? ""}</div>
          <div className="pvp-pc-row">
            <span className="pvp-pc-lbl">Active fighters</span>
            <span className="pvp-pc-val pvp-pc-val-grn">{poolCount}</span>
          </div>
          <div className="pvp-pc-row">
            <span className="pvp-pc-lbl">Belt status</span>
            <span className="pvp-pc-val" style={{ color: beltUnclaimed ? "#D4A820" : "#C8102E" }}>
              {beltUnclaimed ? "Unclaimed" : "Claimed"}
            </span>
          </div>
          {weeksLeft !== null && (
            <div className="pvp-pc-row">
              <span className="pvp-pc-lbl">Season ends</span>
              <span className="pvp-pc-val">{weeksLeft} week{weeksLeft !== 1 ? "s" : ""} remaining</span>
            </div>
          )}
        </div>

        <div className="pvp-repeat-note">
          With a small pool, you&apos;ll face the same fighters multiple times.{" "}
          <strong>DP from repeat opponents is reduced</strong> — 50% on the second fight,
          25% on the third+ against the same player each week. Win the right way.
        </div>

        <div className="pvp-first-blood">
          <div className="pvp-fb-text">
            <strong>You&apos;re ranked #1 right now.</strong> No fights yet, no DP either —
            but the belt is sitting there unclaimed. Get in.
          </div>
          <button className="pvp-enter-btn" onClick={onFight}>
            Fight
          </button>
        </div>
      </div>
    </div>
  );
}
