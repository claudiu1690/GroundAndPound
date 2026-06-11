import { X, RotateCcw } from "lucide-react";
import { divisionColor, divisionLabel, OPEN_LABEL, seasonWeightClassLabel } from "./pvpConst";

/**
 * Screen 5 — Season End Modal.
 * Shown when GET /pvp/season/current returns justEnded === true.
 *
 * lastSeasonRecord shape (from contract §3.9 new fields — exact names):
 *   seasonId, seasonNumber, seasonName, weightClass,
 *   division, divisionColor, dp, rank, isBeltHolder,
 *   rewards: { iron, fame, drinks, badge },
 *   newDivision, newDp
 *
 * nextSeason is the now-active current season object (for the twist preview).
 */
export function SeasonEndModal({ lastSeasonRecord, nextSeason, onClose, onViewLeaderboard, onStartNewSeason }) {
  if (!lastSeasonRecord) return null;

  const {
    seasonNumber, seasonName, weightClass,
    division, divisionColor: apiDivColor, dp, rank, isBeltHolder,
    rewards,
    newDivision, newDp,
    wins, losses,
  } = lastSeasonRecord;

  // Prefer the API-embedded color; fall back to the local mirror.
  const divCol = apiDivColor || divisionColor(division);
  // The ended season's weight-class identity — use OPEN_LABEL when it was an
  // Open season (identified by weightClass === "Open" on the record).
  const endedSeasonWcLabel = weightClass === "Open" ? OPEN_LABEL : weightClass;
  // Reset landing spot comes directly from the backend — no local SOFT_RESET lookup needed.
  const resetDiv = newDivision ?? "prospect";
  const resetColor = divisionColor(resetDiv);

  // Rewards: use backend-provided object (already computed by finalizeSeason).
  // Fall back to zeros if absent so renders don't crash during development.
  const iron   = rewards?.iron   ?? 0;
  const fame   = rewards?.fame   ?? 0;
  const drinks = rewards?.drinks ?? 0;
  const badge  = rewards?.badge  ?? null;

  // New onboarding fields — present only when this is the player's first completed season.
  const firstSeasonBonusPaid = lastSeasonRecord?.firstSeasonBonusPaid ?? false;
  const firstSeasonBonus = lastSeasonRecord?.firstSeasonBonus ?? null;

  const nextSeasonNumber = (seasonNumber ?? 0) + 1;

  return (
    <div className="pvp-modal-overlay">
      <div className="pvp-modal">
        <div className="pvp-modal-stripe" />
        <div className="pvp-modal-header">
          <div>
            <div className="pvp-modal-eye">Season Over</div>
            <div className="pvp-modal-title">
              Season {seasonNumber}{seasonName ? ` — ${seasonName}` : ""}
            </div>
            <div className="pvp-modal-season">Final results · {endedSeasonWcLabel} Division</div>
          </div>
          <button className="pvp-modal-close" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="pvp-modal-body">
          {/* Finish card */}
          <div className="pvp-finish-card">
            <div className="pvp-finish-badge">
              <span
                className="pvp-div-badge"
                style={{ color: divCol, background: `${divCol}20`, border: `1px solid ${divCol}40`, display: "block", marginBottom: 6 }}
              >
                {divisionLabel(division)}
              </span>
              {/* rank is now provided by backend — always render when present */}
              {rank != null && (
                <>
                  <div className="pvp-finish-rank">#{rank}</div>
                  <div className="pvp-finish-rank-lbl">Final rank</div>
                </>
              )}
            </div>
            <div className="pvp-finish-info">
              {(wins != null && losses != null) && (
                <div className="pvp-finish-record">
                  Season record: <strong>{wins}W · {losses}L</strong>
                  {wins + losses > 0 ? ` · ${Math.round((wins / (wins + losses)) * 100)}% win rate` : ""}
                </div>
              )}
              <div className="pvp-finish-rewards">
                {iron > 0 && (
                  <div className="pvp-reward-line pvp-reward-line-cash">
                    {iron.toLocaleString()} cash earned
                  </div>
                )}
                {fame > 0 && (
                  <div className="pvp-reward-line pvp-reward-line-fame">
                    +{fame.toLocaleString()} fame earned
                  </div>
                )}
                {drinks > 0 && (
                  <div className="pvp-reward-line pvp-reward-line-drinks">
                    {drinks} Energy Drink{drinks !== 1 ? "s" : ""} earned
                  </div>
                )}
                {badge && (
                  <div className="pvp-reward-line">
                    Season {seasonNumber} {divisionLabel(division)} Badge unlocked
                  </div>
                )}
                {/* First Season Bonus — shown only when flag is set */}
                {firstSeasonBonusPaid && (
                  <div className="pvp-first-season-bonus-row">
                    <span className="pvp-fsb-label">First Season Bonus</span>
                    <span className="pvp-fsb-value">
                      +{(firstSeasonBonus?.iron ?? 500).toLocaleString()} cash &middot; +{(firstSeasonBonus?.fame ?? 100).toLocaleString()} fame
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Belt-holder callout */}
          {isBeltHolder && (
            <div style={{ background: "rgba(212,168,32,0.06)", border: "1px solid rgba(212,168,32,0.2)", borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>🏆</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 13, textTransform: "uppercase", color: "#D4A820", marginBottom: 2 }}>
                  Season Belt Holder
                </div>
                <div style={{ fontSize: 12, color: "#AAAAAA" }}>
                  You held the belt at season end · Hall of Fame entry earned
                </div>
              </div>
            </div>
          )}

          {/* Placement for next season */}
          <div className="pvp-placement-card">
            <div className="pvp-placement-header">
              <div className="pvp-placement-title">Season {nextSeasonNumber} Placement</div>
              {nextSeason?.name && (
                <div className="pvp-placement-season">{nextSeason.name} · starts soon</div>
              )}
            </div>
            <div className="pvp-placement-row">
              <div className="pvp-placement-arrow">
                <span
                  className="pvp-div-badge pvp-from-div"
                  style={{ color: divCol, background: `${divCol}20`, border: `1px solid ${divCol}40` }}
                >
                  {divisionLabel(division)}
                </span>
                <span className="pvp-arrow-icon">→</span>
                <span
                  className="pvp-div-badge pvp-from-div"
                  style={{ color: resetColor, background: `${resetColor}20`, border: `1px solid ${resetColor}40` }}
                >
                  {divisionLabel(resetDiv)}
                </span>
              </div>
              {newDp != null && (
                <div className="pvp-placement-dp">
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "#F0F0F0", lineHeight: 1 }}>
                    {newDp.toLocaleString()} DP
                  </div>
                  <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase" }}>
                    Starting DP
                  </div>
                </div>
              )}
            </div>
            <div className="pvp-placement-note">
              You drop divisions but carry forward experience and badges.
            </div>
          </div>

          {/* Next season twist preview */}
          {nextSeason && (
            <div className="pvp-next-season-card">
              <div className="pvp-ns-header">
                <div className="pvp-ns-title">
                  Season {nextSeason.seasonNumber}{nextSeason.name ? ` — ${nextSeason.name}` : ""}
                </div>
              </div>
              <div className="pvp-ns-season-name">10 weeks · {seasonWeightClassLabel(nextSeason) ?? weightClass} · Belt unclaimed</div>
              {nextSeason.twistName && (
                <div className="pvp-ns-twist">
                  <div className="pvp-ns-twist-text">
                    <strong>Season twist: {nextSeason.twistName}.</strong>{" "}
                    {nextSeason.twistEffect ?? ""}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reset note */}
          <div className="pvp-reset-note">
            <RotateCcw size={14} strokeWidth={2} className="pvp-rn-icon" />
            <div className="pvp-rn-text">
              <strong>Season {nextSeasonNumber} soft reset:</strong> You finished{" "}
              {divisionLabel(division)}, so you start Season {nextSeasonNumber} in{" "}
              <strong>{divisionLabel(resetDiv)}</strong>. Your badges and career stats carry over.
            </div>
          </div>
        </div>

        <div className="pvp-modal-footer">
          <button className="pvp-mf-btn pvp-mf-btn-sec" onClick={onViewLeaderboard}>
            View Leaderboard
          </button>
          <button className="pvp-mf-btn pvp-mf-btn-prim" onClick={onStartNewSeason}>
            Start Season {nextSeasonNumber}
          </button>
        </div>
      </div>
    </div>
  );
}
