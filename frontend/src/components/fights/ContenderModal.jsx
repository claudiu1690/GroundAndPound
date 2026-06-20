import { memo } from "react";
import { createPortal } from "react-dom";
import { Trophy } from "lucide-react";
import { TITLE_WINS } from "../../constants/gameConstants";
import { t } from "@/lib/i18n";

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
    ? t("fights.contenderModal.headingPro")
    : t("fights.contenderModal.headingBelt", { tier: currentTier });

  const body = isProDebut
    ? t("fights.contenderModal.bodyPro")
    : t("fights.contenderModal.bodyBelt", { champ: champName || "The champion", tier: currentTier });

  const step1 = isProDebut
    ? t("fights.contenderModal.step1Pro")
    : t("fights.contenderModal.step1Belt", { tier: currentTier });
  const step2 = isProDebut
    ? t("fights.contenderModal.step2Pro", { n: titleWins })
    : t("fights.contenderModal.step2Belt", { n: titleWins });

  const closer = isProDebut
    ? t("fights.contenderModal.closerPro")
    : t("fights.contenderModal.closerBelt");

  return createPortal(
    <div className="contender-modal-overlay" role="dialog" aria-modal="true" aria-label="Title contender">
      <div className="contender-modal">
        <div className="contender-modal-crest">
          <Trophy size={26} />
        </div>
        <div className="contender-modal-eyebrow">{t("fights.contenderModal.eyebrow")}</div>
        <h2 className="contender-modal-heading">{heading}</h2>
        <p className="contender-modal-body">{body}</p>

        <div className="contender-modal-steps-label">{t("fights.contenderModal.stepsLabel")}</div>
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
          {t("fights.contenderModal.gotIt")}
        </button>
      </div>
    </div>,
    document.body
  );
});
