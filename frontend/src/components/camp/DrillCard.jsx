import { memo } from "react";
import { Zap, Lock, Award } from "lucide-react";
import { t } from "@/lib/i18n";
import { Tip } from "./Tip";
import {
  injuryToneClass,
  dropToneClass,
  conditionDeltaToneClass,
  familyStripeClass,
  statChipClass,
  exclusiveDrillClass,
} from "./campConstants";
import { boosterAffectsStat, pctLabel } from "../shop/shopConstants";
import { STAT_TOOLTIPS } from "../../constants/statTooltips";

function ConditionValue({ delta }) {
  const cls = conditionDeltaToneClass(delta);
  const text = delta > 0 ? `+${delta}` : String(delta);
  return <span className={`yc-dmetric-val ${cls}`}>{text}</span>;
}

function InjuryValue({ pct }) {
  return <span className={`yc-dmetric-val ${injuryToneClass(pct)}`}>{pct}%</span>;
}

function DropValue({ pct }) {
  if (!pct) return <span className="yc-dmetric-val dash">—</span>;
  return <span className={`yc-dmetric-val ${dropToneClass(pct)}`}>{pct}%</span>;
}

/**
 * A single drill card (owner picks 05-V1 + 06-V1):
 *  - colored family stripe on top (spar red / bag amber / drill teal),
 *  - stat chips colored per stat family,
 *  - move-drop % rendered gold (it's the payoff, not a warning),
 *  - compact Train button that carries the active batch quantity and the
 *    total energy it will spend ("Train ×5 · ⚡45").
 *
 * `batchQty` is the resolved per-drill quantity (already clamped by the
 * caller against energy and the 25-session API cap). Locked drills arrive as
 * `{key,name,locked:true,unlockRank}` — no energy/stats fields present.
 */
export const DrillCard = memo(function DrillCard({ drill, activeBooster, disabled, busy, batchQty = 1, onTrain }) {
  if (drill.locked) {
    return (
      <div className={`yc-drill-card locked ${exclusiveDrillClass(drill.isExclusive)}`}>
        <div className="yc-drill-stripe plain" />
        <div className="yc-drill-in">
          {drill.isExclusive && (
            <div className="yc-drill-eyebrow">
              <Award size={10} /> {t("yourCamp.drill.masterclassEyebrow")}
            </div>
          )}
          <div className="yc-drill-top">
            <span className="yc-drill-name">{drill.name}</span>
            <span className="yc-energy-chip" style={{ opacity: 0.4 }}><Zap size={10} /> —</span>
          </div>
          <div className="yc-drill-stats">
            <span className="yc-stat-pill grey" style={{ opacity: 0.5 }}>???</span>
          </div>
          <div className="yc-lock-tag">
            <Lock size={10} /> {t("yourCamp.drill.unlocksAtRank", { rank: drill.unlockRank })}
          </div>
          <button type="button" className="yc-btn-train" disabled>
            {t("yourCamp.drill.rankRequired", { rank: drill.unlockRank })}
          </button>
        </div>
      </div>
    );
  }

  const boosted = activeBooster ? drill.stats.filter((s) => boosterAffectsStat(activeBooster, s)) : [];
  const trainDisabled = disabled || !drill.canTrain || busy || batchQty < 1;
  const qty = Math.max(1, batchQty);
  const totalEnergy = drill.energy * qty;

  return (
    <div className={`yc-drill-card ${exclusiveDrillClass(drill.isExclusive)}`}>
      <div className={`yc-drill-stripe ${familyStripeClass(drill.family)}`} />
      <div className="yc-drill-in">
        {drill.isExclusive && (
          <div className="yc-drill-eyebrow">
            <Award size={10} /> {t("yourCamp.drill.masterclassEyebrow")}
          </div>
        )}
        <div className="yc-drill-top">
          <span className="yc-drill-name">{drill.name}</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {boosted.length > 0 && (
              <Tip
                title={activeBooster.name}
                text={t("yourCamp.drill.boosterTip", { name: activeBooster.name, stats: boosted.join(", ") })}
                className="yc-xp-chip"
              >
                +{pctLabel(activeBooster.pct)}% XP
              </Tip>
            )}
            <Tip title={t("yourCamp.panel.keyEnergy")} text={t("yourCamp.drill.energyTip")} className="yc-energy-chip">
              <Zap size={10} /> {drill.energy}
            </Tip>
          </span>
        </div>

        <div className="yc-drill-stats">
          {drill.stats.map((s) => (
            <Tip key={s} text={STAT_TOOLTIPS[s] || s} className={`yc-stat-pill ${statChipClass(s)}`}>
              {s}
            </Tip>
          ))}
        </div>

        <div className="yc-drill-metrics">
          <div className="yc-dmetric">
            <Tip title={t("yourCamp.drill.injuryLabel")} text={t("yourCamp.drill.injuryTip")} className="yc-dmetric-lbl">
              {t("yourCamp.drill.injuryLabel")}
            </Tip>
            <InjuryValue pct={drill.injuryPct} />
          </div>
          <div className="yc-dmetric">
            <Tip title={t("yourCamp.drill.dropLabel")} text={t("yourCamp.drill.dropTip")} className="yc-dmetric-lbl">
              {t("yourCamp.drill.dropLabel")}
            </Tip>
            <DropValue pct={drill.dropPct} />
          </div>
          <div className="yc-dmetric">
            <Tip title={t("yourCamp.drill.conditionLabel")} text={t("yourCamp.drill.conditionTip")} className="yc-dmetric-lbl">
              {t("yourCamp.drill.conditionLabel")}
            </Tip>
            <ConditionValue delta={drill.condDelta} />
          </div>

          <button
            type="button"
            className="yc-btn-train"
            disabled={trainDisabled}
            title={!drill.canTrain ? (drill.blockedReason || t("yourCamp.drill.blocked")) : undefined}
            onClick={() => onTrain(drill, qty)}
          >
            {busy
              ? "…"
              : qty > 1
                ? t("yourCamp.drill.trainBatch", { qty, energy: totalEnergy })
                : t("yourCamp.drill.train")}
          </button>
        </div>
      </div>
    </div>
  );
});
