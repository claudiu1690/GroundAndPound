import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/** Career rankings tile — ranking.titleShot drives the 3-condition checklist. */
export function RankingsTile({ ranking, weightClass, loading, onNavigate, index }) {
  if (loading && !ranking) {
    return (
      <HomeTile tone="plain" span={4} index={index} className="hn-rank hn-skel" head={<span>{t("home.rankings.eyebrow")}</span>}>
        <div style={{ height: 88 }} />
      </HomeTile>
    );
  }
  const ts = ranking?.titleShot;
  return (
    <HomeTile
      tone="plain"
      span={4}
      index={index}
      className="hn-rank"
      head={
        <>
          <span>{t("home.rankings.eyebrow")}</span>
          <i>{t("home.rankings.career")}</i>
        </>
      }
      link={{ label: t("home.rankings.viewCta"), onClick: () => onNavigate?.("rankings") }}
    >
      {ranking?.rank != null ? (
        <>
          <h3>{t("home.rankings.rankOfDivision", { rank: ranking.rank, division: ranking.division ?? "", weightClass: weightClass ?? "" })}</h3>
          {ranking.delta != null && ranking.delta !== 0 ? (
            <p>
              <span className={ranking.delta > 0 ? "hn-up" : "hn-warn"}>
                {ranking.delta > 0
                  ? t("home.rankings.upThisSession", { n: ranking.delta })
                  : t("home.rankings.downThisSession", { n: Math.abs(ranking.delta) })}
              </span>{" "}
              {t("home.rankings.titleShotConditions")}
            </p>
          ) : (
            <p>{t("home.rankings.titleShotConditions")}</p>
          )}
        </>
      ) : (
        <h3>{t("home.rankings.unranked")}</h3>
      )}

      {ts ? (
        <ul className="hn-checks">
          <li className={ts.ovrMet ? "is-done" : "is-todo"}>
            <i>{ts.ovrMet ? "✓" : "1"}</i>
            {t("home.rankings.conditionOvr")}
          </li>
          <li className={ts.topFive ? "is-done" : "is-todo"}>
            <i>{ts.topFive ? "✓" : "2"}</i>
            {t("home.rankings.conditionTopFive")}
          </li>
          <li className={ts.winsMet ? "is-done" : "is-todo"}>
            <i>{ts.winsMet ? "✓" : "3"}</i>
            {t("home.rankings.conditionWins")}
            <em>{t("home.rankings.winsHint", { won: ts.winsInTier ?? 0, need: ts.titleWins ?? 0 })}</em>
          </li>
        </ul>
      ) : null}
    </HomeTile>
  );
}
