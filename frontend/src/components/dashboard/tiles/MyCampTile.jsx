import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/**
 * My Camp tile — the persistent head-coach camp (data.homeCamp, nullable).
 * Distinct from FightCampTile (data.camp, the per-bout fight camp).
 */
export function MyCampTile({ homeCamp, loading, onNavigate, index }) {
  if (loading && !homeCamp) {
    return (
      <HomeTile tone="plain" span={4} index={index} className="hn-coach hn-skel" head={<span>{t("home.camp.title")}</span>}>
        <div style={{ height: 64 }} />
      </HomeTile>
    );
  }

  if (!homeCamp) {
    return (
      <HomeTile
        tone="plain"
        span={4}
        index={index}
        className="hn-coach"
        head={<span>{t("home.camp.title")}</span>}
        link={{ label: t("home.camp.cta"), onClick: () => onNavigate?.("camp"), gold: true }}
      >
        <p>{t("home.camp.none")}</p>
      </HomeTile>
    );
  }

  const { campName, conditionValue, headCoach, wages, market } = homeCamp;

  return (
    <HomeTile
      tone="plain"
      span={4}
      index={index}
      className="hn-coach"
      head={<><span>{t("home.camp.title")}</span><i>{t("home.camp.condition", { pct: conditionValue ?? 0 })}</i></>}
      link={{ label: t("home.camp.cta"), onClick: () => onNavigate?.("camp"), gold: true }}
    >
      <div className="hn-coach-top">
        <div>
          <b>{campName ?? t("home.camp.title")}</b>
          <span>
            {headCoach
              ? t("home.camp.headCoachLine", {
                  archetype: headCoach.archetypeLabel,
                  rank: t("home.camp.rank", { n: headCoach.rank }),
                  morale: t("home.camp.morale", { n: headCoach.morale }),
                })
              : t("home.camp.noCoach")}
          </span>
        </div>
      </div>
      {wages?.weeklyTotal ? (
        <div className="hn-coach-line">
          <span>{t("home.camp.wages", { amount: `$${Number(wages.weeklyTotal).toLocaleString()}` })}</span>
          {wages.nextDebitInDays != null ? <em>{wages.nextDebitInDays}d</em> : null}
        </div>
      ) : null}
      {market ? (
        <div className="hn-coach-line">
          <span>{market.open ? t("home.camp.marketOpen") : t("home.camp.marketReset", { n: market.resetsInDays ?? 0 })}</span>
        </div>
      ) : null}
    </HomeTile>
  );
}
