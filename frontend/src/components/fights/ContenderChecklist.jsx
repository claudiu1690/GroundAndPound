import { memo } from "react";
import { Check, X, Trophy } from "lucide-react";
import { TITLE_WINS } from "../../constants/gameConstants";

/**
 * Always-visible "Path to the belt" checklist shown at the top of the Fight
 * Offers panel while the player is a title CONTENDER but the shot is not yet
 * ready. Everything is derived from the fighter doc + TITLE_WINS — no backend
 * dependency. The champion's name is read from the loaded title-shot offer if
 * one is present, otherwise a sensible fallback is used.
 *
 * Render gating (handled by the caller, but also guarded here): only when
 *   fighter.pendingPromotion is set AND the shot is not ready
 *   (cooldown > 0 OR not top-5 OR winsInCurrentTier < titleWins).
 */
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ChecklistRow({ state, children }) {
  // state: "met" | "unmet" | "pending"
  const icon =
    state === "met" ? <Check size={14} className="cc-row-icon" />
    : state === "unmet" ? <X size={14} className="cc-row-icon" />
    : <span className="cc-row-dot" aria-hidden="true">▱</span>;
  return (
    <li className={`cc-row cc-row--${state}`}>
      <span className="cc-row-glyph">{icon}</span>
      <span className="cc-row-text">{children}</span>
    </li>
  );
}

export const ContenderChecklist = memo(function ContenderChecklist({ fighter, offers }) {
  if (!fighter?.pendingPromotion) return null;

  const targetTier = fighter.pendingPromotion;
  const isProDebut = targetTier === "Regional Pro";
  const currentTier = fighter.promotionTier ?? "Amateur";
  const rank = fighter.ranking?.rank ?? null;
  const top5 = rank != null && rank <= 5;
  const wins = fighter.winsInCurrentTier ?? 0;
  const titleWins = TITLE_WINS[currentTier] ?? 3;
  const cooldown = fighter.titleShotCooldown ?? 0;

  const shotReady = cooldown <= 0 && top5 && wins >= titleWins;
  // Caller already gates on this, but stay defensive so the panel never lingers.
  if (shotReady) return null;

  // Champion name — prefer the loaded title-shot offer; fall back by tier.
  const titleOffer = (offers ?? []).find((o) => o?.type === "TitleShot");
  const champName =
    titleOffer?.opponent?.name
    ?? (isProDebut ? "the Amateur champion" : "the champion");

  const header = isProDebut ? "Path to Turning Pro" : `Path to the ${currentTier} Belt`;
  const subLine = isProDebut
    ? "Beat the Amateur champion to turn pro."
    : `Beat ${champName} to claim the ${currentTier} belt.`;

  // Top-5 row content.
  let top5State;
  let top5Text;
  if (top5) {
    top5State = "met";
    top5Text = `Ranked top 5 (currently #${rank})`;
  } else if (rank != null) {
    top5State = "unmet";
    top5Text = `Ranked top 5 — currently #${rank}`;
  } else {
    top5State = "unmet";
    top5Text = "Ranked top 5 — get ranked first (keep fighting in this tier)";
  }

  const winsMet = wins >= titleWins;

  // Footer — a single actionable line, matching the locked-card precedence.
  let footer;
  if (cooldown > 0) {
    footer = `Title shot locked — win ${plural(cooldown, "fight")} to earn a rematch (${2 - cooldown}/2).`;
  } else if (!top5) {
    footer = isProDebut
      ? "Break into the top 5 to unlock your Turn Pro fight."
      : "Break into the top 5 to unlock your title shot.";
  } else if (wins < titleWins) {
    footer = `Win ${plural(titleWins - wins, "fight")} in this tier to unlock your ${isProDebut ? "Turn Pro fight." : "title shot."}`;
  } else {
    footer = `Your shot is ready — request offers and ${isProDebut ? "turn pro." : "take the title shot."}`;
  }

  return (
    <div className="contender-checklist" role="status">
      <div className="cc-header">
        <Trophy size={15} className="cc-header-icon" />
        <div className="cc-header-text">
          <div className="cc-title">{header}</div>
          <div className="cc-sub">{subLine}</div>
        </div>
      </div>

      <ul className="cc-list">
        <ChecklistRow state="met">Rating — championship level reached</ChecklistRow>
        <ChecklistRow state={top5State}>{top5Text}</ChecklistRow>
        <ChecklistRow state={winsMet ? "met" : "pending"}>
          Win {titleWins} fights in tier ({wins}/{titleWins})
        </ChecklistRow>
        {cooldown > 0 && (
          <ChecklistRow state="pending">
            Recover from your title loss — win {cooldown} more ({2 - cooldown}/2)
          </ChecklistRow>
        )}
      </ul>

      <div className="cc-footer">{footer}</div>
    </div>
  );
});
