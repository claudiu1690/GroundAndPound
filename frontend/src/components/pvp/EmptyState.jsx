import { Users } from "lucide-react";
import { seasonWeightClassLabel } from "./pvpConst";
import { t } from "../../lib/i18n";

/**
 * Screen 7 — shown in LadderTab when poolCount < 5.
 * Receives poolCount, beltUnclaimed, season data, and a CTA callback.
 */
export function EmptyState({ season, poolCount = 0, beltUnclaimed = true, onFight }) {
  const weeksLeft = season
    ? Math.max(0, Math.ceil((new Date(season.endDate) - Date.now()) / (7 * 86400000)))
    : null;

  return (
    <div className="pvp-empty-wrap">
      <div className="pvp-empty-hero">
        <div className="pvp-eh-icon">
          <Users size={40} strokeWidth={1.4} />
        </div>
        <div className="pvp-eh-title">
          {season ? t("pvp.emptyState.seasonLive", { n: season.seasonNumber }) : t("pvp.emptyState.defaultTitle")}
        </div>
        <div className="pvp-eh-sub">
          {t("pvp.emptyState.subtitle")}
        </div>
      </div>

      <div className="pvp-empty-body">
        <div className="pvp-pool-card">
          <div className="pvp-pc-title">{t("pvp.emptyState.poolCardTitle", { weightClass: seasonWeightClassLabel(season) ?? "" })}</div>
          <div className="pvp-pc-row">
            <span className="pvp-pc-lbl">{t("pvp.emptyState.poolActiveFighters")}</span>
            <span className="pvp-pc-val pvp-pc-val-grn">{poolCount}</span>
          </div>
          <div className="pvp-pc-row">
            <span className="pvp-pc-lbl">{t("pvp.emptyState.poolBeltStatus")}</span>
            <span className="pvp-pc-val" style={{ color: beltUnclaimed ? "#D4A820" : "#C8102E" }}>
              {beltUnclaimed ? t("pvp.emptyState.beltUnclaimed") : t("pvp.emptyState.beltClaimed")}
            </span>
          </div>
          {weeksLeft !== null && (
            <div className="pvp-pc-row">
              <span className="pvp-pc-lbl">{t("pvp.emptyState.poolSeasonEnds")}</span>
              <span className="pvp-pc-val">
                {weeksLeft !== 1
                  ? t("pvp.hub.weeksRemainingPlural", { n: weeksLeft })
                  : t("pvp.hub.weeksRemaining", { n: weeksLeft })}
              </span>
            </div>
          )}
        </div>

        <div className="pvp-repeat-note">
          {t("pvp.emptyState.repeatNote")}
        </div>

        <div className="pvp-first-blood">
          <div className="pvp-fb-text">
            {t("pvp.emptyState.firstBloodText")}
          </div>
          <button className="pvp-enter-btn" onClick={onFight}>
            {t("pvp.emptyState.fightBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
