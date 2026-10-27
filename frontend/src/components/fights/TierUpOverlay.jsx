import { memo } from "react";
import { createPortal } from "react-dom";
import { tierLabel } from "../../constants/fame";
import { Trophy, Star, Coins, Mic, Store } from "lucide-react";
import { t } from "@/lib/i18n";
import { TITLE_WINS, TOP_TIER } from "../../constants/gameConstants";

/**
 * Full-screen moment when fame peak tier increases (spec §14).
 */
export const TierUpOverlay = memo(function TierUpOverlay({ open, fromTier, toTier, onClose }) {
  if (!open) return null;

  return createPortal(
    <div className="tier-up-overlay" role="dialog" aria-modal="true" aria-label="Fame tier increased">
      <div className="tier-up-modal">
        <div className="tier-up-stripe" />
        <div className="tier-up-hero">
          <div className="tier-up-icon"><Star size={26} /></div>
          <p className="tier-up-eyebrow">{t("fights.tierUp.attention")}</p>
          <h2 className="tier-up-modal-title">{t("fights.tierUp.newFameTier")}</h2>
          <div className="tier-up-tier-transition">
            <span className="tier-up-old">{tierLabel(fromTier)}</span>
            <span className="tier-up-arrow-wrap"><span className="tier-up-arrow-line" /><span className="tier-up-arrow-head" /></span>
            <span className="tier-up-new">{tierLabel(toTier)}</span>
          </div>
          <p className="tier-up-desc">{t("fights.tierUp.desc")}</p>
        </div>
        <div className="tier-up-perks">
          <div className="tier-up-perk-row"><Coins size={16} className="tier-up-perk-icon" /><span className="tier-up-perk-text">{t("fights.tierUp.perkPurses", { tier: tierLabel(toTier) })}</span></div>
          <div className="tier-up-perk-row"><Mic size={16} className="tier-up-perk-icon" /><span className="tier-up-perk-text">{t("fights.tierUp.perkMedia")}</span></div>
          <div className="tier-up-perk-row"><Store size={16} className="tier-up-perk-icon" /><span className="tier-up-perk-text">{t("fights.tierUp.perkSponsorships")}</span></div>
        </div>
        <div className="tier-up-footer">
          <button type="button" className="tier-up-dismiss" onClick={onClose}>{t("fights.tierUp.continue")}</button>
        </div>
      </div>
    </div>
  , document.body);
});

/**
 * Belt celebration. `fromTier` is the tier whose belt was won (summary.beltTier).
 * `toTier` is null for a GCS win: there is no tier above, so no promotion row.
 * `titleDefense` is true when the fighter already held the GCS belt.
 */
export const BeltWonOverlay = memo(function BeltWonOverlay({ open, fromTier, toTier, titleDefense, gcsTitleWins, weightClass, onClose }) {
  if (!open) return null;
  const isGcsBelt = fromTier === TOP_TIER;
  const defended = !!titleDefense;
  const hint = isGcsBelt
    ? t("fights.tierUp.beltHintGcs", { n: TITLE_WINS[TOP_TIER] ?? 3 })
    : t("fights.tierUp.beltHint");
  return createPortal(
    <div className="tier-up-overlay" role="dialog" aria-modal="true" aria-label="Belt won">
      <div className="tier-up-modal" style={{ borderColor: "#d4a012", padding: "2rem 2.25rem", textAlign: "center" }}>
        <p className="tier-up-kicker" style={{ color: "#fbbf24" }}>{t("fights.tierUp.beltKicker")}</p>
        <h2 className="tier-up-title" style={{ color: "#fbbf24" }}>
          <Trophy size={24} /> {defended ? t("fights.tierUp.beltTitleDefended") : t("fights.tierUp.beltTitle")} <Trophy size={24} />
        </h2>
        <p className="tier-up-transition">
          {defended
            ? t("fights.tierUp.beltDefendedLine", { tier: fromTier, n: Math.max(1, (gcsTitleWins ?? 2) - 1) })
            : t("fights.tierUp.beltWonLine", { tier: fromTier })}
          <br />
          {t("fights.tierUp.beltWeightClass", { weightClass })}
        </p>
        {toTier ? (
          <p className="tier-up-transition">
            <span style={{ color: "var(--text-muted)" }}>{fromTier}</span>
            <span className="tier-up-arrow"> {"→"} </span>
            <span style={{ color: "#fbbf24" }}>{toTier}</span>
          </p>
        ) : null}
        <p className="tier-up-hint">
          {hint}
        </p>
        <button type="button" className="btn btn-title" onClick={onClose}>
          {t("fights.tierUp.continue")}
        </button>
      </div>
    </div>,
    document.body
  );
});
