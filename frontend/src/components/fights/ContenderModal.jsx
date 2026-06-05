import { memo } from "react";
import { createPortal } from "react-dom";
import { Trophy } from "lucide-react";
import { TITLE_WINS } from "../../constants/gameConstants";

/**
 * One-time announcement shown the moment a fighter becomes a title CONTENDER
 * (pendingPromotion transitions absent → set). Fires once per contender
 * lifecycle (gated by a localStorage key in App.jsx); after that the persistent
 * ContenderChecklist panel carries the same information.
 *
 * Props:
 *   open          — whether to render
 *   currentTier   — the fighter's current promotionTier
 *   targetTier    — the tier being entered (fighter.pendingPromotion)
 *   champName     — the champion's display name, or null
 *   onClose       — close handler (also persists the seen key)
 */
export const ContenderModal = memo(function ContenderModal({
  open,
  currentTier,
  targetTier,
  champName,
  onClose,
}) {
  if (!open) return null;

  const isProDebut = targetTier === "Regional Pro";
  const titleWins = TITLE_WINS[currentTier] ?? 3;

  const heading = isProDebut
    ? "You're ready to turn pro"
    : `You're a ${currentTier} title contender`;

  const body = isProDebut
    ? "Your rating has reached pro level. Beat the Amateur champion to turn pro and promote to Regional Pro."
    : `Your rating has reached championship level. ${champName || "The champion"} holds the ${currentTier} belt — beat them and it's yours.`;

  const step1 = isProDebut
    ? "Be ranked top 5 as an Amateur"
    : `Be ranked top 5 in the ${currentTier} division`;
  const step2 = isProDebut
    ? `Win ${titleWins} fights at Amateur`
    : `Win ${titleWins} fights in this tier`;

  const closer = isProDebut
    ? "When both are met, a Turn Pro card appears in your Fight Offers."
    : "When both are met, a Title Shot card appears in your Fight Offers.";

  return createPortal(
    <div className="contender-modal-overlay" role="dialog" aria-modal="true" aria-label="Title contender">
      <div className="contender-modal">
        <div className="contender-modal-crest">
          <Trophy size={26} />
        </div>
        <div className="contender-modal-eyebrow">CONTENDER</div>
        <h2 className="contender-modal-heading">{heading}</h2>
        <p className="contender-modal-body">{body}</p>

        <div className="contender-modal-steps-label">To earn your shot:</div>
        <ol className="contender-modal-steps">
          <li>
            <span className="cms-num">1</span>
            <span className="cms-text">{step1}</span>
          </li>
          <li>
            <span className="cms-num">2</span>
            <span className="cms-text">{step2}</span>
          </li>
        </ol>

        <p className="contender-modal-closer">{closer}</p>

        <button type="button" className="btn btn-title contender-modal-btn" onClick={onClose}>
          Got it — show my path
        </button>
      </div>
    </div>,
    document.body
  );
});
