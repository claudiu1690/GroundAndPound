import { divisionColor, divisionLabel, wcAbbrev, tierTrackSegments } from "../../pvpConst";
import { t } from "../../../../lib/i18n";

/**
 * PositionCard — pinned "Your Season" card fed by usePvpPosition.
 * Never re-renders on filter change because it's driven by its own hook.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  #rank │ vdiv │ name/tags/meta  │ vdiv │ dp block  │
 *   ├─────────────────────────────────────────────────────┤
 *   │  multi-tier track (5 segments)                      │
 *   │  tier labels                                        │
 *   │  foot: dp/threshold · dpToPromotion                 │
 *   └─────────────────────────────────────────────────────┘
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
    overallRank,
    nextDivision,
    nextDivisionThreshold,
    divisionFloor,
    dpToPromotion,
    shieldActive,
    catchUpActive,
    championRank,
    totalChampions,
    weeksRemaining,
    fightingStyle,
  } = position;

  const isChampion = division === "champion";
  const color = apiDivColor || divisionColor(division);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const wcDisplay = realWeightClass ? wcAbbrev(realWeightClass) : null;

  const shieldTip = t("pvp.ladder.shieldTip");

  // ── Multi-tier track segments ────────────────────────────────────────────
  const segments = tierTrackSegments(dp ?? 0, division);

  // Boundary between the current tier and the next = the right edge of the current
  // segment, as a % across the whole track. The "DP needed" marker sits here so it
  // reads as "this much DP to enter the next division" right where that tier begins.
  const totalWeight = segments.reduce((s, x) => s + (x.weight || 0), 0) || 1;
  let boundaryPct = null;
  let cumWeight = 0;
  for (const seg of segments) {
    cumWeight += seg.weight || 0;
    if (seg.state === "current") {
      boundaryPct = (cumWeight / totalWeight) * 100;
      break;
    }
  }

  // ── Tier labels line — current tier highlighted in division color ─────────
  // For the "current" tier we use its own color; others are dimmed.

  return (
    <div className="lt-pos-card">
      {/* Top row: rank · vdiv · info · vdiv · dp */}
      <div className="lt-pos-inner">
        {/* Big rank — overall standing across ALL divisions in the season pool */}
        <div className="lt-pos-rank-big">#{overallRank ?? rank ?? "—"}</div>

        {/* Vertical divider */}
        <div className="lt-pos-vdiv" aria-hidden="true" />

        {/* Name / tags / meta */}
        <div className="lt-pos-info">
          <div className="lt-pos-name">
            {name}
            <span className="lt-tag lt-tag-you">{t("pvp.ladder.youTag")}</span>
            {winStreak >= 3 && (
              <span className="lt-tag lt-tag-streak">🔥 {winStreak}-win streak</span>
            )}
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
            {wcDisplay && (
              <>
                <span style={{ color: "#555" }}>·</span>
                <span>{wcDisplay}</span>
              </>
            )}
            {fightingStyle && (
              <>
                <span style={{ color: "#555" }}>·</span>
                <span>{fightingStyle}</span>
              </>
            )}
            <span style={{ color: "#555" }}>·</span>
            <span>OVR {ovr ?? "—"}</span>
            <span style={{ color: "#555" }}>·</span>
            <span>{wins ?? 0}W · {losses ?? 0}L</span>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="lt-pos-vdiv" aria-hidden="true" />

        {/* DP block */}
        <div className="lt-pos-right">
          <div className="lt-pos-dp-v">{(dp ?? 0).toLocaleString()}</div>
          <div className="lt-pos-dp-l">{t("pvp.ladder.divisionPoints")}</div>
          {streakActive && (
            <div className="lt-pos-streak">{t("pvp.ladder.streakMultiplier")}</div>
          )}
          {catchUpActive && (
            <div className="lt-pos-catchup">{t("pvp.ladder.catchupMultiplier")}</div>
          )}
          {shieldActive && (
            <div className="lt-pos-shield" title={shieldTip}>{t("pvp.ladder.shieldPill")}</div>
          )}
        </div>
      </div>

      {/* ── Multi-tier track (non-champion) ── */}
      {!isChampion && (
        <div className="lt-pos-tier-wrap">
          {/* Tier name labels */}
          <div className="lt-pos-tier-labels">
            {segments.map((seg) => (
              <div
                key={seg.key}
                className="lt-pos-tier-label-cell"
                style={{ flex: seg.weight }}
              >
                <span
                  className="lt-pos-tier-label-txt"
                  style={seg.state === "current" ? { color: seg.color, fontWeight: 800 } : undefined}
                >
                  {seg.label}
                </span>
              </div>
            ))}
          </div>

          {/* Track bar */}
          <div className="lt-pos-tier-track">
            {segments.map((seg, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === segments.length - 1;
              let extraClass = "";
              if (seg.state === "done") extraClass = " lt-pos-tier-seg-done";
              else if (seg.state === "future") extraClass = " lt-pos-tier-seg-future";

              return (
                <div
                  key={seg.key}
                  className={`lt-pos-tier-seg${extraClass}`}
                  style={{
                    flex: seg.weight,
                    borderRadius: isFirst ? "3px 0 0 3px" : isLast ? "0 3px 3px 0" : 0,
                    position: "relative",
                    overflow: "visible",
                  }}
                >
                  {seg.state === "current" && (
                    <>
                      {/* Filled portion */}
                      <div
                        className="lt-pos-tier-fill"
                        style={{
                          width: `${seg.fillFrac * 100}%`,
                          background: seg.color,
                        }}
                      />
                      {/* YOU marker dot */}
                      <div
                        className="lt-pos-tier-you"
                        style={{
                          left: `${seg.fillFrac * 100}%`,
                          background: seg.color,
                          boxShadow: `0 0 8px ${seg.color}`,
                        }}
                      />
                    </>
                  )}
                  {seg.state === "done" && (
                    <div
                      className="lt-pos-tier-fill"
                      style={{ width: "100%", background: `rgba(${r},${g},${b},0.35)` }}
                    />
                  )}
                </div>
              );
            })}

            {/* DP-needed marker at the next-division boundary */}
            {nextDivision && boundaryPct != null && (
              <div className="lt-pos-tier-needed" style={{ left: `${boundaryPct}%` }}>
                <span className="lt-pos-tier-needed-arrow">▲</span>
                <span className="lt-pos-tier-needed-txt">
                  {t("pvp.ladder.dpToPromotion", { amount: (dpToPromotion ?? 0).toLocaleString(), division: divisionLabel(nextDivision) })}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Champion branch */}
      {isChampion && (
        <div className="lt-pos-bar-foot">
          <span>{(dp ?? 0).toLocaleString()} DP</span>
          {championRank != null && (
            <span>
              {t("pvp.ladder.championBranch", { count: championRank, total: totalChampions })}
              {weeksRemaining != null ? ` · ${t("pvp.ladder.championWeeks", { n: weeksRemaining })}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
