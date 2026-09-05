import { t } from "@/lib/i18n";
import { formatPurse } from "./homeModel";

/**
 * Undercard row — the offer cards below the hero. Clicking a card NAVIGATES
 * to the Fight Hub; it never POSTs an acceptance from Home, because an
 * offer's opponentId is ephemeral (regenerated per request, home-contract.md
 * §4/§11).
 */
export function UndercardRow({ offers, loading, onNavigate }) {
  const list = Array.isArray(offers?.list) ? offers.list : [];
  const isEmpty = !loading && list.length === 0;

  return (
    <div className="hn-wrap">
      <div className="hn-under">
        <div className="hn-under-head hn-anim">
          <h2>{t("home.under.title")}</h2>
          <span>{isEmpty ? t("home.under.empty") : t("home.under.sub", { n: offers?.count ?? list.length })}</span>
          <button type="button" className="hn-link" onClick={() => onNavigate?.("fights")}>{t("home.under.link")}</button>
        </div>

        {loading && list.length === 0 ? (
          <div className="hn-under-row">
            <div className="hn-bcard hn-skel" style={{ minHeight: 140 }} />
            <div className="hn-bcard hn-skel" style={{ minHeight: 140 }} />
            <div className="hn-bcard hn-skel" style={{ minHeight: 140 }} />
          </div>
        ) : (
          <div className={`hn-under-row${isEmpty ? " hn-under-row--empty" : ""}`}>
            {list.map((offer, i) => (
              <button
                key={offer.opponentId ?? i}
                type="button"
                className="hn-bcard hn-anim"
                onClick={() => onNavigate?.("fights")}
              >
                <div className="hn-bcard-top">
                  <span>{offer.type}</span>
                  <i>{offer.opponentTier}{offer.isNemesis ? ` · ${t("home.hero.roleNemesis")}` : ""}</i>
                </div>
                <b>{offer.opponentName}{offer.opponentNickname ? ` "${offer.opponentNickname}"` : ""}</b>
                <span>{offer.opponentStyle ?? ""}</span>
                <div className="hn-bcard-foot">
                  <span className="hn-purse">
                    {offer.purse != null ? formatPurse(offer.purse) : "n/a"}
                    <small>{t("home.under.purse")}</small>
                  </span>
                  <span className="hn-go">{t("home.under.view")}</span>
                </div>
              </button>
            ))}
            <button type="button" className="hn-bcard hn-callout hn-anim" onClick={() => onNavigate?.("fights")}>
              <span className="hn-callout-plus">+</span>
              <b>{t("home.under.calloutTitle")}</b>
              <span>{t("home.under.calloutSub")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
