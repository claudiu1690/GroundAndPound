import { divisionColor, divisionLabel, wcAbbrev } from "../../pvpConst";

/**
 * PositionCard — pinned "Your Position" card fed by usePvpPosition.
 * Never re-renders on filter change because it's driven by its own hook
 * (passed as the `position` prop, not from the ladder hook).
 *
 * Renders null if position is null.
 *
 * Props:
 *   position  {object|null}  from usePvpPosition
 */
export function PositionCard({ position }) {
  if (!position) return null;

  const {
    name,
    division,
    divisionColor: apiDivColor,
    realWeightClass,
    ovr,
    dp,
    wins,
    losses,
    winStreak,
    streakActive,
    rank,
    nextDivision,
    nextDivisionThreshold,
    divisionFloor,
    dpToPromotion,
    promotionShield,
    shieldActive,
    catchUpActive,
    championRank,
    totalChampions,
    weeksRemaining,
  } = position;

  const isChampion = division === "champion";
  const color = apiDivColor || divisionColor(division);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  // Progress bar percentage
  const floor = divisionFloor ?? 0;
  const threshold = nextDivisionThreshold ?? 0;
  const progressPct =
    threshold > floor
      ? Math.min(100, Math.max(0, ((dp - floor) / (threshold - floor)) * 100))
      : 0;

  const wcDisplay = realWeightClass ? wcAbbrev(realWeightClass) : null;

  return (
    <div className="lt-pos-card">
      <div className="lt-pos-inner">
        <div className="lt-pos-rank-big">#{rank ?? "—"}</div>
        <div className="lt-pos-info">
          <div className="lt-pos-name">
            {name}
            <span className="lt-tag lt-tag-you">You</span>
          </div>
          <div className="lt-pos-meta">
            <span
              className="lt-div-badge"
              style={{
                color,
                background: `rgba(${r},${g},${b},0.12)`,
                border: `1px solid rgba(${r},${g},${b},0.2)`,
              }}
            >
              {divisionLabel(division)}
            </span>
            <span style={{ color: "#555" }}>·</span>
            {wcDisplay && <span>{wcDisplay}</span>}
            {wcDisplay && <span style={{ color: "#555" }}>·</span>}
            <span>OVR {ovr ?? "—"}</span>
            <span style={{ color: "#555" }}>·</span>
            <span>{wins ?? 0}W · {losses ?? 0}L</span>
            {winStreak >= 3 && (
              <>
                <span style={{ color: "#555" }}>·</span>
                <span style={{ color: "#D4A820" }}>🔥 {winStreak}-win streak</span>
              </>
            )}
          </div>
        </div>
        <div className="lt-pos-right">
          <div className="lt-pos-dp-v">{(dp ?? 0).toLocaleString()}</div>
          <div className="lt-pos-dp-l">Division Points</div>
          {streakActive && (
            <div className="lt-pos-streak">×1.25 multiplier active</div>
          )}
          {catchUpActive && (
            <div className="lt-pos-catchup">×2 catch-up active</div>
          )}
          {(shieldActive || promotionShield > 0) && (
            <div className="lt-pos-shield">🛡 Shield active</div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!isChampion && nextDivision && (
        <>
          <div className="lt-pos-bar-track">
            <div className="lt-pos-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="lt-pos-bar-foot">
            <span>
              {(dp ?? 0).toLocaleString()} / {(nextDivisionThreshold ?? 0).toLocaleString()} DP to {divisionLabel(nextDivision)}
            </span>
            <span>{(dpToPromotion ?? 0).toLocaleString()} DP needed</span>
          </div>
        </>
      )}

      {/* Champion branch */}
      {isChampion && (
        <div className="lt-pos-bar-foot">
          <span>{(dp ?? 0).toLocaleString()} DP</span>
          {championRank != null && (
            <span>
              {championRank} of {totalChampions} Champion
              {weeksRemaining != null ? ` · ${weeksRemaining} weeks remaining` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
