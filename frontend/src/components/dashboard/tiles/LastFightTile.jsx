import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";
import { relativeTime } from "../homeModel";

const RESULT_LABEL_KEY = { win: "win", loss: "loss", draw: "draw" };

function provingGroundLine({ pvp, pvpDefense }) {
  if (pvpDefense && pvpDefense.unreadCount > 0) {
    return pvpDefense.unreadCount === 1
      ? t("home.last.pgDefenseOne")
      : t("home.last.pgDefenseMany", { n: pvpDefense.unreadCount });
  }
  if (!pvp) return t("home.last.pgNone");
  if (pvp.status === "upcoming") {
    const days = pvp.startsAt ? Math.max(0, Math.ceil((new Date(pvp.startsAt).getTime() - Date.now()) / 86400000)) : 0;
    return t("home.last.pgUpcoming", { days });
  }
  if (!pvp.hasPlayed) return t("home.last.pgNotPlayed");
  if (pvp.ladderRank != null && pvp.ladderSize != null) {
    return t("home.last.pgRank", { rank: pvp.ladderRank, total: pvp.ladderSize });
  }
  return t("home.last.pgNotPlayed");
}

/**
 * Last fight tile, the c-last panel, plus Gazette / Feed / Proving Ground
 * lines (decision #11/#12: one indexed ActivityLog query for lastFight, the
 * old Proving Ground and Gazette/Feed tiles fold in here).
 */
export function LastFightTile({ lastFight, feed, gazette, pvp, pvpDefense, loading, onOpenGazette, onNavigate, index }) {
  if (loading && lastFight === undefined) {
    return (
      <HomeTile index={index} className="ap-last-tile ap-skel" head={<span>{t("home.last.title")}</span>}>
        <div style={{ height: 140 }} />
      </HomeTile>
    );
  }

  const resultKey = lastFight ? RESULT_LABEL_KEY[lastFight.result] ?? "draw" : null;
  const resultLabel = resultKey ? t(`home.last.${resultKey}`) : null;
  const gazetteEmpty = !gazette?.issueNumber || !gazette?.leadStory;
  const feedTop = Array.isArray(feed) ? feed[0] : null;

  return (
    <HomeTile index={index} className="ap-last-tile" head={<span>{t("home.last.title")}</span>}>
      {lastFight ? (
        <div className="ap-last">
          <span className={`ap-last-res${lastFight.result === "loss" ? " is-loss" : lastFight.result === "draw" ? " is-draw" : ""}`}>
            {resultLabel}
          </span>
          <div>
            <b>{t("home.last.vs", { name: lastFight.opponentName ?? "" })}</b>
            <span>{t("home.last.meta", { outcome: lastFight.outcome ?? "", when: relativeTime(lastFight.at) })}</span>
          </div>
        </div>
      ) : (
        <p>{t("home.last.none")}</p>
      )}

      <button type="button" className="ap-kv ap-kv-btn" onClick={onOpenGazette}>
        <span>{t("home.last.gazette")}</span>
        <b>{gazetteEmpty ? t("home.last.feedNone") : t("home.last.gazetteRead")}</b>
      </button>

      <div className="ap-kv">
        <span>{t("home.last.feed")}</span>
        <b>{feedTop?.detail ?? t("home.last.feedNone")}</b>
      </div>

      <button type="button" className="ap-kv ap-kv-btn" onClick={() => onNavigate?.("pvp")}>
        <span>{t("home.last.pg")}</span>
        <b>{provingGroundLine({ pvp, pvpDefense })}</b>
      </button>
    </HomeTile>
  );
}
