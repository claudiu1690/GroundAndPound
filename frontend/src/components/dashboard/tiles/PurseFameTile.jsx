import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/** Purse & fame tile, merges the old MoneyFameTile and SponsorTile (decision #12). */
export function PurseFameTile({ fighter, resources, sponsorship, homeCamp, loading, onNavigate, index }) {
  const n = fighter?.notoriety ?? null;
  const cash = resources?.iron ?? fighter?.iron ?? 0;
  const fameScore = resources?.fame ?? n?.score ?? 0;
  const fameTier = n?.tierLabel ?? "n/a";
  const purseBonusPct = Math.round((n?.purseModifier ?? 0) * 100);
  const fameFrozen = !!n?.isFrozen;
  const fameDecaying = !!n?.decayWarningActive;
  const wages = homeCamp?.wages ?? null;

  const bootLoading = loading && resources == null;
  if (bootLoading) {
    return (
      <HomeTile index={index} className="ap-purse-tile ap-skel" head={<span>{t("home.purse.title")}</span>}>
        <div style={{ height: 140 }} />
      </HomeTile>
    );
  }

  return (
    <HomeTile index={index} className="ap-purse-tile" head={<span>{t("home.purse.title")}</span>}>
      <div className="ap-kv">
        <span>{t("home.purse.cash")}</span>
        <b>${Number(cash).toLocaleString()}</b>
      </div>
      <div className="ap-kv">
        <span>{t("home.purse.fame")}</span>
        <b>
          {t("home.purse.fameValue", { score: Number(fameScore).toLocaleString(), tier: fameTier })}
          {fameFrozen ? ` · ${t("home.purse.frozen")}` : ""}
          {fameDecaying ? ` · ${t("home.purse.decaying")}` : ""}
        </b>
      </div>
      {purseBonusPct > 0 ? (
        <div className="ap-kv">
          <span>{t("home.purse.purseBonus")}</span>
          <b>{t("home.purse.purseBonusValue", { pct: purseBonusPct })}</b>
        </div>
      ) : null}
      <button type="button" className="ap-kv ap-kv-btn" onClick={() => onNavigate?.("contracts")}>
        <span>{t("home.purse.sponsor")}</span>
        <b>{sponsorship?.brand ?? t("home.purse.sponsorNone")}</b>
      </button>
      <button type="button" className="ap-kv ap-kv-btn" onClick={() => onNavigate?.("camp")}>
        <span>{t("home.purse.wages")}</span>
        <b>
          {wages?.weeklyTotal
            ? t("home.purse.wagesValue", { amount: `$${Number(wages.weeklyTotal).toLocaleString()}`, days: wages.nextDebitInDays ?? 0 })
            : t("home.purse.wagesNone")}
        </b>
      </button>
    </HomeTile>
  );
}
