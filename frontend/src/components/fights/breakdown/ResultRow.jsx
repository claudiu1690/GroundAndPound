import { memo } from "react";
import { renderResult } from "./renderEvent.js";

/**
 * Maps the finish event's templateKey to the method string renderResult needs.
 * This is the authoritative mapping — result line always agrees with the
 * finish-event line because both come from the same stored vars.
 *
 *   submission_finish            → "submission"
 *   ko_finish                    → "ko"
 *   tko_finish_strike            → "ko"   (TKO maps to the win_ko / loss_ko family)
 *   tko_finish_ground            → "ko"
 *   tko_finish (legacy)          → "ko"
 *   anything else / absent       → null  (renderResult falls back to outcome string)
 */
function methodFromTemplateKey(templateKey) {
  if (!templateKey) return null;
  if (templateKey === "submission_finish") return "submission";
  if (
    templateKey === "ko_finish" ||
    templateKey === "tko_finish_strike" ||
    templateKey === "tko_finish_ground" ||
    templateKey === "tko_finish"
  ) return "ko";
  return null;
}

/**
 * Result row: round-badge "Result" (win/loss colour) + rendered result text.
 *
 * Props:
 *   outcome           — raw outcome string (e.g. "Win (Submission)")
 *   resultContextKey  — e.g. "standard", "nemesis", "giantKiller"
 *   playerName / opponentName / fightId / youWon
 *   finishSub         — vars.sub from the finish event
 *   finishStrike      — vars.strike from the finish event
 *   finishTemplateKey — templateKey of the finish event (drives method selection)
 */
export const ResultRow = memo(function ResultRow({
  outcome,
  resultContextKey,
  playerName,
  opponentName,
  fightId,
  youWon,
  finishSub,
  finishStrike,
  finishTemplateKey,
}) {
  const finishMethod = methodFromTemplateKey(finishTemplateKey);

  const text = renderResult(outcome, resultContextKey, {
    playerName,
    opponentName,
    sub: finishSub,
    strike: finishStrike,
    fightId,
    youWon,
    finishMethod,
  });

  const winClass = youWon ? "win" : "";
  const lcOutcome = (outcome ?? "").toLowerCase();
  const isDraw = lcOutcome.includes("draw");
  const badgeClass = isDraw ? "" : youWon ? "win" : "loss";

  return (
    <div className="result-row">
      <span className={`round-badge result${badgeClass ? ` ${badgeClass}` : ""}`}>Result</span>
      <span className={`result-txt${winClass ? ` ${winClass}` : ""}`}>{text}</span>
    </div>
  );
});
