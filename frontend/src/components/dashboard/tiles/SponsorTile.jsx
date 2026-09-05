import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/** Sponsorship tile — async (data.sponsorship). */
export function SponsorTile({ sponsorship, loading, onNavigate, index }) {
  if (loading && !sponsorship) {
    return (
      <HomeTile tone="gold" span={6} index={index} className="hn-sponsor hn-skel" head={<span>{t("home.sponsor.title")}</span>}>
        <div style={{ height: 64 }} />
      </HomeTile>
    );
  }

  if (!sponsorship) {
    return (
      <HomeTile
        tone="gold"
        span={6}
        index={index}
        className="hn-sponsor"
        head={<span>{t("home.sponsor.title")}</span>}
        link={{ label: t("home.sponsor.cta"), onClick: () => onNavigate?.("contracts"), gold: true }}
      >
        <p>{t("home.empty.sponsor")}</p>
      </HomeTile>
    );
  }

  return (
    <HomeTile
      tone="gold"
      span={6}
      index={index}
      className="hn-sponsor"
      head={<span>{t("home.sponsor.title")}</span>}
      link={{ label: t("home.sponsor.cta"), onClick: () => onNavigate?.("contracts"), gold: true }}
    >
      <h3>{sponsorship.brand}</h3>
      {sponsorship.rewardPerFight != null ? (
        <div className="hn-kpis">
          <span className="hn-kpi">
            <b>${Number(sponsorship.rewardPerFight).toLocaleString()}</b>
            <small>{t("home.sponsor.rewardPerFight")}</small>
          </span>
        </div>
      ) : null}
      {sponsorship.progressText ? <p>{sponsorship.progressText}</p> : null}
    </HomeTile>
  );
}
