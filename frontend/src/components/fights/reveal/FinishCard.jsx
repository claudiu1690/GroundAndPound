import { t } from "@/lib/i18n";
import { FiredRows } from "../breakdown/YourCorner.jsx";
import { SCORE_ROW_MS } from "./revealModel.js";

function wordFor(outcomeWord) {
  const key = `reveal.word.${outcomeWord}`;
  const text = t(key);
  return text === key ? outcomeWord : text;
}

/**
 * The decision scorecard: one column per round (the same rounds the fight report scores), the
 * totals, each round coloured for whoever won it. Rounds fill in one after another.
 */
function Scorecard({ card, playerName, opponentName, stepMs, instant }) {
  const delay = (i) => (instant ? undefined : { animationDelay: `${Math.round(i * stepMs)}ms` });
  const cell = (r, side, i) => {
    const won = r.winner === (side === 0 ? "player" : "opponent");
    return (
      <td key={r.round} className={`fr-rv-sc-cell${won ? ` is-won is-won--${side === 0 ? "you" : "opp"}` : ""}`} style={delay(i)}>
        {r.score[side]}
      </td>
    );
  };
  const n = card.rows.length;
  return (
    <table className="fr-rv-scorecard" data-testid="reveal-scorecard">
      <caption className="fr-rv-sc-cap">{t("reveal.scorecard.title")}</caption>
      <thead>
        <tr>
          <th scope="col" aria-label={t("reveal.scorecard.fighter")} />
          {card.rows.map((r, i) => (
            <th key={r.round} scope="col" className="fr-rv-sc-cell" style={delay(i)}>{t("reveal.clockRound", { n: r.round })}</th>
          ))}
          <th scope="col" className="fr-rv-sc-total" style={delay(n)}>{t("reveal.scorecard.total")}</th>
        </tr>
      </thead>
      <tbody>
        {[playerName, opponentName].map((name, side) => (
          <tr key={side} className={side === 0 ? "is-you" : "is-opp"}>
            <th scope="row" className="fr-rv-sc-name">{name}</th>
            {card.rows.map((r, i) => cell(r, side, i))}
            <td className="fr-rv-sc-total" style={delay(n)}>{card.totals[side]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The result. Finishes: method, VICTORY / DEFEAT, and the result read out ("Stone wins by TKO,
 * round 3 at 2:14"). Decisions: the scorecard first, then who won under it. Both end with What
 * fired (true totals from the persisted loadout, so Skip and watching to the end agree). The See
 * result button lives in the controls row (FightReveal), in the slot Skip occupied.
 */
export function FinishCard({ item, playerName, opponentName, speed = 1, instant = false }) {
  const { methodKey, outcomeWord, youWon, finishRound, finishTime, tally, whatFired, winnerName, scorecard } = item;
  const isFinish = methodKey === "ko" || methodKey === "tko" || methodKey === "submission";
  const tone = methodKey === "draw" ? "draw" : youWon ? "win" : "loss";
  const hasRows = whatFired && (whatFired.moves.length > 0 || whatFired.camp.length > 0);
  const stepMs = SCORE_ROW_MS / (speed > 0 ? speed : 1);
  // The verdict waits for the last round and the totals to land.
  const verdictDelay = scorecard && !instant ? { animationDelay: `${Math.round((scorecard.rows.length + 1.5) * stepMs)}ms` } : undefined;

  let readOut = null;
  if (isFinish && winnerName) {
    readOut = finishRound != null && finishTime
      ? t("reveal.winsByAt", { name: winnerName, method: t(`reveal.methodWord.${methodKey}`), n: finishRound, time: finishTime })
      : t("reveal.winsBy", { name: winnerName, method: t(`reveal.methodWord.${methodKey}`) });
  } else if (scorecard) {
    const [p, o] = scorecard.totals;
    const score = youWon ? `${p}-${o}` : `${o}-${p}`;
    readOut = scorecard.kind === "draw" || !winnerName
      ? t("reveal.drawRead", { score: `${p}-${o}` })
      : t("reveal.winsByScore", { name: winnerName, method: t(`reveal.methodWord.${scorecard.kind}`), score });
  }

  return (
    <div className={`fr-rv-finish fr-rv-finish--${tone}${scorecard ? " has-card" : ""}`} data-testid="reveal-finish">
      {scorecard ? (
        <>
          <Scorecard card={scorecard} playerName={playerName} opponentName={opponentName} stepMs={stepMs} instant={instant} />
          <div className="fr-rv-verdict" style={verdictDelay} data-testid="reveal-verdict">
            <div className="fr-rv-finish-word">{wordFor(outcomeWord)}</div>
            {readOut && <div className="fr-rv-finish-sub">{readOut}</div>}
          </div>
        </>
      ) : (
        <>
          <div className="fr-rv-finish-method">{t(`reveal.finish.${methodKey}`)}</div>
          <div className="fr-rv-finish-word">{wordFor(outcomeWord)}</div>
          {readOut && <div className="fr-rv-finish-sub">{readOut}</div>}
          {!readOut && !isFinish && (
            <div className="fr-rv-finish-sub">{t("reveal.tally", { you: tally.player, opp: tally.opponent })}</div>
          )}
        </>
      )}
      {hasRows && (
        <div className="fr-rv-fired">
          <h4>{t("reveal.whatFired")}</h4>
          <FiredRows moves={whatFired.moves} camp={whatFired.camp} readiness={item.readiness} />
        </div>
      )}
    </div>
  );
}

export default FinishCard;
