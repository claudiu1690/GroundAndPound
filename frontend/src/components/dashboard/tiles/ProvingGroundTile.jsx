import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";
import { PvpSeasonCountdown } from "../PvpSeasonCountdown";
import { defenseTitle } from "../homeModel";

/**
 * Proving Ground (PvP) tile.
 *
 * Reads the unread defense-report summary off `pvpDefense` (fighter.pvpDefense)
 * — NEVER call /pvp/defense-results here, it acks by default and would mark
 * reports read on page load (home-contract.md §9 / risk list).
 */
export function ProvingGroundTile({ pvp, pvpDefense, loading, onNavigate, index }) {
  if (loading && !pvp) {
    return (
      <HomeTile tone="hot" span={5} index={index} className="hn-pg hn-skel" head={<span>{t("home.pg.eyebrow")}</span>}>
        <div style={{ height: 96 }} />
      </HomeTile>
    );
  }
  const noSeason = !pvp;
  const upcoming = pvp?.status === "upcoming" && pvp.startsAt;
  const hasPlayed = !!pvp?.hasPlayed;
  const hasDefenseAlert = !!pvpDefense && pvpDefense.unreadCount > 0;

  return (
    <HomeTile
      tone="hot"
      span={5}
      index={index}
      className="hn-pg"
      head={
        <>
          <span>{t("home.pg.eyebrow")}</span>
          {pvp?.crossWeightClass ? (
            <span className="hn-badge is-open">{t("home.pg.openBadge")}</span>
          ) : null}
        </>
      }
      link={{ label: t("home.pg.cta"), onClick: () => onNavigate?.("pvp") }}
    >
      <h3>{pvp?.seasonLabel ?? t("home.pg.noSeason")}</h3>

      {noSeason ? null : upcoming ? (
        <PvpSeasonCountdown startsAt={pvp.startsAt} />
      ) : (
        <div className="hn-kpis">
          <span className="hn-kpi">
            <b>{hasPlayed ? pvp.wins : 0}</b>
            <small>{t("home.pg.statWins")}</small>
          </span>
          <span className="hn-kpi">
            <b>{hasPlayed ? pvp.losses : 0}</b>
            <small>{t("home.pg.statLosses")}</small>
          </span>
          <span className="hn-kpi">
            <b>{hasPlayed ? pvp.dp : 0}</b>
            <small>{t("home.pg.statDp")}</small>
          </span>
          {hasPlayed && pvp.ladderRank != null && pvp.ladderSize != null ? (
            <span className="hn-kpi">
              <b>{t("home.pg.rankOf", { rank: pvp.ladderRank, total: pvp.ladderSize })}</b>
              <small>{t("home.pg.ladder")}</small>
            </span>
          ) : null}
        </div>
      )}

      {!noSeason && !hasPlayed ? <p>{t("home.pg.notPlayed")}</p> : null}

      {!noSeason && pvp?.weeksRemaining != null ? (
        <p>
          <b>{t("home.pg.weeks", { n: pvp.weeksRemaining })}</b>{" "}
          {pvp.twistKey ? t("home.pg.twistLine", { text: t(`home.pg.twist.${pvp.twistKey}`) }) : ""}
        </p>
      ) : null}

      {hasDefenseAlert ? (
        <button type="button" className="hn-alert" onClick={() => onNavigate?.("pvp")}>
          <i>!</i>
          <span>
            <b>{defenseTitle(pvpDefense.unreadCount)}</b>
            {t("home.pg.defenseBody", { held: pvpDefense.heldCount, lost: pvpDefense.lostCount })}
          </span>
          {pvpDefense.totalDpChange ? (
            <em>{pvpDefense.totalDpChange > 0 ? "+" : "−"}{Math.abs(pvpDefense.totalDpChange)} DP</em>
          ) : null}
        </button>
      ) : null}
    </HomeTile>
  );
}
