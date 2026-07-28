import { memo, useState } from "react";
import { Smile, Frown, Info, TrendingUp, X, UserMinus, ShieldCheck } from "lucide-react";
import { t } from "@/lib/i18n";
import { DrillCard } from "./DrillCard";
import { DevelopmentTrack } from "./DevelopmentTrack";
import { TeachList } from "./TeachList";
import { rarityColor, moraleToneClass } from "./campConstants";
import { resolveBoosterDisplay, boosterEffectLine, pctLabel } from "../shop/shopConstants";

/**
 * Exported (Phase 1) so `CandidateCard` renders the exact same trait chip
 * on a market candidate as on a hired coach — one look, one component, per
 * the architect contract ("matches CoachPanel.jsx#TraitChip exactly — zero
 * FE changes to that component").
 */
export function TraitChip({ trait }) {
  if (!trait) {
    return <div className="yc-cm-trait-chip"><span className="yc-cm-trait-none">{t("yourCamp.panel.noTrait")}</span></div>;
  }
  return (
    <div className="yc-cm-trait-chip">
      <span className={`yc-cm-trait-name${trait.caution ? " caution" : ""}`}>{trait.name}</span>
      <span className="yc-cm-trait-desc">{trait.desc}</span>
    </div>
  );
}

function BoosterStrip({ activeBooster }) {
  if (!activeBooster) {
    return (
      <div className="yc-booster-none">
        <span>{t("yourCamp.panel.noBooster")}</span>
      </div>
    );
  }
  return (
    <div className="yc-booster-strip">
      <span className="yc-booster-icon"><TrendingUp size={13} /></span>
      <span>
        <span className="yc-booster-name">{activeBooster.name}</span>{" "}
        <span className="yc-booster-effect">
          +{pctLabel(activeBooster.pct)}% <b>{boosterEffectLine(activeBooster)}</b>
        </span>
      </span>
      <span className="yc-booster-left">
        <b>{activeBooster.sessionsLeft}</b> {t("yourCamp.panel.sessionsLeftSuffix", { total: activeBooster.totalSessions ?? activeBooster.sessionsLeft })}
      </span>
    </div>
  );
}

/**
 * The selected coach's full detail: identity, mood, his drills (with the
 * session-key panel), development track + promote flow, and what he teaches.
 */
const BATCH_MODES = ["1", "5", "10", "max"];

/**
 * Resolve the effective batch quantity for one drill (owner pick 06-V1):
 * mode ×N clamps to what energy affords and the API's 25-session cap; MAX is
 * "as many as energy allows". Never returns less than 1 — an unaffordable
 * click still sends 1 and gets the server's not_enough_energy message, which
 * is clearer than a silently dead button.
 */
function resolveBatchQty(mode, drillEnergy, energyCurrent) {
  const affordable = drillEnergy > 0 ? Math.floor(energyCurrent / drillEnergy) : 1;
  const cap = Math.min(25, Math.max(1, affordable));
  if (mode === "max") return cap;
  return Math.min(Number(mode) || 1, cap);
}

export const CoachPanel = memo(function CoachPanel({ coach, fighter, training, onTrain, onPromote, promoting, onClaimPerk, claimingPerk, onClaimTeach, claimingTeach, actionError, batchMode = "1", onBatchModeChange, onFireRequest, firing }) {
  const [keyOpen, setKeyOpen] = useState(false);
  const energyCurrent = fighter?.energy?.current ?? fighter?.energy ?? 0;

  const activeBooster = fighter?.activeBooster && fighter.activeBooster.sessionsLeft > 0
    ? resolveBoosterDisplay(fighter.activeBooster)
    : null;

  const moraleTone = moraleToneClass(coach.morale?.tone);
  const color = rarityColor(coach.rarity);

  const toggleKey = () => setKeyOpen((prev) => !prev);

  return (
    <div className="yc-coach-main" id="yc-coach-main">
      <div className="yc-cm-header">
        <div className="yc-avatar" style={{ "--rc": color, width: 78, height: 78, fontSize: 26, borderRadius: 12 }}>
          {coach.initials}
        </div>
        <div className="yc-cm-id-block">
          <div className="yc-cm-name-row">
            <span className="yc-cm-name">{coach.name}</span>
            <span className="yc-rarity-tag" data-rarity={coach.rarity}>{coach.rarity}</span>
          </div>
          <div className="yc-cm-archetype">{coach.archetypeLabel}</div>
          <div className="yc-cm-meta-row">
            <div className="yc-cm-meta-item">
              <span className="yc-cm-meta-label">{t("yourCamp.panel.wage")}</span>
              <span className="yc-cm-meta-val">{t("yourCamp.panel.wageValue", { amount: (coach.wage || 0).toLocaleString() })}</span>
            </div>
            <div className="yc-cm-meta-item">
              <span className="yc-cm-meta-label">{t("yourCamp.panel.tenure")}</span>
              <span className="yc-cm-meta-val">{coach.tenureLabel}</span>
            </div>
            <div className="yc-cm-meta-item">
              <span className="yc-cm-meta-label">{t("yourCamp.panel.trait")}</span>
              <TraitChip trait={coach.trait} />
            </div>
            {/* Camp-wide passive (CONDITIONING only today). This is the answer to "why keep
                him once my stamina and condition are full" — it never caps and it applies to
                sessions run with the OTHER coaches, so it earns its slot passively. */}
            {coach.passive && (
              <div className="yc-cm-meta-item">
                <span className="yc-cm-meta-label">{coach.passive.label}</span>
                <span className="yc-cm-passive">
                  <ShieldCheck size={11} /> {coach.passive.effect}
                </span>
              </div>
            )}
            <div className="yc-cm-meta-item">
              <span className="yc-cm-meta-label">{t("yourCamp.panel.xpMultiplier")}</span>
              <span className="yc-cm-meta-val">{t("yourCamp.panel.xpMultiplierVal", { mult: (coach.xpMultiplier ?? 1).toFixed(2) })}</span>
              {coach.xpMultiplierNote && <span className="yc-cm-xp-note">{coach.xpMultiplierNote}</span>}
            </div>
          </div>
        </div>

        {/* Fire — hidden entirely (not disabled) when canFire is false, per
            contract: the last coach in camp can never be fired at any tier,
            and that's a structural fact, not a transient block. */}
        {coach.canFire !== false && (
          <button
            type="button"
            className="yc-fire-btn"
            disabled={firing}
            onClick={onFireRequest}
            title={t("yourCamp.fire.button")}
          >
            <UserMinus size={12} /> {firing ? t("yourCamp.fire.firing") : t("yourCamp.fire.button")}
          </button>
        )}
      </div>

      <div className={`yc-mood-banner ${moraleTone}`}>
        <div className="yc-mood-banner-icon">
          {moraleTone === "good" ? <Smile size={16} /> : <Frown size={16} />}
        </div>
        <div className="yc-mood-banner-text">
          <b>{coach.morale?.label}.</b> <span className="yc-mood-banner-fix">{coach.morale?.note}</span>
        </div>
        <div className="yc-mood-score">
          <div className="yc-mood-score-val">{coach.morale?.value}</div>
          <div className="yc-mood-score-lbl">{t("yourCamp.panel.morale")}</div>
        </div>
      </div>

      {actionError && <div className="yc-action-error">{actionError}</div>}

      <div className="yc-cm-section">
        <div className="yc-cm-section-head">
          <div className="yc-section-title" style={{ fontSize: 13 }}>{t("yourCamp.panel.hisDrills", { name: coach.name.split(" ")[0] })}</div>
          <div className="yc-drills-tools">
            <div className="yc-batch-segs" role="radiogroup" aria-label={t("yourCamp.panel.batchAria")}>
              {BATCH_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={batchMode === m}
                  className={`yc-batch-seg${batchMode === m ? " on" : ""}`}
                  onClick={() => onBatchModeChange?.(m)}
                >
                  {m === "max" ? t("yourCamp.panel.batchMax") : `×${m}`}
                </button>
              ))}
            </div>
            <button type="button" className="yc-key-btn" onClick={toggleKey}>
              <Info size={11} /> {t("yourCamp.panel.sessionKey")}
            </button>
          </div>
        </div>

        {keyOpen && <div className="yc-key-backdrop show" onClick={() => setKeyOpen(false)} />}
        <div className={`yc-key-panel${keyOpen ? " open" : ""}`}>
          <div className="yc-key-panel-close-row">
            <button type="button" className="yc-key-panel-close" onClick={() => setKeyOpen(false)} aria-label={t("common.close")}>
              <X size={14} />
            </button>
          </div>
          <div><b>{t("yourCamp.panel.keyEnergy")}</b> — {t("yourCamp.panel.keyEnergyDesc")}</div>
          <div><b>{t("yourCamp.panel.keyInjury")}</b> — {t("yourCamp.panel.keyInjuryDesc")}</div>
          <div><b>{t("yourCamp.panel.keyDrop")}</b> — {t("yourCamp.panel.keyDropDesc")}</div>
          <div><b>{t("yourCamp.panel.keyCondition")}</b> — {t("yourCamp.panel.keyConditionDesc")}</div>
          <div><b>{t("yourCamp.panel.keyXp")}</b> — {t("yourCamp.panel.keyXpDesc")}</div>
        </div>

        <BoosterStrip activeBooster={activeBooster} />

        <div className="yc-drills-grid">
          {coach.drills.map((d) => (
            <DrillCard
              key={d.key}
              drill={d}
              activeBooster={activeBooster}
              disabled={training}
              busy={training}
              batchQty={d.locked ? 1 : resolveBatchQty(batchMode, d.energy, energyCurrent)}
              onTrain={onTrain}
            />
          ))}
        </div>
      </div>

      <div className="yc-cm-section">
        <div className="yc-cm-section-head">
          <div className="yc-section-title" style={{ fontSize: 13 }}>{t("yourCamp.panel.developmentTrack")}</div>
        </div>
        <DevelopmentTrack
          coach={coach}
          onPromote={onPromote}
          promoting={promoting}
          onClaimPerk={onClaimPerk}
          claimingPerk={claimingPerk}
        />
      </div>

      <div className="yc-cm-section">
        <div className="yc-cm-section-head">
          <div className="yc-section-title" style={{ fontSize: 13 }}>{t("yourCamp.panel.whatHeTeaches")}</div>
        </div>
        <TeachList teaches={coach.teaches} onClaim={onClaimTeach} claiming={claimingTeach} />
      </div>
    </div>
  );
});
