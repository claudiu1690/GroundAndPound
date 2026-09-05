import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";
import { formatEta } from "../homeModel";
import { FIGHT_ENERGY_COST } from "../../../constants/gameConstants";

/**
 * Vitals tile — energy + health meters, computed ENTIRELY from the live
 * `fighter` prop (same formula as dashboardService.buildVitals, run
 * client-side) so this tile is truly synchronous and never waits on
 * useDashboard (home-contract.md §9: identity/resources/vitals/stats/gazette
 * render from the fighter prop, never skeletoned).
 */
export function VitalsTile({ fighter, onNavigate, index }) {
  const tier = fighter?.promotionTier;
  const energy = fighter?.energy && typeof fighter.energy === "object" ? fighter.energy : {};
  const curEnergy = Number.isFinite(energy.current) ? energy.current : 0;
  const maxEnergy = Number.isFinite(energy.max) ? energy.max : 100;
  const energyPct = maxEnergy > 0 ? (curEnergy / maxEnergy) * 100 : 0;
  const fightCost = FIGHT_ENERGY_COST[tier] ?? 10;
  const energyLow = curEnergy < fightCost;
  const energyEta = formatEta(Math.max(0, maxEnergy - curEnergy));

  const health = Number.isFinite(fighter?.health) ? fighter.health : 100;
  const healthState = health < 25 ? "critical" : health < 60 ? "hurt" : "ok";
  const healthEta = formatEta((100 - health) * 5);
  const injuriesActive = Array.isArray(fighter?.injuries) ? fighter.injuries.length : 0;

  return (
    <HomeTile tone="plain" span={4} index={index} className="hn-vitals" head={<><span>{t("home.vitals.title")}</span><i>{t("home.vitals.live")}</i></>}>
      <div className="hn-meter">
        <div className="hn-meter-top">
          <b>{t("home.vitals.energyLabel")}</b>
          <em>{curEnergy}<small>/{maxEnergy}</small></em>
        </div>
        <span className={`hn-bar ${energyLow ? "is-red" : "is-green"}`} style={{ "--w": `${Math.max(0, Math.min(100, energyPct))}%` }}><i /></span>
        <div className="hn-meter-sub">
          {energyEta ? t("home.vitals.energyFullIn", { eta: energyEta }) : t("home.vitals.energyRested")}
        </div>
      </div>
      <div className="hn-meter">
        <div className="hn-meter-top">
          <b>{t("home.vitals.healthLabel")}</b>
          <em>{health}<small>/100</small></em>
        </div>
        <button
          type="button"
          className={`hn-bar ${healthState === "ok" ? "is-green" : "is-red"}`}
          style={{ "--w": `${Math.max(0, Math.min(100, health))}%`, cursor: "pointer" }}
          onClick={() => onNavigate?.("hospital")}
          aria-label={t("home.injury.cta")}
        >
          <i />
        </button>
        <div className="hn-meter-sub">
          {injuriesActive
            ? t("home.vitals.healthInjured")
            : healthState !== "ok"
              ? t("home.vitals.healthBangedUp")
              : t("home.vitals.healthHealthy")}
          {healthEta ? ` · ${t("home.vitals.healthFullIn", { eta: healthEta })}` : ""}
        </div>
      </div>
      {fighter?.mentalResetRequired ? (
        <button type="button" className="hn-badge is-warn" onClick={() => onNavigate?.("hospital")}>
          {t("home.vitals.mentalResetChip")}
        </button>
      ) : null}
    </HomeTile>
  );
}
