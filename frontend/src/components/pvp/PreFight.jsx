import { useState } from "react";
import { Zap, ChevronLeft } from "lucide-react";
import { gameplanLabel } from "./pvpConst";
import { GameplanPicker } from "./GameplanPicker";
import { api } from "../../api";
import { t } from "../../lib/i18n";

/**
 * Screen 2 — Pre-Fight.
 * Shows VS header, gameplan picker, opponent intel, fight button.
 * On success transitions to FightResult via onFightComplete callback.
 */
export function PreFight({ fighter, candidate, season, myRecord, onBack, onFightComplete }) {
  const [gameplan, setGameplan] = useState("balanced");
  const [fighting, setFighting] = useState(false);
  const [error, setError] = useState(null);

  const energyCur = fighter?.energy?.current ?? 0;
  const energyAfter = Math.max(0, energyCur - 15);

  // Fight-blocking injury: any active injury with cannotFight === true
  const blockingInjury = (fighter?.injuries ?? []).find((inj) => inj.cannotFight);
  const isInjuryBlocked = !!blockingInjury;

  // Low HP advisory (< 50) — warns but does not block
  const health = fighter?.health ?? 100;
  const isLowHp = health < 50 && !isInjuryBlocked;

  const canFight = energyCur >= 15 && !fighting && !isInjuryBlocked;

  const bracketLabel = {
    none: null,
    plus10: t("pvp.preFight.bracketPlus10"),
    plus25: t("pvp.preFight.bracketPlus25"),
  }[candidate?.bracketBonus ?? "none"];

  async function handleFight() {
    if (!canFight) return;
    setFighting(true);
    setError(null);
    try {
      const result = await api.pvpFight({
        defenderId: candidate.playerId,
        gameplan,
        seasonId: season.id,
        weightClass: season.weightClass,
      });
      onFightComplete(result);
    } catch (e) {
      const code = e.code ?? e.errorCode ?? null;
      setError(
        code === "attacker_injured"
          ? t("pvp.preFight.errInjured")
          : code === "defender_recovering"
            ? t("pvp.preFight.errDefenderRecovering")
            : e.status === 402
              ? t("pvp.preFight.errNotEnoughEnergy")
              : e.status === 403
                ? e.message?.toLowerCase().includes("injur") || code?.includes("injur")
                  ? t("pvp.preFight.errInjured")
                  : t("pvp.preFight.errLocked")
                : e.status === 409
                  ? e.message?.toLowerCase().includes("recover")
                    ? t("pvp.preFight.errDefenderRecovering")
                    : t("pvp.preFight.errProtected")
                  : e.message || t("pvp.preFight.errDefault")
      );
    } finally {
      setFighting(false);
    }
  }

  return (
    <div className="pvp-card">
      {/* Nav */}
      <div className="pvp-card-nav">
        <button className="pvp-cnav-back" onClick={onBack}>
          <ChevronLeft size={14} strokeWidth={2.5} /> {t("common.back")}
        </button>
        <div className="pvp-cnav-title">{t("pvp.preFight.navTitle")}</div>
        <div className="pvp-cnav-right">
          <Zap size={12} strokeWidth={2} /> {t("pvp.preFight.energyDisplay", { n: energyCur })}
        </div>
      </div>

      {/* VS Hero */}
      <div className="pvp-pf-hero">
        <div className="pvp-pf-glow" />
        <div className="pvp-pf-vs">
          {/* You */}
          <div className="pvp-pf-fighter">
            <div className="pvp-pf-name">
              {fighter?.firstName} {fighter?.lastName}
            </div>
            <div className="pvp-pf-meta">
              {myRecord && (
                <span
                  className="pvp-div-badge"
                  style={{ color: myRecord.divisionColor, background: `rgba(0,0,0,0.1)`, border: `1px solid ${myRecord.divisionColor}40` }}
                >
                  {myRecord.division}
                </span>
              )}
              <span style={{ color: "#555" }}>OVR {fighter?.overallRating ?? "—"}</span>
              {myRecord && <span style={{ color: "#555" }}>{(myRecord.dp ?? 0).toLocaleString()} DP</span>}
            </div>
          </div>

          <div className="pvp-pf-sep">VS</div>

          {/* Opponent */}
          <div className="pvp-pf-fighter pvp-pf-right">
            <div className="pvp-pf-name" style={{ textAlign: "right" }}>{candidate.name}</div>
            <div className="pvp-pf-meta" style={{ justifyContent: "flex-end" }}>
              {candidate.fightingStyle && (
                <span className="pvp-mc-style">{candidate.fightingStyle}</span>
              )}
              <span style={{ color: "#555" }}>{(candidate.dp ?? 0).toLocaleString()} DP</span>
              <span style={{ color: "#555" }}>OVR {candidate.overallRating ?? "—"}</span>
              {season?.crossWeightClass && candidate.realWeightClass && (
                <span className="pvp-wc-pill">{candidate.realWeightClass}</span>
              )}
              <span
                className="pvp-div-badge"
                style={{ color: candidate.divisionColor, background: `rgba(0,0,0,0.1)`, border: `1px solid ${candidate.divisionColor}40` }}
              >
                {candidate.division}
              </span>
            </div>
          </div>
        </div>

        {/* Flags row */}
        <div className="pvp-pf-flags">
          {candidate.isRival && (
            <span className="pvp-pf-flag pvp-pf-flag-rival">
              {t("pvp.preFight.rivalFlag")}
            </span>
          )}
          {candidate.isBeltHolder && (
            <span className="pvp-pf-flag pvp-pf-flag-belt">
              {t("pvp.preFight.beltFlag")}
            </span>
          )}
          {bracketLabel && (
            <span className="pvp-pf-flag pvp-pf-flag-bracket">{bracketLabel}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="pvp-pf-body">
        {/* Gameplan picker */}
        <div>
          <div className="pvp-section-lbl" style={{ marginBottom: 8 }}>{t("pvp.preFight.gameplanLabel")}</div>
          <GameplanPicker
            selected={gameplan}
            onSelect={setGameplan}
            fighter={fighter}
          />
        </div>

        {/* Opponent intel */}
        <div className="pvp-intel-card">
          <div className="pvp-intel-title">{t("pvp.preFight.opponentIntelTitle", { name: candidate.name })}</div>
          <div className="pvp-intel-grid">
            <div className="pvp-ig">
              <div className="pvp-ig-v">{candidate.wins ?? 0}-{candidate.losses ?? 0}</div>
              <div className="pvp-ig-l">{t("pvp.preFight.intelWL")}</div>
              <div className="pvp-ig-hint">{t("pvp.preFight.intelWLHint", { wins: candidate.wins ?? 0, losses: candidate.losses ?? 0 })}</div>
            </div>
            <div className="pvp-ig">
              <div className="pvp-ig-v">{candidate.overallRating ?? "—"}</div>
              <div className="pvp-ig-l">{t("pvp.preFight.intelOvr")}</div>
              <div className={`pvp-ig-hint ${candidate.difficulty === "hard" ? "pvp-ig-r" : candidate.difficulty === "easy" ? "pvp-ig-w" : ""}`}>
                {candidate.difficulty === "hard" ? t("pvp.preFight.intelDiffHard") : candidate.difficulty === "easy" ? t("pvp.preFight.intelDiffEasy") : t("pvp.preFight.intelDiffEven")}
              </div>
            </div>
            <div className="pvp-ig">
              <div className="pvp-ig-v">{(candidate.dp ?? 0).toLocaleString()}</div>
              <div className="pvp-ig-l">{t("pvp.preFight.intelDp")}</div>
            </div>
            <div className="pvp-ig">
              <div className="pvp-ig-v">{gameplanLabel(candidate.defenseGameplan)}</div>
              <div className="pvp-ig-l">{t("pvp.preFight.intelDefense")}</div>
              <div className="pvp-ig-hint">{t("pvp.preFight.intelDefenseHint")}</div>
            </div>
          </div>
        </div>

        {/* Injury-blocked notice — disables fighting */}
        {isInjuryBlocked && (
          <div className="pvp-pf-injury-block">
            <span className="pvp-pf-injury-block-icon">+</span>
            {t("pvp.preFight.injuryBlockMsg")}
            <div className="pvp-pf-injury-block-sub">
              {t("pvp.preFight.injuryBlockSub", { label: blockingInjury.label ?? "Injury" })}
            </div>
          </div>
        )}

        {/* Low HP advisory — does not block fighting */}
        {isLowHp && (
          <div className="pvp-pf-low-hp">
            {t("pvp.preFight.lowHpMsg", { hp: health })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="pvp-error-note">{error}</div>
        )}

        {/* Fight button */}
        <button
          className="pvp-fight-btn"
          onClick={handleFight}
          disabled={!canFight}
          style={!canFight ? { opacity: 0.5, cursor: "not-allowed" } : {}}
        >
          {fighting ? t("pvp.preFight.fightBtnFighting") : t("pvp.preFight.fightBtnReady")}
        </button>
        <div className="pvp-energy-note">
          {isInjuryBlocked
            ? t("pvp.preFight.energyNoteInjured")
            : canFight
              ? t("pvp.preFight.energyNoteAfter", { n: energyAfter })
              : energyCur < 15
                ? t("pvp.preFight.energyNoteLow")
                : ""}
        </div>
      </div>
    </div>
  );
}
