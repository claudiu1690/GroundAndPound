import { memo } from "react";
import { Check, X, Trophy } from "lucide-react";
import { TITLE_WINS } from "../../constants/gameConstants";
import { t } from "@/lib/i18n";

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

  const header = isProDebut ? t("fights.contenderChecklist.pathToPro") : t("fights.contenderChecklist.pathToBelt", { tier: currentTier });
  const subLine = isProDebut
    ? t("fights.contenderChecklist.subLinePro")
    : t("fights.contenderChecklist.subLineBelt", { champ: champName, tier: currentTier });

  // Top-5 row content.
  let top5State;
  let top5Text;
  if (top5) {
    top5State = "met";
    top5Text = t("fights.contenderChecklist.rowTop5Met", { rank });
  } else if (rank != null) {
    top5State = "unmet";
    top5Text = t("fights.contenderChecklist.rowTop5Unmet", { rank });
  } else {
    top5State = "unmet";
    top5Text = t("fights.contenderChecklist.rowTop5Unranked");
  }

  const winsMet = wins >= titleWins;

  // Footer — a single actionable line, matching the locked-card precedence.
  let footer;
  if (cooldown > 0) {
    footer = t("fights.contenderChecklist.footerCooldown", { n: cooldown, plural: cooldown === 1 ? "" : "s", done: 2 - cooldown });
  } else if (!top5) {
    footer = isProDebut
      ? t("fights.contenderChecklist.footerTop5Pro")
      : t("fights.contenderChecklist.footerTop5Belt");
  } else if (wins < titleWins) {
    footer = isProDebut
      ? t("fights.contenderChecklist.footerWinsPro", { n: titleWins - wins, plural: (titleWins - wins) === 1 ? "" : "s" })
      : t("fights.contenderChecklist.footerWinsBelt", { n: titleWins - wins, plural: (titleWins - wins) === 1 ? "" : "s" });
  } else {
    footer = isProDebut ? t("fights.contenderChecklist.footerReadyPro") : t("fights.contenderChecklist.footerReadyBelt");
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
        <ChecklistRow state="met">{t("fights.contenderChecklist.rowRating")}</ChecklistRow>
        <ChecklistRow state={top5State}>{top5Text}</ChecklistRow>
        <ChecklistRow state={winsMet ? "met" : "pending"}>
          {t("fights.contenderChecklist.rowWins", { n: titleWins, current: wins, total: titleWins })}
        </ChecklistRow>
        {cooldown > 0 && (
          <ChecklistRow state="pending">
            {t("fights.contenderChecklist.rowCooldown", { n: cooldown, done: 2 - cooldown })}
          </ChecklistRow>
        )}
      </ul>

      <div className="cc-footer">{footer}</div>
    </div>
  );
});
