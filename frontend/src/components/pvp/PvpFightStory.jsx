import { FightDescription } from "../fights/FightDescription";
import { useFightBreakdown } from "../../hooks/useFightBreakdown";

/**
 * PvpFightStory — the round-by-round account on the PvP result screens.
 *
 * Fetches the shaped breakdown (same view the career-feed drawer uses) and renders
 * it with FightDescription, so a PvP fight reads like a PvE one: intro, round
 * blocks, result. Until it loads, or if it fails, the plain commentary lines show.
 *
 * Props:
 *   fightId     {string|null}  PVPFight id from the resolve response
 *   commentary  {string[]}     engine commentary (fallback)
 *   playerName  {string}       the viewer's fighter name
 */
export function PvpFightStory({ fightId, commentary, playerName }) {
  const { data } = useFightBreakdown(fightId ? { fightId, kind: "pvp" } : null);

  if (data) {
    return (
      <div className="pvp-fight-story">
        <FightDescription breakdown={data} commentary={commentary} playerName={playerName} />
      </div>
    );
  }
  if (!commentary || commentary.length === 0) return null;
  return (
    <div className="pvp-commentary">
      {commentary.map((line, i) => (
        <div key={i} className="pvp-commentary-line">{line}</div>
      ))}
    </div>
  );
}
