import { divisionLabel, lastActiveColor, relativeTime, wcAbbrev } from "../../pvpConst";
import { bannerRowBackground, bannerAccentColor } from "../../../banner/bannerCatalog";
import { t } from "../../../../lib/i18n";

/**
 * LadderRow — one row in the full ladder table.
 *
 * Grid: 48px 1fr 88px 82px 52px 96px
 *
 * Row types (highest priority first):
 *   belt-holder: isBeltHolder         → gold background tint + gold border
 *   your row:    isViewer              → red background tint + 3px red left border
 *   rival:       isRivalWithViewer     → orange border + .lt-row-rival bg tint
 *   protected:   isProtected           → transparent border
 *
 * 6th cell: "Last Active" relative time (Today / Nd ago), coloured by recency.
 *
 * Division badge always shown in the Fighter meta line.
 *
 * Tag priority (max 2 shown):
 *   Belt Holder > Rival > You > Protected > Streak (≥3) > Cross-weight [WC]
 */
export function LadderRow({ row, season, onOpenProfile, viewerBanner }) {
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
  if (isRivalWithViewer && !isViewer) rowClass += " lt-row-rival";

  // ── division-colored left border (inline style, uses row.divisionColor) ──
  let borderColor = "transparent";
  if (isBeltHolder) {
    borderColor = "#D4A820";
  } else if (isViewer) {
    borderColor = "#C8102E";
  } else if (isRivalWithViewer) {
    borderColor = "rgba(200,122,16,0.5)";
  } else if (divisionColor) {
    // Division-tinted transparent border for non-special rows
    const r = parseInt(divisionColor.slice(1, 3), 16);
    const g = parseInt(divisionColor.slice(3, 5), 16);
    const b = parseInt(divisionColor.slice(5, 7), 16);
    borderColor = `rgba(${r},${g},${b},0.25)`;
  }

  // ── rank color ─────────────────────────────────────────────────
  let rankClass = "lt-cell-rank";
  if (rank === 1) rankClass += " lt-rank-top1";
  else if (rank === 2) rankClass += " lt-rank-top2";
  else if (rank === 3) rankClass += " lt-rank-top3";

  // ── tags (max 2) ───────────────────────────────────────────────
  const tagCandidates = [];
  if (isBeltHolder) tagCandidates.push({ key: "belt", label: t("pvp.ladder.tagBeltHolder"), cls: "lt-tag lt-tag-belt" });
  if (isRivalWithViewer) tagCandidates.push({ key: "rival", label: t("pvp.ladder.tagRival"), cls: "lt-tag lt-tag-rival" });
  if (isViewer) tagCandidates.push({ key: "you", label: t("pvp.ladder.tagYou"), cls: "lt-tag lt-tag-you" });
  if (isProtected) tagCandidates.push({ key: "protected", label: t("pvp.ladder.tagProtected"), cls: "lt-tag lt-tag-protected" });
  if ((winStreak ?? 0) >= 3) tagCandidates.push({ key: "streak", label: t("pvp.ladder.tagStreak"), cls: "lt-tag lt-tag-streak" });
  if (isCrossWc && realWeightClass)
    tagCandidates.push({ key: "xw", label: wcAbbrev(realWeightClass), cls: "lt-tag lt-tag-xw" });

  const tags = tagCandidates.slice(0, 2);

  // ── division badge (always shown) ─────────────────────────────
  let divBadgeStyle;
  if (divisionColor) {
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
  if (fightingStyle) metaParts.push(fightingStyle);
  if (isProtected) metaParts.push(t("pvp.ladder.newCompetitor"));

  const activeColor = lastActiveColor(lastActiveAt);
  const activeText = relativeTime(lastActiveAt);

  // Every row wears its owner's banner: yours under the light veil (it pops),
  // everyone else's under the heavy veil (identity hint, never louder than
  // yours). Accent colors the name; on your row it also recolors the border.
  // Rows with no saved banner skin as default Slate — "no colors yet".
  const rowStyle = { borderLeft: `3px solid ${borderColor}` };
  const skinBanner = isViewer ? (viewerBanner || row.banner) : row.banner;
  rowStyle.background = bannerRowBackground(skinBanner, { veil: isViewer ? "self" : "other" });
  rowStyle.textShadow = "0 1px 2px rgba(0, 0, 0, 0.6)";
  // Accent colors the name — but on OTHER rows the schema-default Blood Red is
  // treated as "no accent chosen": it would paint every uncustomized fighter's
  // name red, colliding with the rival/you color language.
  const accent = bannerAccentColor(skinBanner);
  const accentChosen = accent && (isViewer || skinBanner?.accentColor !== "ACC_RED");
  if (accentChosen) {
    rowStyle["--rung-accent"] = accent;
    if (isViewer) rowStyle.borderLeftColor = accent;
  }

  return (
    <div
      className={rowClass}
      style={rowStyle}
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
        <div className="lt-cn-meta">
          {divBadgeStyle && (
            <span className="lt-div-badge" style={divBadgeStyle}>
              {divisionLabel(division)}
            </span>
          )}
          {isCrossWc && realWeightClass && (
            <span style={{ color: "#555", marginLeft: 2 }}>· {wcAbbrev(realWeightClass)}</span>
          )}
          {metaParts.length > 0 && (
            <span>{metaParts.join(" · ")}</span>
          )}
        </div>
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

      {/* Last Active — 6th cell */}
      <div className="lt-cell-active" style={{ color: activeColor }}>
        {activeText}
      </div>
    </div>
  );
}
