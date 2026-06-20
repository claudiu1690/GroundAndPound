import { Shield } from "lucide-react";
import { divisionLabel } from "./pvpConst";
import { ConsequencesBlock } from "./ConsequencesBlock";
import { t } from "../../lib/i18n";

/**
 * PlacementResult — shown when result.isPlacement is true.
 * Renders a placement-bout summary with no DP swing hero.
 * On result.placementComplete shows the final placement screen.
 *
 * Props:
 *   result    — FightResult DTO (with isPlacement, placement, placementComplete)
 *   onFightAgain    — continue to next placement or next fight
 *   onBackToLadder  — go back to ladder/hub (used on completion)
 */
export function PlacementResult({ result, onFightAgain, onBackToLadder }) {
  if (!result) return null;

  const {
    youWon,
    method,
    defender,
    placement,
    placementComplete,
    attacker,
    commentary,
    energyRemaining,
    consequences,
  } = result;

  const isDraw = method === "draw";
  const outcome = isDraw ? "draw" : youWon ? "win" : "loss";

  const fightNumber = placement?.fightNumber ?? 1;
  const totalFights = placement?.total ?? 3;
  const wins = placement?.wins ?? 0;
  const remaining = totalFights - fightNumber;

  const opponentName = defender?.name ?? "Opponent";

  function methodLabel(m) {
    if (!m || m === "draw") return "Decision";
    if (m === "ko") return "KO";
    if (m === "submission") return "Submission";
    if (m === "decision") return "Decision";
    return m;
  }

  // ── PLACEMENT COMPLETE SCREEN ──
  if (placementComplete) {
    const divisionAfter = attacker?.divisionAfter ?? attacker?.division ?? "";
    const dpAfter = attacker?.dpAfter ?? 0;

    return (
      <div className="pvp-card">
        <div className="pvp-card-nav">
          <div className="pvp-cnav-title">{t("pvp.placementResult.navTitleComplete")}</div>
          <div className="pvp-cnav-right">{t("pvp.placementResult.navRight")}</div>
        </div>

        {/* Completion hero */}
        <div className="pvp-rh pvp-rh-win">
          <div className="pvp-rh-glow pvp-rh-glow-win" />
          <div className="pvp-placement-complete-badge">
            <Shield size={28} strokeWidth={1.5} style={{ color: "#3B82F6", marginBottom: 6 }} />
          </div>
          <div className="pvp-rh-outcome-row">
            <span className="pvp-rh-outcome pvp-rh-outcome-win">{t("pvp.placementResult.completeBadgeOutcome")}</span>
          </div>
          <div className="pvp-rh-sub">
            {wins !== 1
              ? t("pvp.placementResult.completeSubPlural", { wins, total: totalFights })
              : t("pvp.placementResult.completeSub", { wins, total: totalFights })}
          </div>
        </div>

        {/* Starting position card */}
        <div className="pvp-placement-summary-card">
          <div className="pvp-ps-row">
            <div className="pvp-ps-item">
              <div className="pvp-ps-lbl">{t("pvp.placementResult.startingPositionLabel")}</div>
              <div className="pvp-ps-val">
                {t("pvp.placementResult.startingPositionValue", { division: divisionLabel(divisionAfter), dp: (dpAfter ?? 0).toLocaleString() })}
              </div>
            </div>
          </div>
          <div className="pvp-shield-banner" style={{ marginTop: 10 }}>
            <Shield size={13} strokeWidth={2} style={{ color: "#3B82F6", flexShrink: 0 }} />
            <div className="pvp-shield-text">
              {t("pvp.placementResult.shieldBanner")}
            </div>
          </div>
        </div>

        {/* Commentary */}
        {commentary && commentary.length > 0 && (
          <div className="pvp-commentary">
            {commentary.map((line, i) => (
              <div key={i} className="pvp-commentary-line">{line}</div>
            ))}
          </div>
        )}

        <div className="pvp-ra">
          <button className="pvp-ra-btn-prim" onClick={onBackToLadder}>{t("pvp.placementResult.enterLadderBtn")}</button>
        </div>
      </div>
    );
  }

  // ── PLACEMENT BOUT SCREEN ──
  return (
    <div className="pvp-card">
      <div className="pvp-card-nav">
        <div className="pvp-cnav-title">{t("pvp.placementResult.navTitleMatch")}</div>
        <div className="pvp-cnav-right">{t("pvp.placementResult.boutOf", { n: fightNumber, total: totalFights })}</div>
      </div>

      {/* Result hero — no DP swing */}
      <div className={`pvp-rh pvp-rh-${outcome}`}>
        <div className={`pvp-rh-glow pvp-rh-glow-${outcome}`} />

        {/* Placement bout label replaces DP number */}
        <div className="pvp-placement-bout-label">
          {t("pvp.placementResult.placementBoutLabel", { n: fightNumber, total: totalFights })}
        </div>

        <div className="pvp-rh-outcome-row">
          <span className={`pvp-rh-outcome pvp-rh-outcome-${outcome}`}>
            {isDraw ? t("pvp.fightResult.outcomeDraw") : youWon ? t("pvp.fightResult.outcomeWin") : t("pvp.fightResult.outcomeLoss")}
          </span>
          <span className={`pvp-rh-method pvp-rh-method-${outcome}`}>
            {methodLabel(method)}
          </span>
        </div>

        <div className="pvp-rh-sub">vs {opponentName}</div>

        <div className="pvp-rh-context">
          <span className="pvp-rh-ctx-pill pvp-rh-ctx-pill-base">{t("pvp.placementResult.noDpChange")}</span>
        </div>
      </div>

      {/* Placement progress */}
      <div className="pvp-dpb">
        <div className="pvp-dpb-title">{t("pvp.placementResult.placementProgressTitle")}</div>
        <div className="pvp-dpb-rows">
          <div className="pvp-dpb-row">
            <span className="pvp-dpb-lbl">{t("pvp.placementResult.boutLabel")}</span>
            <span className="pvp-dpb-val pvp-dpb-val-base">{fightNumber} of {totalFights}</span>
          </div>
          <div className="pvp-dpb-row">
            <span className="pvp-dpb-lbl">{t("pvp.placementResult.winsLabel")}</span>
            <span className="pvp-dpb-val pvp-dpb-val-win">{wins}</span>
          </div>
        </div>
        <div className="pvp-dpb-divider" />
        <div className="pvp-dpb-total">
          <span className="pvp-dpb-total-lbl">{t("pvp.placementResult.remainingLabel")}</span>
          <span className="pvp-dpb-total-val pvp-dpb-total-val-draw">
            {remaining !== 1
              ? t("pvp.placementResult.remainingFightPlural", { n: remaining })
              : t("pvp.placementResult.remainingFight", { n: remaining })}
          </span>
        </div>
      </div>

      {/* Commentary */}
      {commentary && commentary.length > 0 && (
        <div className="pvp-commentary">
          {commentary.map((line, i) => (
            <div key={i} className="pvp-commentary-line">{line}</div>
          ))}
        </div>
      )}

      {/* Consequences — attacker always gets full consequences even in placement */}
      <ConsequencesBlock
        consequences={consequences}
        defender={defender}
        isPlacement={!consequences}
      />

      {energyRemaining != null && (
        <div className="pvp-energy-remaining">
          {t("pvp.fightResult.energyRemaining", { n: energyRemaining })}
        </div>
      )}

      <div className="pvp-ra">
        <button className="pvp-ra-btn-prim" onClick={onFightAgain}>{t("pvp.placementResult.nextPlacementBtn")}</button>
        <button className="pvp-ra-btn-sec" onClick={onBackToLadder}>{t("pvp.placementResult.backToLadderBtn")}</button>
      </div>
    </div>
  );
}
