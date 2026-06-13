import { memo } from "react";
import { renderIntro } from "./renderEvent.js";

/**
 * Intro row: round-badge "Intro" + rendered intro text.
 */
export const IntroRow = memo(function IntroRow({ introTemplateKey, playerName, opponentName, fightId }) {
  const text = renderIntro(introTemplateKey, { playerName, opponentName, fightId });
  return (
    <div className="intro-row">
      <span className="round-badge intro">Intro</span>
      <span className="intro-txt">{text}</span>
    </div>
  );
});
