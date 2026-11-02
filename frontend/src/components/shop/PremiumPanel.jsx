import { memo } from "react";
import { ChevronDown, Info } from "lucide-react";
import { t } from "@/lib/i18n";
import {
  bundlePricing,
  bundlesCrossSoftCap,
  canCount,
  freeEarnChips,
  freeEarnHint,
  premiumBuyMode,
  shopArtSrc,
} from "./shopConstants";

const CAN_SRC = shopArtSrc("energy-drink");

function Cans({ count, small = false }) {
  if (!CAN_SRC) return null;
  return (
    <div className={`shop-cans${small ? " shop-cans--sm" : ""}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <img key={i} className="shop-can" src={CAN_SRC} alt="" />
      ))}
    </div>
  );
}

/** One bundle. One neutral "Our pick" flag on the server's `popular` bundle; no gold, no "best value". */
function BundleCard({ bundle, pricing, busy, locked, mode, onBuy }) {
  const perDrink = pricing?.perDrink;
  const savings = pricing?.savingsPct;
  return (
    <div className={`shop-b${bundle.popular ? " shop-b--pick" : ""}`}>
      {bundle.popular && <div className="shop-b-flag">{t("shop.bundle.ourPick")}</div>}
      <Cans count={canCount(bundle.drinks)} small />
      <div className="shop-b-n">{bundle.drinks}</div>
      <div className="shop-b-u">{t("shop.bundle.energyDrinks")}</div>
      <div className="shop-b-p">{bundle.priceLabel}</div>
      <div className="shop-b-per">
        {perDrink != null && t("shop.bundle.perDrink", { price: perDrink.toFixed(2) })}
        {savings != null && (
          <>
            {perDrink != null && " · "}
            <b>{t("shop.bundle.save", { pct: savings })}</b>
          </>
        )}
      </div>
      <button
        type="button"
        className="shop-b-btn"
        onClick={onBuy}
        disabled={busy || locked || mode === "disabled"}
      >
        {busy
          ? t("shop.bundle.redirecting")
          : mode === "guest"
            ? t("shop.bundle.buyGuest")
            : t("shop.bundle.buy")}
      </button>
    </div>
  );
}

/**
 * A1 (full panel) and A2 (one-line bar). Which one shows is the parent's call (`expanded`): the
 * server picks the first-load mode, and the parent freezes it so a silent reload never folds the
 * panel mid-visit. Real-money buying is unchanged: three buy modes, same notices, same handlers.
 */
export const PremiumPanel = memo(function PremiumPanel({
  expanded,
  hideable,
  reason, // frozen first-load reason: "first_visit" | "account_secured" | null
  catalog,
  drinks,
  busyId,
  notice,
  isGuest,
  onOpenAccount,
  onBuy,
  onExpand,
  onHide,
}) {
  const cap = catalog.drinkSoftCap;
  const hint = freeEarnHint(catalog.freeEarn, cap, drinks);

  if (!expanded) {
    return (
      <div className="shop-bar">
        <div className="shop-bar-l">
          <Cans count={1} small />
          <div className="shop-bar-text">
            <b>{t("shop.wallet.drinks")}</b>{" "}
            <span className="shop-bar-muted">
              {t("shop.panel.barLine", { owned: drinks, hint: hint ? t(hint.key, hint.vars) : "" }).trim()}
            </span>
          </div>
        </div>
        <button type="button" className="shop-bar-btn" onClick={() => onExpand("bar")}>
          {t("shop.panel.seeBundles")} <ChevronDown size={13} aria-hidden="true" />
        </button>
      </div>
    );
  }

  const bundles = catalog.premiumBundles || [];
  const pricing = bundlePricing(bundles);
  const mode = premiumBuyMode({ isGuest, paymentsEnabled: catalog.paymentsEnabled });
  const redirecting = busyId != null && bundles.some((b) => b.id === busyId);
  const showOverCap = mode === "buy" && bundlesCrossSoftCap({ owned: drinks, bundles, cap });
  const modeNotice = mode === "guest"
    ? t("shop.premium.guestNotice")
    : mode === "disabled"
      ? t("shop.premium.disabled")
      : null;
  const chips = freeEarnChips(catalog.freeEarn, cap, drinks);
  const overCap = !!catalog.freeEarn?.overCap;

  return (
    <section className="shop-panel" aria-label={t("shop.panel.title")}>
      <div className="shop-panel-top">
        <div className="shop-panel-copy">
          <div className="shop-panel-eye">
            {t("shop.panel.eye")}
            {reason === "account_secured" && (
              <span className="shop-panel-eye-sub"> {t("shop.panel.eyeSecured")}</span>
            )}
          </div>
          <h4 className="shop-panel-title">{t("shop.panel.title")}</h4>
          <p className="shop-panel-body">{t("shop.panel.body")}</p>
        </div>
        <Cans count={3} />
      </div>

      {chips.length > 0 && (
        <div className="shop-earn">
          {!overCap && <span className="shop-earn-k">{t("shop.panel.earnedPrefix")}</span>}
          {chips.map((c) => (
            <span key={c.key}>{t(c.key, c.vars)}</span>
          ))}
        </div>
      )}

      {modeNotice && (
        <div className="shop-premium-notice shop-panel-notice">
          <Info size={14} /> {modeNotice}
        </div>
      )}
      {redirecting && (
        <div className="shop-premium-notice shop-panel-notice">
          <Info size={14} /> {t("shop.premium.redirecting")}
        </div>
      )}
      {showOverCap && (
        <div className="shop-premium-notice shop-panel-notice">
          <Info size={14} /> {t("shop.premium.overCap", { owned: drinks, cap })}
        </div>
      )}
      {notice && notice !== modeNotice && (
        <div className="shop-premium-notice shop-panel-notice">
          <Info size={14} /> {notice}
        </div>
      )}

      <div className="shop-bundles">
        {bundles.map((b, i) => (
          <BundleCard
            key={b.id}
            bundle={b}
            pricing={pricing[i]}
            busy={busyId === b.id}
            locked={busyId != null}
            mode={mode}
            onBuy={() => (mode === "guest" ? onOpenAccount?.() : onBuy(b.id))}
          />
        ))}
      </div>

      <div className="shop-panel-foot">
        <span className="shop-panel-trust">{t("shop.panel.trust")}</span>
        {hideable && (
          <button type="button" className="shop-panel-hide" onClick={onHide}>
            {t("shop.panel.hide")}
          </button>
        )}
      </div>
    </section>
  );
});
