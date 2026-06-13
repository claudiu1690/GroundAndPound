import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { renderEvent, renderRoundWinner } from "./renderEvent.js";

/**
 * Renders one round: header + winner line, events, stat row, momentum bar.
 * variant="summary" → uses .round-section / .rs-* / .rss-* classes (right col of FightSummary)
 * variant="drawer"  → uses .round-block / .round-head / .events / .round-stats / .stat-row-grid / .sg* classes
 */
export const RoundBlock = memo(function RoundBlock({ round, events, names, fightId, variant }) {
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
          <span className={`round-badge r${round.round}`}>Round {round.round}</span>
          <span
            style={{ fontSize: "10px", fontWeight: 600 }}
            className={winnerClass === "win" ? "rw-win" : winnerClass === "loss" ? "rw-loss" : "rw-even"}
          >
            {winnerArrow} {winnerLabel}
          </span>
          <ChevronDown size={13} strokeWidth={2.5} className={`rs-chev ${expanded ? "open" : ""}`} />
        </div>

        {expanded && (
          <div className="rs-events">
            {events.map((entry, idx) => {
              const { text, styleClass } = renderEvent(entry, { playerName, opponentName, fightId, index: idx });
              return (
                <div className="ev-line" key={`${entry.round}-${idx}`}>
                  <span className="ev-time">{entry.timestamp}</span>
                  <span className={`ev-txt ${styleClass}`}>{text}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="rs-stats">
          <div className="rss-inner">
            <div className="rss-item">
              <span className="rss-lbl">Strikes</span>
              &nbsp;
              <span className={`rss-val ${valClass(pStrikes, oStrikes) === "win" ? "win" : valClass(pStrikes, oStrikes) === "loss" ? "loss" : "neu"}`}>{pStrikes}</span>
              <span className="rss-sep">—</span>
              <span className={`rss-val ${valClass(oStrikes, pStrikes) === "win" ? "win" : valClass(oStrikes, pStrikes) === "loss" ? "loss" : "neu"}`}>{oStrikes}</span>
            </div>
            <div className="rss-divider" />
            <div className="rss-item">
              <span className="rss-lbl">TD</span>
              &nbsp;
              <span className={`rss-val ${valClass(pTd, oTd) === "win" ? "win" : valClass(pTd, oTd) === "loss" ? "loss" : "neu"}`}>{pTd}</span>
              <span className="rss-sep">—</span>
              <span className={`rss-val ${valClass(oTd, pTd) === "win" ? "win" : valClass(oTd, pTd) === "loss" ? "loss" : "neu"}`}>{oTd}</span>
            </div>
            {showSubAttempts && (
              <>
                <div className="rss-divider" />
                <div className="rss-item">
                  <span className="rss-lbl">Sub att.</span>
                  &nbsp;
                  <span className={`rss-val ${valClass(pSub, oSub) === "win" ? "win" : "neu"}`}>{pSub}</span>
                  <span className="rss-sep">—</span>
                  <span className={`rss-val ${valClass(oSub, pSub) === "win" ? "win" : "neu"}`}>{oSub}</span>
                </div>
              </>
            )}
            {showKnockdowns && (
              <>
                <div className="rss-divider" />
                <div className="rss-item">
                  <span className="rss-lbl">KD</span>
                  &nbsp;
                  <span className={`rss-val ${valClass(pKd, oKd) === "win" ? "win" : "neu"}`}>{pKd}</span>
                  <span className="rss-sep">—</span>
                  <span className={`rss-val ${valClass(oKd, pKd) === "win" ? "win" : "neu"}`}>{oKd}</span>
                </div>
              </>
            )}
            <div className="rss-divider" />
            <div className="rss-item">
              <span className="rss-lbl">Damage</span>
              &nbsp;
              <span className={`rss-val ${valClass(pDmg, oDmg) === "win" ? "win" : valClass(pDmg, oDmg) === "loss" ? "loss" : "neu"}`}>{pDmg}%</span>
              <span className="rss-sep">—</span>
              <span className={`rss-val ${valClass(oDmg, pDmg) === "win" ? "win" : valClass(oDmg, pDmg) === "loss" ? "loss" : "neu"}`}>{oDmg}%</span>
            </div>
            {showControl && (
              <>
                <div className="rss-divider" />
                <div className="rss-item">
                  <span className="rss-lbl">Ctrl</span>
                  &nbsp;
                  <span className={`rss-val ${valClass(pCtrl, oCtrl) === "win" ? "win" : valClass(pCtrl, oCtrl) === "loss" ? "loss" : "neu"}`}>{fmtCtrl(pCtrl)}</span>
                  <span className="rss-sep">—</span>
                  <span className={`rss-val ${valClass(oCtrl, pCtrl) === "win" ? "win" : valClass(oCtrl, pCtrl) === "loss" ? "loss" : "neu"}`}>{fmtCtrl(oCtrl)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rs-momentum">
          <div className="mom-track">
            <div
              className="mom-a"
              style={{
                width: `${pPct}%`,
                background: "var(--c-grn-bright)",
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
    );
  }

  // ── Drawer variant ──────────────────────────────────────────────────────────
  return (
    <div className="round-block">
      <div className="round-head">
        <span className="rh-name">Round {round.round}</span>
        <span className={`rh-winner ${winnerClass}`}>
          {winnerArrow} {winnerLabel}
        </span>
      </div>

      <div className="events">
        {events.map((entry, idx) => {
          const { text, styleClass } = renderEvent(entry, { playerName, opponentName, fightId, index: idx });
          return (
            <div className="ev" key={`${entry.round}-${idx}`}>
              <span className="ev-t">{entry.timestamp}</span>
              <span className={`ev-txt ${styleClass}`}>{text}</span>
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
            <div className="sg-lbl">Strikes</div>
          </div>
          <div className="sg">
            <div className="sg-val">
              <span className={`sv ${valClass(pTd, oTd)}`}>{pTd}</span>
              <span className="sg-sep">—</span>
              <span className={`sv ${valClass(oTd, pTd)}`}>{oTd}</span>
            </div>
            <div className="sg-lbl">Takedowns</div>
          </div>
          <div className="sg">
            <div className="sg-val">
              <span className={`sv ${valClass(pDmg, oDmg)}`}>{pDmg}%</span>
              <span className="sg-sep">—</span>
              <span className={`sv ${valClass(oDmg, pDmg)}`}>{oDmg}%</span>
            </div>
            <div className="sg-lbl">Damage</div>
          </div>
          {showSubAttempts && (
            <div className="sg">
              <div className="sg-val">
                <span className={`sv ${valClass(pSub, oSub)}`}>{pSub}</span>
                <span className="sg-sep">—</span>
                <span className={`sv ${valClass(oSub, pSub)}`}>{oSub}</span>
              </div>
              <div className="sg-lbl">Sub att.</div>
            </div>
          )}
          {showKnockdowns && (
            <div className="sg">
              <div className="sg-val">
                <span className={`sv ${valClass(pKd, oKd)}`}>{pKd}</span>
                <span className="sg-sep">—</span>
                <span className={`sv ${valClass(oKd, pKd)}`}>{oKd}</span>
              </div>
              <div className="sg-lbl">KDs</div>
            </div>
          )}
          {showControl && (
            <div className="sg">
              <div className="sg-val">
                <span className={`sv ${valClass(pCtrl, oCtrl)}`}>{fmtCtrl(pCtrl)}</span>
                <span className="sg-sep">—</span>
                <span className={`sv ${valClass(oCtrl, pCtrl)}`}>{fmtCtrl(oCtrl)}</span>
              </div>
              <div className="sg-lbl">Control</div>
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
