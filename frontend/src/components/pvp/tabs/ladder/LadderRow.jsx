import { divisionLabel, lastActiveColor, relativeTime, wcAbbrev } from "../../pvpConst";

/**
 * LadderRow — one row in the full ladder table.
 *
 * Row types (highest priority first):
 *   belt-holder: isBeltHolder         → gold background tint, 🏆 rank
 *   your row:    isViewer              → red background tint + 3px left border
 *   protected:   isProtected           → no bg change
 *
 * Tag priority (max 2 shown):
 *   Belt Holder > Rival > You > Protected > Streak (≥3) > Cross-weight [WC]
 */
export function LadderRow({ row, season, onOpenProfile, showDivisionBadge = false }) {
  const {
    rank,
    playerId,
    name,
    division,
    divisionColor,
    dp,
    wins,
    losses,
    winStreak,
    ovr,
    fightingStyle,
    realWeightClass,
    lastActiveAt,
    isViewer,
    isBeltHolder,
    isRivalWithViewer,
    isProtected,
  } = row;

  const isCrossWc = !!season?.crossWeightClass;

  // ── row class ──────────────────────────────────────────────────
  let rowClass = "lt-row";
  if (isBeltHolder) rowClass += " lt-row-belt";
  if (isViewer) rowClass += " lt-row-you";

  // ── rank color ─────────────────────────────────────────────────
  let rankClass = "lt-cell-rank";
  if (rank === 1) rankClass += " lt-rank-top1";
  else if (rank === 2) rankClass += " lt-rank-top2";
  else if (rank === 3) rankClass += " lt-rank-top3";

  // ── tags (max 2) ───────────────────────────────────────────────
  const tagCandidates = [];
  if (isBeltHolder) tagCandidates.push({ key: "belt", label: "Belt Holder", cls: "lt-tag lt-tag-belt" });
  if (isRivalWithViewer) tagCandidates.push({ key: "rival", label: "Rival", cls: "lt-tag lt-tag-rival" });
  if (isViewer) tagCandidates.push({ key: "you", label: "You", cls: "lt-tag lt-tag-you" });
  if (isProtected) tagCandidates.push({ key: "protected", label: "🛡 Protected", cls: "lt-tag lt-tag-protected" });
  if ((winStreak ?? 0) >= 3) tagCandidates.push({ key: "streak", label: "🔥 ×1.25", cls: "lt-tag lt-tag-streak" });
  if (isCrossWc && realWeightClass)
    tagCandidates.push({ key: "xw", label: wcAbbrev(realWeightClass), cls: "lt-tag lt-tag-xw" });

  const tags = tagCandidates.slice(0, 2);

  // ── division badge (shown only in All-divisions view) ─────────
  let divBadgeStyle;
  if (showDivisionBadge && divisionColor) {
    const r = parseInt(divisionColor.slice(1, 3), 16);
    const g = parseInt(divisionColor.slice(3, 5), 16);
    const b = parseInt(divisionColor.slice(5, 7), 16);
    divBadgeStyle = {
      color: divisionColor,
      background: `rgba(${r},${g},${b},0.12)`,
      border: `1px solid rgba(${r},${g},${b},0.2)`,
    };
  }

  // ── meta line ──────────────────────────────────────────────────
  const metaParts = [];
  if (isCrossWc && realWeightClass) metaParts.push(wcAbbrev(realWeightClass));
  else if (realWeightClass) metaParts.push(wcAbbrev(realWeightClass));
  if (fightingStyle) metaParts.push(fightingStyle);
  if (isProtected) metaParts.push("New competitor");

  const activeColor = lastActiveColor(lastActiveAt);
  const activeText = relativeTime(lastActiveAt);

  return (
    <div
      className={rowClass}
      onClick={() => onOpenProfile?.(playerId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpenProfile?.(playerId)}
    >
      {/* # Rank */}
      <div className={rankClass}>
        {rank === 1 && isBeltHolder ? (
          <span>1 🏆</span>
        ) : (
          rank
        )}
      </div>

      {/* Fighter */}
      <div className="lt-cell-name">
        <div className={`lt-cn-name${isViewer ? " lt-cn-name-you" : ""}`}>
          <span>{name}</span>
          {tags.map((t) => (
            <span key={t.key} className={t.cls}>{t.label}</span>
          ))}
        </div>
        {(showDivisionBadge || metaParts.length > 0) && (
          <div className="lt-cn-meta">
            {showDivisionBadge && divBadgeStyle && (
              <span className="lt-div-badge" style={divBadgeStyle}>
                {divisionLabel(division)}
              </span>
            )}
            {metaParts.length > 0 && (
              <span>{metaParts.join(" · ")}</span>
            )}
          </div>
        )}
      </div>

      {/* DP */}
      <div
        className="lt-cell-dp"
        style={isViewer ? { color: "#C8102E" } : isBeltHolder ? { color: "#D4A820" } : undefined}
      >
        {(dp ?? 0).toLocaleString()}
      </div>

      {/* Record */}
      <div
        className="lt-cell-record"
        style={isViewer ? { color: "#F0F0F0" } : undefined}
      >
        {wins ?? 0}W · {losses ?? 0}L
      </div>

      {/* OVR */}
      <div
        className="lt-cell-ovr"
        style={isViewer ? { color: "#F0F0F0" } : undefined}
      >
        {ovr ?? "—"}
      </div>

      {/* Last Active */}
      <div className="lt-cell-active" style={{ color: activeColor }}>
        {activeText}
      </div>
    </div>
  );
}
