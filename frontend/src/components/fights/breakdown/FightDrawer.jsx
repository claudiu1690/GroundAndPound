import { useState, memo } from "react";
import { useFightBreakdown } from "../../../hooks/useFightBreakdown.js";
import { RoundBlock } from "./RoundBlock.jsx";
import { IntroRow } from "./IntroRow.jsx";
import { ResultRow } from "./ResultRow.jsx";
import { t } from "@/lib/i18n";

/**
 * FightDrawer — side panel that shows a full fight breakdown.
 * Props: { fightId, kind, onClose }
 */
export const FightDrawer = memo(function FightDrawer({ fightId, kind, onClose }) {
  const [activeTab, setActiveTab] = useState("rounds");
  const { data, loading, error } = useFightBreakdown(fightId ? { fightId, kind } : null);

  // ── Header helpers ──────────────────────────────────────────────────────────
  function headerContent() {
    if (!data) return null;
    const { header, method, finishRound, youWon } = data;
    const isDraw = header.outcomeWord === "DRAW";
    const winClass = youWon ? "win" : isDraw ? "draw" : "loss";
    const icon = youWon ? "✓" : isDraw ? "–" : "✕";
    const title = youWon
      ? `Win vs ${header.opponentName}`
      : isDraw
      ? `Draw vs ${header.opponentName}`
      : `Loss vs ${header.opponentName}`;

    const methodStr = method
      ? finishRound
        ? `${method} · Rd ${finishRound}`
        : method
      : null;

    return (
      <div className="drawer-header">
        <div className="dh-row1">
          <div className={`dh-icon ${winClass}`}>{icon}</div>
          <div className="dh-title">{title}</div>
          <button type="button" className="dh-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="dh-row2">
          {header.tier && <span className="dh-pill tier">{header.tier}</span>}
          {methodStr && (
            <>
              <span className="dh-sep">·</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{methodStr}</span>
            </>
          )}
          {kind !== "pvp" && header.campGrade && (
            <>
              <span className="dh-sep">·</span>
              <span className="dh-pill grade">{t("fights.drawer.campGrade", { grade: header.campGrade })}</span>
            </>
          )}
          {kind !== "pvp" && header.weightCut && (
            <>
              <span className="dh-sep">·</span>
              <span className="dh-pill cut">{t("fights.drawer.cutLabel", { label: header.weightCut.label })}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="drawer-side">
        <div className="drawer-header">
          <div className="dh-row1">
            <div className="dh-icon" style={{ background: "var(--c-bg-tile)" }} />
            <div className="dh-title" style={{ color: "var(--text-muted)" }}>{t("fights.drawer.loading")}</div>
            <button type="button" className="dh-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="drawer-body">
          {[1, 2, 3].map((i) => (
            <div key={i} className="round-block fd-skeleton" style={{ height: 120 }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="drawer-side">
        <div className="drawer-header">
          <div className="dh-row1">
            <div className="dh-title" style={{ color: "var(--text-muted)" }}>{t("fights.drawer.errorTitle")}</div>
            <button type="button" className="dh-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="fd-error">{error}</div>
        </div>
      </div>
    );
  }

  // ── No data yet ──────────────────────────────────────────────────────────────
  if (!data) return null;

  // ── Legacy fallback ──────────────────────────────────────────────────────────
  if (data.legacy) {
    const commentary = data.commentary ?? [];
    const n = commentary.length;
    return (
      <div className="drawer-side">
        {headerContent()}
        <div className="drawer-body">
          <div className="fd-legacy">
            {commentary.map((line, i) => {
              const isResult = i === n - 1 && n > 1;
              const isIntro = i === 0 && n > 1;
              const match = line.match(/^Round (\d+):\s*/);
              return (
                <div key={i} className={`fd-legacy-line${isResult ? " fd-legacy-result" : isIntro ? " fd-legacy-intro" : ""}`}>
                  {isIntro && <span className="fd-legacy-badge">{t("fights.fightDescription.introLabel")}</span>}
                  {isResult && <span className="fd-legacy-badge">{t("fights.fightDescription.resultLabel")}</span>}
                  {match && <span className="fd-legacy-badge">{t("fights.fightDescription.roundLabel", { n: match[1] })}</span>}
                  <span>{match ? line.slice(match[0].length) : line}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Full breakdown ───────────────────────────────────────────────────────────
  const {
    header,
    rounds,
    eventLog,
    campOutcomes,
    wildcardText,
    totals,
    introTemplateKey,
    resultContextKey,
    outcome,
    youWon,
    method,
    finishRound,
    finishTime,
  } = data;

  const playerName = header?.playerName ?? "You";
  const opponentName = header.opponentName;

  // Format control time M:SS
  function fmtSeconds(s) {
    if (s == null) return "—";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  // Extract sub/strike/templateKey from the finish event for the result line.
  // Covers legacy tko_finish + the two new split keys.
  const finishEvent = (eventLog ?? []).find(
    (e) => e.type === "finish"
      || e.templateKey === "submission_finish"
      || e.templateKey === "ko_finish"
      || e.templateKey === "tko_finish"
      || e.templateKey === "tko_finish_ground"
      || e.templateKey === "tko_finish_strike"
  );
  const finishSub = finishEvent?.vars?.sub ?? null;
  const finishStrike = finishEvent?.vars?.strike ?? null;
  const finishTemplateKey = finishEvent?.templateKey ?? null;

  const [pTotStr, oTotStr] = totals?.strikes ?? [0, 0];
  const [pTotTd, oTotTd] = totals?.takedowns ?? [0, 0];
  const [pTotSub, oTotSub] = totals?.subAttempts ?? [0, 0];
  const [pTotKd, oTotKd] = totals?.knockdowns ?? [0, 0];
  const [pTotDmg, oTotDmg] = totals?.damage ?? [0, 0];
  const [pCtrl, oCtrl] = totals?.controlTime ?? [0, 0];

  function sbValClass(pVal, oVal) {
    if (pVal > oVal) return "win";
    if (oVal > pVal) return "loss";
    return "neu";
  }

  const outcomeWord = header.outcomeWord ?? (youWon ? "VICTORY" : "DEFEAT");

  return (
    <div className="drawer-side">
      {headerContent()}

      <div className="drawer-tabs">
        <button
          type="button"
          className={`dtab${activeTab === "rounds" ? " act" : ""}`}
          onClick={() => setActiveTab("rounds")}
        >
          {t("fights.drawer.tabRounds")}
        </button>
        <button
          type="button"
          className={`dtab${activeTab === "result" ? " act" : ""}`}
          onClick={() => setActiveTab("result")}
        >
          {t("fights.drawer.tabResult")}
        </button>
      </div>

      {/* ── Rounds Tab ─────────────────────────────────────────── */}
      {activeTab === "rounds" && (
        <div className="drawer-body">
          {/* Intro */}
          <div className="round-block fd-intro-block">
            <IntroRow
              introTemplateKey={introTemplateKey}
              playerName={playerName}
              opponentName={opponentName}
              fightId={fightId}
            />
          </div>

          {(rounds ?? []).map((r) => {
            const roundEvents = (eventLog ?? []).filter((e) => e.round === r.round);
            return (
              <RoundBlock
                key={r.round}
                round={r}
                events={roundEvents}
                names={{ playerName, opponentName }}
                fightId={fightId}
                variant="drawer"
              />
            );
          })}
        </div>
      )}

      {/* ── Result Tab ─────────────────────────────────────────── */}
      {activeTab === "result" && (
        <div className="drawer-body">
          {/* Outcome card */}
          <div className="result-outcome">
            <div className={`ro-word${youWon ? " win" : ""}`} style={!youWon ? { color: "var(--c-accent)" } : {}}>
              {outcomeWord}
            </div>
            <div className="ro-method">
              {[method, finishRound ? `Round ${finishRound}` : null, finishTime]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {/* Result narrative */}
            <div style={{ marginTop: 8 }}>
              <ResultRow
                outcome={outcome}
                resultContextKey={resultContextKey}
                playerName={playerName}
                opponentName={opponentName}
                fightId={fightId}
                youWon={youWon}
                finishSub={finishSub}
                finishStrike={finishStrike}
                finishTemplateKey={finishTemplateKey}
              />
            </div>
          </div>

          {/* Camp outcomes (PvE only) */}
          {kind !== "pvp" && campOutcomes && campOutcomes.length > 0 && (
            <div className="camp-block">
              <div className="cb-head">
                <span className="cb-title">{t("fights.drawer.campOutcomes")}</span>
                {header.campGrade && (
                  <span className="cb-grade" style={header.campGrade === "A" ? { color: "#4ADE80" } : { color: "var(--c-amber-bright)" }}>
                    {t("fights.drawer.gradeLabel", { grade: header.campGrade })}
                  </span>
                )}
              </div>
              {campOutcomes.map((co, i) => (
                <div className="camp-row" key={i}>
                  <span className="camp-ic" style={{
                    color: co.status === "matched" ? "#4ADE80"
                      : co.status === "partial" ? "var(--c-amber-bright)"
                      : "var(--text-muted)",
                  }}>
                    {co.status === "matched" ? "✓" : co.status === "partial" ? "–" : "✕"}
                  </span>
                  <span className="camp-name">{co.name}</span>
                  <span className={`camp-pill ${co.status}`}>{co.status}</span>
                  {co.note && <span className="camp-note">{co.note}</span>}
                </div>
              ))}
              {wildcardText && (
                <div className="wc-row">
                  <span className="wc-ic">?</span>
                  <span className="wc-txt">{wildcardText}</span>
                </div>
              )}
            </div>
          )}

          {/* Combined stats */}
          {totals && (
            <div className="stats-block">
              <div className="sb-head">
                <div className="sb-head-row">
                  <span></span>
                  <span>{t("fights.drawer.statYou")}</span>
                  <span>{opponentName}</span>
                </div>
              </div>
              <div className="sb-row">
                <span className="sb-lbl">{t("fights.drawer.statStrikes")}</span>
                <span className={`sb-val ${sbValClass(pTotStr, oTotStr)}`}>{pTotStr}</span>
                <span className={`sb-val ${sbValClass(oTotStr, pTotStr)}`}>{oTotStr}</span>
              </div>
              <div className="sb-row">
                <span className="sb-lbl">{t("fights.drawer.statTakedowns")}</span>
                <span className={`sb-val ${sbValClass(pTotTd, oTotTd)}`}>{pTotTd}</span>
                <span className={`sb-val ${sbValClass(oTotTd, pTotTd)}`}>{oTotTd}</span>
              </div>
              <div className="sb-row">
                <span className="sb-lbl">{t("fights.drawer.statSubAttempts")}</span>
                <span className={`sb-val ${sbValClass(pTotSub, oTotSub)}`}>{pTotSub}</span>
                <span className={`sb-val ${sbValClass(oTotSub, pTotSub)}`}>{oTotSub}</span>
              </div>
              <div className="sb-row">
                <span className="sb-lbl">{t("fights.drawer.statKnockdowns")}</span>
                <span className={`sb-val ${sbValClass(pTotKd, oTotKd)}`}>{pTotKd}</span>
                <span className={`sb-val ${sbValClass(oTotKd, pTotKd)}`}>{oTotKd}</span>
              </div>
              <div className="sb-row">
                <span className="sb-lbl">{t("fights.drawer.statDamage")}</span>
                <span className={`sb-val ${sbValClass(pTotDmg, oTotDmg)}`}>{pTotDmg}%</span>
                <span className={`sb-val ${sbValClass(oTotDmg, pTotDmg)}`}>{oTotDmg}%</span>
              </div>
              <div className="sb-row">
                <span className="sb-lbl">{t("fights.drawer.statControlTime")}</span>
                <span className={`sb-val ${sbValClass(pCtrl, oCtrl)}`}>{fmtSeconds(pCtrl)}</span>
                <span className={`sb-val ${sbValClass(oCtrl, pCtrl)}`}>{fmtSeconds(oCtrl)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
