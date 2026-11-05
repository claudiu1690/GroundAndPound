import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { renderEvent, renderRoundWinner } from "./renderEvent.js";
import { t } from "@/lib/i18n";
import { RARITY_COLORS } from "../../../constants/specialMovesCatalog";

/** CAMP / CARD / WILDCARD marker in front of the moments the replay highlights, so the report shows them too. */
function EventChip({ entry, moves }) {
  if (entry.type === "camp") return <span className="ev-chip ev-chip--camp">{t("fights.roundBlock.chipCamp")}</span>;
  if (entry.type === "wildcard") return <span className="ev-chip ev-chip--wildcard">{t("fights.roundBlock.chipWildcard")}</span>;
  if (entry.type === "move") {
    const rows = (entry.vars?.moveIds ?? []).map((id) => (moves ?? []).find((m) => m.moveId === id)).filter(Boolean);
    const top = rows[0];
    return (
      <span
        className="ev-chip ev-chip--card"
        style={{ "--rarity-color": RARITY_COLORS[top?.rarity] || RARITY_COLORS.COMMON }}
        title={rows.map((m) => m.name).join(" + ") || undefined}
      >
        {t("fights.roundBlock.chipCard")}
      </span>
    );
  }
  return null;
}

/** Clock time, or a muted R{n} when the event belongs to the round but not to a logged exchange. */
function EventTime({ entry, className }) {
  if (entry.timestamp != null) return <span className={className}>{entry.timestamp}</span>;
  return (
    <span className={`${className} ev-time--round`} title={t("fights.roundBlock.roundOnlyTitle", { n: entry.round })}>
      {t("fights.roundBlock.roundOnly", { n: entry.round })}
    </span>
  );
}

/**
 * Renders one round: header + winner line, events, stat row, momentum bar.
 * variant="summary" → broadcast-scorecard style: .round-section / .rs-* / .rsb-* classes
 *                     (right col of FightSummary). Optional `finish` ({round, label})
 *                     marks the finish round so its chip shows e.g. "TKO 2:41" instead
 *                     of a 10-9 score; `youWon` colors that chip.
 * variant="drawer"  → uses .round-block / .round-head / .events / .round-stats / .stat-row-grid / .sg* classes
 */
export const RoundBlock = memo(function RoundBlock({ round, events, names, fightId, variant, finish, youWon, moves }) {
  const { playerName, opponentName } = names;
  const isSummary = variant === "summary";

  // On the compact post-fight summary, round highlights are collapsed by default —
  // the header + stat bar + momentum form the overview; click to reveal the events.
  const [expanded, setExpanded] = useState(false);

  // Round winner
  const { label: winnerLabel, category: winnerCat } = renderRoundWinner(
    round.roundWinner,
    {
      playerName,
      opponentName,
      fightId,
      round: round.round,
      dominant: round.dominant,
    }
  );

  // Winner indicator arrow + class
  const isPlayerWinner = winnerCat.startsWith("player");
  const isOpponentWinner = winnerCat.startsWith("opponent");
  const isEven = winnerCat === "even";

  const winnerArrow = isPlayerWinner ? "▲" : isOpponentWinner ? "▼" : "—";
  const winnerClass = isPlayerWinner ? "win" : isOpponentWinner ? "loss" : "even";

  // Stats helpers
  const [pStrikes, oStrikes] = round.strikes ?? [0, 0];
  const [pTd, oTd] = round.takedowns ?? [0, 0];
  const [pSub, oSub] = round.subAttempts ?? [0, 0];
  const [pKd, oKd] = round.knockdowns ?? [0, 0];
  const [pDmg, oDmg] = round.damage ?? [0, 0];
  const [pCtrl, oCtrl] = round.controlTime ?? [0, 0];

  // Stamina through this round (drains once at the start of a round); absent on old fights and PvP.
  const sta = Array.isArray(round.stamina) && round.stamina.length >= 2 && round.stamina[0] != null && round.stamina[1] != null
    ? [Math.round(Number(round.stamina[0])), Math.round(Number(round.stamina[1]))]
    : null;
  // Health at the end of this round (the same values the replay's HP bars land on).
  const hp = Array.isArray(round.health) && round.health.length >= 2 && round.health[0] != null && round.health[1] != null
    ? [Math.round(Number(round.health[0])), Math.round(Number(round.health[1]))]
    : null;

  const showSubAttempts = pSub >= 1 || oSub >= 1;
  const showKnockdowns = pKd >= 1 || oKd >= 1;
  const showControl = pCtrl > 0 || oCtrl > 0;

  function fmtCtrl(s) {
    if (!s) return "0:00";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  // Momentum bar widths from damage pair
  const totalDmg = pDmg + oDmg;
  const pPct = totalDmg > 0 ? Math.round((pDmg / totalDmg) * 100) : 50;
  const oPct = 100 - pPct;
  const momentumOpacity = round.dominant ? 0.85 : 0.55;
  const oppMomentumOpacity = round.dominant ? 0.3 : 0.45;

  // Value class helper: win = player side leading, loss = opponent
  function valClass(pVal, oVal) {
    if (pVal > oVal) return "win";
    if (oVal > pVal) return "loss";
    return "neu";
  }

  if (isSummary) {
    // Broadcast score chip: the finish round shows the method + time; every
    // other round shows a judge-style 10-9 / 10-8 (player score always first).
    const isFinishRound = !!finish && finish.round === round.round;
    let chipClass = "rs-chip";
    let chipLabel = "10 – 10";
    if (isFinishRound) {
      chipClass += ` rs-chip--fin${youWon ? "" : " rs-chip--fin-loss"}`;
      chipLabel = finish.label;
    } else if (isPlayerWinner) {
      chipClass += ` rs-chip--win${round.dominant ? " rs-chip--dom" : ""}`;
      chipLabel = round.dominant ? "10 – 8" : "10 – 9";
    } else if (isOpponentWinner) {
      chipClass += " rs-chip--loss";
      chipLabel = round.dominant ? "8 – 10" : "9 – 10";
    }

    // Fixed four-slot scoreboard so columns align vertically across rounds:
    // strikes / TD / damage always; the 4th slot goes to the rarest notable
    // stat present (KD > sub attempts > control).
    const fourth = showKnockdowns
      ? { lbl: t("fights.roundBlock.kd"), p: pKd, o: oKd, pRaw: pKd, oRaw: oKd }
      : showSubAttempts
        ? { lbl: t("fights.roundBlock.subAtt"), p: pSub, o: oSub, pRaw: pSub, oRaw: oSub }
        : { lbl: t("fights.roundBlock.ctrl"), p: fmtCtrl(pCtrl), o: fmtCtrl(oCtrl), pRaw: pCtrl, oRaw: oCtrl, empty: !showControl };
    const cells = [
      { lbl: t("fights.roundBlock.strikes"), p: pStrikes, o: oStrikes, pRaw: pStrikes, oRaw: oStrikes },
      { lbl: t("fights.roundBlock.td"), p: pTd, o: oTd, pRaw: pTd, oRaw: oTd },
      { lbl: t("fights.roundBlock.damage"), p: `${pDmg}%`, o: `${oDmg}%`, pRaw: pDmg, oRaw: oDmg },
      fourth,
    ];

    return (
      <div className={`round-section ${expanded ? "rs-expanded" : ""}`}>
        <div
          className="rs-header rs-header--toggle"
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); }
          }}
        >
          <span className={`round-badge r${round.round}`}>{t("fights.roundBlock.roundLabel", { n: round.round })}</span>
          <span className={`rs-winner ${winnerClass === "win" ? "rw-win" : winnerClass === "loss" ? "rw-loss" : "rw-even"}`}>
            {winnerArrow} {winnerLabel}
          </span>
          <span className={chipClass}>{chipLabel}</span>
          <ChevronDown size={13} strokeWidth={2.5} className={`rs-chev ${expanded ? "open" : ""}`} />
        </div>

        {expanded && (
          <div className="rs-events">
            {events.map((entry, idx) => {
              const { text, styleClass } = renderEvent(entry, { playerName, opponentName, fightId, index: idx, moves });
              return (
                <div className="ev-line" key={`${entry.round}-${idx}`}>
                  <EventTime entry={entry} className="ev-time" />
                  <span className={`ev-txt ${styleClass}`}><EventChip entry={entry} moves={moves} />{text}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="rsb">
          {cells.map((c, i) => (
            <div className={`rsb-cell${c.empty ? " rsb-cell--empty" : ""}`} key={i}>
              <span className="rsb-lbl">{c.lbl}</span>
              {c.empty ? (
                <span className="rsb-val">—</span>
              ) : (
                <span className="rsb-val">
                  <span className={`rsb-p${c.pRaw > c.oRaw ? " lead" : ""}`}>{c.p}</span>
                  <span className="rsb-sep">·</span>
                  <span className={`rsb-o${c.oRaw > c.pRaw ? " lead" : ""}`}>{c.o}</span>
                </span>
              )}
            </div>
          ))}
        </div>

        {hp && (
          <div className="rs-stamina rs-health" data-testid="rs-health">
            <span className="rsb-lbl">{t("fights.roundBlock.health")}</span>
            <span className="rsb-val">
              <span className={`rsb-p${hp[0] > hp[1] ? " lead" : ""}`}>{hp[0]}</span>
              <span className="rsb-sep">·</span>
              <span className={`rsb-o${hp[1] > hp[0] ? " lead" : ""}`}>{hp[1]}</span>
            </span>
          </div>
        )}
        {sta && (
          <div className="rs-stamina" data-testid="rs-stamina">
            <span className="rsb-lbl">{t("fights.roundBlock.stamina")}</span>
            <span className="rsb-val">
              <span className={`rsb-p${sta[0] > sta[1] ? " lead" : ""}`}>{sta[0]}</span>
              <span className="rsb-sep">·</span>
              <span className={`rsb-o${sta[1] > sta[0] ? " lead" : ""}`}>{sta[1]}</span>
            </span>
          </div>
        )}

        <div className="rs-momentum">
          <div className="mom-track">
            <div
              className="mom-a"
              style={{
                width: `${pPct}%`,
                background: "var(--green-bright)",
                opacity: isPlayerWinner ? momentumOpacity : oppMomentumOpacity,
              }}
            />
            <div
              className="mom-b"
              style={{
                width: `${oPct}%`,
                background: "var(--c-accent)",
                opacity: isOpponentWinner ? momentumOpacity : oppMomentumOpacity,
              }}
            />
          </div>
          <div className="mom-tag">{t("fights.roundBlock.dmgShare")}</div>
        </div>
      </div>
    );
  }

  // ── Drawer variant ──────────────────────────────────────────────────────────
  return (
    <div className="round-block">
      <div className="round-head">
        <span className="rh-name">{t("fights.roundBlock.roundLabel", { n: round.round })}</span>
        <span className={`rh-winner ${winnerClass}`}>
          {winnerArrow} {winnerLabel}
        </span>
      </div>

      <div className="events">
        {events.map((entry, idx) => {
          const { text, styleClass } = renderEvent(entry, { playerName, opponentName, fightId, index: idx, moves });
          return (
            <div className="ev" key={`${entry.round}-${idx}`}>
              <EventTime entry={entry} className="ev-t" />
              <span className={`ev-txt ${styleClass}`}><EventChip entry={entry} moves={moves} />{text}</span>
            </div>
          );
        })}
      </div>

      <div className="round-stats">
        <div className="stat-row-grid">
          <div className="sg">
            <div className="sg-val">
              <span className={`sv ${valClass(pStrikes, oStrikes)}`}>{pStrikes}</span>
              <span className="sg-sep">—</span>
              <span className={`sv ${valClass(oStrikes, pStrikes)}`}>{oStrikes}</span>
            </div>
            <div className="sg-lbl">{t("fights.roundBlock.strikes")}</div>
          </div>
          <div className="sg">
            <div className="sg-val">
              <span className={`sv ${valClass(pTd, oTd)}`}>{pTd}</span>
              <span className="sg-sep">—</span>
              <span className={`sv ${valClass(oTd, pTd)}`}>{oTd}</span>
            </div>
            <div className="sg-lbl">{t("fights.roundBlock.takedowns")}</div>
          </div>
          <div className="sg">
            <div className="sg-val">
              <span className={`sv ${valClass(pDmg, oDmg)}`}>{pDmg}%</span>
              <span className="sg-sep">—</span>
              <span className={`sv ${valClass(oDmg, pDmg)}`}>{oDmg}%</span>
            </div>
            <div className="sg-lbl">{t("fights.roundBlock.damage")}</div>
          </div>
          {showSubAttempts && (
            <div className="sg">
              <div className="sg-val">
                <span className={`sv ${valClass(pSub, oSub)}`}>{pSub}</span>
                <span className="sg-sep">—</span>
                <span className={`sv ${valClass(oSub, pSub)}`}>{oSub}</span>
              </div>
              <div className="sg-lbl">{t("fights.roundBlock.subAtt")}</div>
            </div>
          )}
          {showKnockdowns && (
            <div className="sg">
              <div className="sg-val">
                <span className={`sv ${valClass(pKd, oKd)}`}>{pKd}</span>
                <span className="sg-sep">—</span>
                <span className={`sv ${valClass(oKd, pKd)}`}>{oKd}</span>
              </div>
              <div className="sg-lbl">{t("fights.roundBlock.kds")}</div>
            </div>
          )}
          {hp && (
            <div className="sg rs-health" data-testid="rs-health">
              <div className="sg-val">
                <span className={`sv ${valClass(hp[0], hp[1])}`}>{hp[0]}</span>
                <span className="sg-sep">·</span>
                <span className={`sv ${valClass(hp[1], hp[0])}`}>{hp[1]}</span>
              </div>
              <div className="sg-lbl">{t("fights.roundBlock.health")}</div>
            </div>
          )}
          {sta && (
            <div className="sg rs-stamina" data-testid="rs-stamina">
              <div className="sg-val">
                <span className={`sv ${valClass(sta[0], sta[1])}`}>{sta[0]}</span>
                <span className="sg-sep">—</span>
                <span className={`sv ${valClass(sta[1], sta[0])}`}>{sta[1]}</span>
              </div>
              <div className="sg-lbl">{t("fights.roundBlock.stamina")}</div>
            </div>
          )}
          {showControl && (
            <div className="sg">
              <div className="sg-val">
                <span className={`sv ${valClass(pCtrl, oCtrl)}`}>{fmtCtrl(pCtrl)}</span>
                <span className="sg-sep">—</span>
                <span className={`sv ${valClass(oCtrl, pCtrl)}`}>{fmtCtrl(oCtrl)}</span>
              </div>
              <div className="sg-lbl">{t("fights.roundBlock.control")}</div>
            </div>
          )}
        </div>
        <div className="momentum">
          <div className="mom-track">
            <div
              className="mom-a"
              style={{
                width: `${pPct}%`,
                background: "#3A9A4A",
                opacity: isPlayerWinner ? momentumOpacity : oppMomentumOpacity,
              }}
            />
            <div
              className="mom-b"
              style={{
                width: `${oPct}%`,
                background: "var(--c-accent)",
                opacity: isOpponentWinner ? momentumOpacity : oppMomentumOpacity,
              }}
            />
          </div>
          <div className="mom-lbls">
            <span className="mom-lbl">{playerName}</span>
            <span className="mom-lbl">{opponentName}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
