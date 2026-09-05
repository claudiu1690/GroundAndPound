import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/**
 * Injuries tile. ALWAYS renders — the grid assumes this slot exists
 * (home-contract.md §9): no injuries shows a green "cleared" badge instead of
 * disappearing.
 */
export function InjuryTile({ injuries, loading, onNavigate, index }) {
  if (loading && !injuries) {
    return (
      <HomeTile tone="plain" span={3} index={index} className="hn-inj hn-skel" head={<span>{t("home.injury.title")}</span>}>
        <div style={{ height: 60 }} />
      </HomeTile>
    );
  }
  const list = Array.isArray(injuries) ? injuries : [];
  if (list.length === 0) {
    return (
      <HomeTile
        tone="plain"
        span={4}
        index={index}
        className="hn-injury"
        head={<><span>{t("home.injury.title")}</span><span className="hn-badge is-open">{t("home.injury.clearedBadge")}</span></>}
      >
        <p>{t("home.empty.injuries")}</p>
      </HomeTile>
    );
  }

  const sorted = [...list].sort((a, b) => {
    if (!!b.cannotFight !== !!a.cannotFight) return b.cannotFight ? 1 : -1;
    return (a.recoveryHoursLeft ?? Infinity) - (b.recoveryHoursLeft ?? Infinity);
  });
  const worst = sorted[0];
  const anyCannotFight = list.some((i) => i.cannotFight);

  return (
    <HomeTile
      tone="plain"
      span={4}
      index={index}
      className="hn-injury"
      head={
        <>
          <span>{list.length === 1 ? t("home.injury.titleSingular") : t("home.injury.titlePlural", { n: list.length })}</span>
          {anyCannotFight ? <span className="hn-badge is-warn">{t("home.injury.cannotFightBadge")}</span> : null}
        </>
      }
      link={{ label: t("home.injury.cta"), onClick: () => onNavigate?.("hospital") }}
    >
      <h3>{worst?.label ?? worst?.type ?? t("home.injury.titleSingular")}</h3>
      {worst?.recoveryHoursLeft != null ? (
        <div className="hn-injury-line">
          <b>{Math.ceil(worst.recoveryHoursLeft)}h</b>
          <small>{t("home.injury.untilRecovered")}</small>
        </div>
      ) : null}
    </HomeTile>
  );
}
