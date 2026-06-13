import { memo } from "react";
import { IntroRow } from "./breakdown/IntroRow.jsx";
import { RoundBlock } from "./breakdown/RoundBlock.jsx";
import { ResultRow } from "./breakdown/ResultRow.jsx";

/**
 * FightDescription — right column of FightSummary.
 *
 * Two rendering modes:
 * 1. Legacy: breakdown?.legacy === true (or no breakdown) → flat commentary list.
 * 2. Modern: breakdown with rounds/eventLog → IntroRow + RoundBlocks + ResultRow.
 *
 * Props:
 *   commentary  — string[] (legacy path; still accepted for backward compat)
 *   breakdown   — the full breakdown payload from /fights/:id/breakdown
 *   playerName  — the viewer's fighter display name (e.g. "Test \"Rampage\" Jack");
 *                 falls back to breakdown.header?.playerName then "You" if absent
 */
export const FightDescription = memo(function FightDescription({ commentary, breakdown, playerName: playerNameProp }) {
  // ── Modern path ─────────────────────────────────────────────────────────────
  // Gate: must have an eventLog array — guards against raw Mongoose subdocs that
  // have neither `legacy:false` nor an eventLog and would silently fall through
  // to the legacy commentary renderer and show the wrong story.
  if (breakdown && breakdown.legacy !== true && Array.isArray(breakdown.eventLog)) {
    const {
      fightId,
      header,
      introTemplateKey,
      resultContextKey,
      rounds,
      eventLog,
      outcome,
      youWon,
    } = breakdown;

    const playerName = playerNameProp ?? header?.playerName ?? "You";
    const opponentName = header?.opponentName ?? "Opponent";

    // Extract finish details for result text.
    // Covers legacy tko_finish key + the two split keys the backend now emits.
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

    return (
      <div className="card" style={{ height: "fit-content" }}>
        <div className="card-label">Fight Description</div>
        <div className="right-col fd-new">
          <IntroRow
            introTemplateKey={introTemplateKey}
            playerName={playerName}
            opponentName={opponentName}
            fightId={fightId}
          />

          {(rounds ?? []).map((r, i) => {
            const roundEvents = (eventLog ?? []).filter((e) => e.round === r.round);
            return (
              <div key={r.round}>
                {i > 0 && <div className="round-divider" />}
                <RoundBlock
                  round={r}
                  events={roundEvents}
                  names={{ playerName, opponentName }}
                  fightId={fightId}
                  variant="summary"
                />
              </div>
            );
          })}

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
    );
  }

  // ── Legacy path ─────────────────────────────────────────────────────────────
  // Use breakdown.commentary if available, otherwise fall back to commentary prop
  const lines = breakdown?.commentary ?? commentary ?? [];
  if (!lines.length) return null;

  const n = lines.length;

  return (
    <div className="card" style={{ height: "fit-content" }}>
      <div className="card-label">Fight Description</div>
      <div className="round-list">
        {lines.map((line, i) => {
          const isResult = i === n - 1 && n > 1 ? true : n === 1;
          const isIntro = i === 0 && n > 1;

          if (isResult) {
            return (
              <div key={i} className="round-row">
                <span className="round-label">Result</span>
                <span className="round-text round-text--final">{line}</span>
              </div>
            );
          }

          if (isIntro) {
            return (
              <div key={i} className="round-row">
                <span className="round-label">Intro</span>
                <span className="round-text">{line}</span>
              </div>
            );
          }

          const match = line.match(/^Round (\d+):\s*/);
          if (match) {
            return (
              <div key={i} className="round-row">
                <span className="round-label">Round {match[1]}</span>
                <span className="round-text">{line.slice(match[0].length)}</span>
              </div>
            );
          }

          return (
            <div key={i} className="round-row">
              <span className="round-label" />
              <span className="round-text round-text--indent">{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
