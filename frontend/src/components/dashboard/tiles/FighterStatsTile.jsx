import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/** Fighter stats tile, all 8 stats. Bar width = XP progress toward the next stat point (same as the sidebar); XP line in the tooltip. */
export function FighterStatsTile({ statRows, onTrain, gymsRetired, index }) {
  return (
    <HomeTile index={index} className="ap-stats" head={<span>{t("home.statsTile.title")}</span>}>
      {(statRows ?? []).map((r) => (
        <div className="ap-stats-row" key={r.name} title={r.xpLine ? `${r.tooltip}. ${r.xpLine}` : r.tooltip}>
          <span>{r.name}</span>
          {/* Red, to match the stat bars in the sidebar fighter profile. */}
          <span className="ap-bar is-accent" style={{ "--w": `${Math.max(0, Math.min(100, r.pct))}%` }}><i /></span>
          <b>{r.value}</b>
        </div>
      ))}
      <button type="button" className="ap-btn is-ghost is-sm ap-stats-cta" onClick={onTrain}>
        {gymsRetired ? t("home.statsTile.trainCamp") : t("home.statsTile.trainGym")}
      </button>
    </HomeTile>
  );
}
