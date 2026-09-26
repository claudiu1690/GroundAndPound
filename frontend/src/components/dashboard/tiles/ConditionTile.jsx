import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";
import { vitalsModel } from "../homeModel";

function worstInjury(injuries) {
  const list = Array.isArray(injuries) ? injuries : [];
  if (list.length === 0) return null;
  return [...list].sort((a, b) => {
    if (!!b.cannotFight !== !!a.cannotFight) return b.cannotFight ? 1 : -1;
    return (a.recoveryHoursLeft ?? Infinity) - (b.recoveryHoursLeft ?? Infinity);
  })[0];
}

/**
 * Condition tile, energy/health meters (synchronous, off the live `fighter`
 * prop via vitalsModel) plus injury / fight camp / home camp rows (async,
 * off the dashboard payload).
 */
export function ConditionTile({ fighter, injuries, camp, homeCamp, loading, onNavigate, index }) {
  const vitals = vitalsModel(fighter);
  const bootLoading = loading && injuries == null;

  if (bootLoading) {
    return (
      <HomeTile index={index} className="ap-condition ap-skel" head={<span>{t("home.condition.title")}</span>}>
        <div style={{ height: 160 }} />
      </HomeTile>
    );
  }

  const worst = worstInjury(injuries);

  return (
    <HomeTile index={index} className="ap-condition" head={<span>{t("home.condition.title")}</span>}>
      <div className="ap-kv">
        <span>{t("home.condition.energy")}</span>
        <b>
          {t("home.condition.energyValue", { cur: vitals.energy.cur, max: vitals.energy.max })}
          {vitals.energy.eta ? ` · ${t("home.condition.fullIn", { eta: vitals.energy.eta })}` : ""}
        </b>
      </div>
      <span className={`ap-bar${vitals.energy.low ? " is-red" : " is-green"}`} style={{ "--w": `${vitals.energy.pct}%` }}><i /></span>

      <div className="ap-kv">
        <span>{t("home.condition.health")}</span>
        <b>{t("home.condition.healthValue", { value: vitals.health.value })}</b>
      </div>
      <button
        type="button"
        className={`ap-bar ap-bar-btn${vitals.health.state === "ok" ? " is-green" : " is-red"}`}
        style={{ "--w": `${vitals.health.pct}%` }}
        onClick={() => onNavigate?.("hospital")}
        aria-label={t("home.condition.injury")}
      >
        <i />
      </button>

      <button type="button" className="ap-kv ap-kv-btn" onClick={() => onNavigate?.("hospital")}>
        <span>{t("home.condition.injury")}</span>
        <b>
          {worst
            ? t("home.condition.injuryValue", { label: worst.label ?? worst.type, hours: Math.ceil(worst.recoveryHoursLeft ?? 0) })
            : t("home.condition.injuryNone")}
          {worst?.cannotFight ? ` · ${t("home.condition.cannotFight")}` : ""}
        </b>
      </button>

      <div className="ap-kv">
        <span>{t("home.condition.fightCamp")}</span>
        <b>
          {!camp
            ? t("home.condition.fightCampNone")
            : camp.finalised
              ? t("home.condition.fightCampFinalised")
              : t("home.condition.fightCampValue", { used: camp.slotsUsed ?? 0, max: camp.maxSlots ?? 0 })}
        </b>
      </div>

      <button type="button" className="ap-kv ap-kv-btn" onClick={() => onNavigate?.("camp")}>
        <span>{t("home.condition.homeCamp")}</span>
        <b>
          {!homeCamp
            ? t("home.condition.homeCampNone")
            : t("home.condition.homeCampValue", {
                tier: homeCamp.tierLabel ?? "",
                condition: homeCamp.conditionValue ?? 0,
                coach: homeCamp.headCoach?.name ?? t("home.condition.homeCampNone"),
              })}
        </b>
      </button>

      {fighter?.mentalResetRequired ? (
        <button type="button" className="ap-badge is-warn" onClick={() => onNavigate?.("hospital")}>
          {t("home.condition.mentalReset")}
        </button>
      ) : null}
    </HomeTile>
  );
}
