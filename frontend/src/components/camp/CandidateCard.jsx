import { memo } from "react";
import { Clock } from "lucide-react";
import { t } from "@/lib/i18n";
import { TraitChip } from "./CoachPanel";
import { TeachList } from "./TeachList";
import { rarityColor } from "./campConstants";

/**
 * One Trainer Market candidate — the hire "pack" card (Phase 1, F2).
 *
 * Rarity gets the same frame + glow treatment as a hired coach's avatar
 * (`rarityColor` + the `--rc` custom property already used by `.yc-avatar`),
 * the trait chip is the exact `CoachPanel#TraitChip` component (one look,
 * never two), and the FULL visible teach pool renders via the existing
 * `TeachList` — the candidate's `teaches[]` shape is identical to a coach's
 * (`{moveId,name,rarity,state,rankReq}`), so no new list component is needed.
 *
 * `canHire` / `blockedReason` are advisory (contract §3.2 — the hire endpoint
 * is the authority), but a blocked candidate is rendered HONESTLY: dimmed,
 * with the exact `blockedLabel` shown next to a real (disabled, not hidden)
 * Hire button — never a silently-dead control.
 */
export const CandidateCard = memo(function CandidateCard({ candidate, resetsInDays, hiring, onHire }) {
  const color = rarityColor(candidate.rarity);
  const feeDiscounted = candidate.hireFee !== candidate.hireFeeBase;
  const blocked = !candidate.canHire;

  return (
    <div className={`yc-cand-card${blocked ? " blocked" : ""}`} style={{ "--rc": color }} data-rarity={candidate.rarity}>
      <div className="yc-cand-head">
        <div className="yc-avatar yc-cand-avatar" style={{ "--rc": color }}>{candidate.initials}</div>
        <div className="yc-cand-id">
          <div className="yc-cand-name-row">
            <span className="yc-cand-name">{candidate.name}</span>
            <span className="yc-rarity-tag" data-rarity={candidate.rarity}>{candidate.rarity}</span>
          </div>
          <div className="yc-cand-archetype">{candidate.archetypeLabel}</div>
        </div>
        {resetsInDays != null && (
          <div className="yc-cand-expiry">
            <Clock size={11} /> {t("yourCamp.market.goneInDays", { n: resetsInDays })}
          </div>
        )}
      </div>

      <div className="yc-cand-trait-row">
        <TraitChip trait={candidate.trait} />
      </div>

      <div className="yc-cand-econ">
        <div className="yc-cand-econ-item">
          <span className="yc-cand-econ-label">{t("yourCamp.market.hireFee")}</span>
          <span className="yc-cand-econ-val">
            {feeDiscounted && <s className="yc-cand-econ-strike">${candidate.hireFeeBase.toLocaleString()}</s>}
            ${candidate.hireFee.toLocaleString()}
          </span>
        </div>
        <div className="yc-cand-econ-item">
          <span className="yc-cand-econ-label">{t("yourCamp.market.wage")}</span>
          <span className="yc-cand-econ-val">{t("yourCamp.panel.wageValue", { amount: (candidate.wage || 0).toLocaleString() })}</span>
        </div>
      </div>

      {candidate.familiarityPreview && (
        <div className="yc-cand-familiarity">
          {t("yourCamp.market.familiarityPreview", {
            sessions: candidate.familiarityPreview.sessions,
            wins: candidate.familiarityPreview.wins,
          })}
        </div>
      )}

      <div className="yc-cand-teach">
        <div className="yc-cand-teach-label">{candidate.teachBreadthLabel}</div>
        <TeachList teaches={candidate.teaches} />
      </div>

      <button
        type="button"
        className={`yc-cand-hire-btn${blocked ? " blocked" : ""}`}
        disabled={blocked || hiring}
        title={blocked ? candidate.blockedLabel : undefined}
        onClick={() => onHire(candidate)}
      >
        {hiring ? t("yourCamp.market.hiring") : t("yourCamp.market.hire")}
      </button>
      {blocked && <div className="yc-cand-blocked-reason">{candidate.blockedLabel}</div>}
    </div>
  );
});
