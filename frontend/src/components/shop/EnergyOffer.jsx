import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import { api } from "../../api";
import { t } from "@/lib/i18n";
import {
  actionNounKey,
  drinkRow,
  isEnergyFullError,
  isNotEnoughCashError,
  shotRow,
  waitMinutes,
} from "./energyOfferModel";
import { freeEarnHint, shopArtSrc } from "./shopConstants";

const SHOT_ID = "energy-shot";
const DRINK_ID = "energy-drink";

/**
 * A3: the out-of-energy offer. Opens where an in-scope action failed for lack of energy and
 * lists, in a fixed order: wait (free), Energy Shot (Cash), Energy Drink (owned, or bundles).
 *
 * Never auto-retries the failed action: every commit is the player's own click. Portalled to
 * <body> with GLOBAL classes (.energy-offer*), so it works from any screen, including My Camp
 * whose styles are scoped under .your-camp.
 */
export const EnergyOffer = memo(function EnergyOffer({
  open,
  source,
  need,
  have,
  fighter,
  onClose,
  onRefreshFighter,
  onMessage,
  onSeeBundles,
}) {
  const fighterId = fighter?._id;
  const [catalog, setCatalog] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [busy, setBusy] = useState(null); // "shot" | null: one in-flight action at a time
  const dialogRef = useRef(null);

  const loadCatalog = useCallback(async ({ silent = false } = {}) => {
    if (!fighterId) return;
    if (!silent) setStatus("loading");
    try {
      const data = await api.getShopCatalog(fighterId);
      setCatalog(data);
      setStatus("ready");
    } catch {
      // A silent refresh that fails keeps the rows we already have.
      if (!silent) setStatus("error");
    }
  }, [fighterId]);

  // Fetch once per opening. Stale numbers from a previous opening are never shown.
  useEffect(() => {
    if (!open) return;
    setCatalog(null);
    setBusy(null);
    loadCatalog();
  }, [open, loadCatalog]);

  const track = useCallback((choice) => {
    if (!fighterId || !source) return;
    api.trackClientEvent(fighterId, "energy_offer_choice", { source, choice }).catch(() => {});
  }, [fighterId, source]);

  const dismiss = useCallback(() => {
    track("dismiss");
    onClose?.();
  }, [track, onClose]);

  // Escape closes; focus moves into the dialog and returns to the trigger on close.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [open, dismiss]);

  const useItem = useCallback(async (itemId) => {
    const res = await api.useEnergyItem(fighterId, itemId);
    onMessage?.(res.message || t("shop.messages.restoredEnergy", { restored: res.restored ?? "" }));
    await onRefreshFighter?.(fighterId);
    onClose?.();
  }, [fighterId, onMessage, onRefreshFighter, onClose]);

  /** "Use one" on an owned Shot or Drink. */
  const handleUseOwned = useCallback(async (itemId, choice) => {
    if (busy || !fighterId) return;
    setBusy(itemId);
    track(choice);
    try {
      await useItem(itemId);
    } catch (e) {
      onMessage?.(e.message || t("shop.messages.couldNotUse"));
      await onRefreshFighter?.(fighterId);
      if (isEnergyFullError(e)) onClose?.();
      else await loadCatalog({ silent: true });
    } finally {
      setBusy(null);
    }
  }, [busy, fighterId, track, useItem, onMessage, onRefreshFighter, onClose, loadCatalog]);

  /** "Buy and use one": two calls. If the use step fails the shot simply stays owned. */
  const handleBuyAndUse = useCallback(async () => {
    if (busy || !fighterId) return;
    setBusy(SHOT_ID);
    track("buy_use_shot");
    try {
      await api.buyItem(fighterId, SHOT_ID, 1);
    } catch (e) {
      onMessage?.(e.message || t("shop.messages.purchaseFailed"));
      if (isNotEnoughCashError(e)) await loadCatalog({ silent: true });
      await onRefreshFighter?.(fighterId);
      setBusy(null);
      return;
    }
    try {
      await useItem(SHOT_ID);
    } catch (e) {
      onMessage?.(e.message || t("shop.messages.couldNotUse"));
      await onRefreshFighter?.(fighterId);
      if (isEnergyFullError(e)) onClose?.();
      else await loadCatalog({ silent: true }); // row re-renders as "You own 1" / Use one
    } finally {
      setBusy(null);
    }
  }, [busy, fighterId, track, useItem, onMessage, onRefreshFighter, onClose, loadCatalog]);

  if (!open) return null;

  const items = catalog?.energyItems || [];
  const shot = items.find((i) => i.id === SHOT_ID);
  const drink = items.find((i) => i.id === DRINK_ID);
  const cash = catalog?.iron ?? fighter?.iron ?? 0;
  const shotOwned = shot?.owned ?? 0;
  const drinkOwned = drink?.owned ?? 0;
  const shotKind = shotRow({ owned: shotOwned, cash, price: shot?.price });
  const drinkKind = drinkRow({ owned: drinkOwned });
  const minutes = waitMinutes(need, have);
  const hint = freeEarnHint(catalog?.freeEarn, catalog?.drinkSoftCap, drinkOwned);
  const canSeeBundles = catalog?.paymentsEnabled !== false;
  const shotArt = shopArtSrc(SHOT_ID);
  const drinkArt = shopArtSrc(DRINK_ID);

  const shotSub = shotKind === "use"
    ? t("shop.offer.shotOwned", { owned: shotOwned, price: shot?.price })
    : shotKind === "buy_use"
      ? t("shop.offer.shotZero", { price: shot?.price })
      : t("shop.offer.shotZeroNoCash", { price: shot?.price, cash });

  const drinkSub = drinkKind === "use"
    ? t("shop.offer.drinkOwned", { owned: drinkOwned })
    : hint
      ? t("shop.offer.drinkZero", { hint: t(hint.key, hint.vars) })
      : t("shop.offer.drinkOwned", { owned: 0 });

  const node = (
    <div
      className="energy-offer-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="energy-offer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="energy-offer-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <button
          type="button"
          className="energy-offer-x"
          onClick={dismiss}
          aria-label={t("shop.offer.close")}
          title={t("shop.offer.close")}
        >
          <X size={16} />
        </button>
        <div className="energy-offer-eye">{t("shop.offer.eye")}</div>
        <h3 className="energy-offer-title" id="energy-offer-title">
          {t("shop.offer.title", { action: t(actionNounKey(source)), need, have })}
        </h3>

        {/* 1. Wait: free, always available, no countdown */}
        <div className="energy-offer-opt">
          <div className="energy-offer-ic"><Clock size={20} aria-hidden="true" /></div>
          <div className="energy-offer-body">
            <b>{minutes === 1 ? t("shop.offer.waitOne") : t("shop.offer.wait", { n: minutes })}</b>
            <span>{t("shop.offer.waitSub")}</span>
          </div>
          <button
            type="button"
            className="energy-offer-btn"
            onClick={() => { track("wait"); onClose?.(); }}
          >
            {t("shop.offer.ok")}
          </button>
        </div>

        {status === "loading" && (
          <div className="energy-offer-state" role="status" aria-live="polite">{t("shop.offer.loading")}</div>
        )}

        {status === "error" && (
          <div className="energy-offer-state energy-offer-state--error" role="alert">
            <span>{t("shop.offer.loadError")}</span>
            <button type="button" className="energy-offer-btn" onClick={() => loadCatalog()}>
              {t("common.retry")}
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            {/* 2. Energy Shot: Cash */}
            <div className="energy-offer-opt">
              {shotArt && <img className="energy-offer-art" src={shotArt} alt="" />}
              <div className="energy-offer-body">
                <b>{t("shop.offer.shotTitle")}</b>
                <span>{shotSub}</span>
              </div>
              {shotKind === "use" && (
                <button
                  type="button"
                  className="energy-offer-btn"
                  disabled={busy != null}
                  onClick={() => handleUseOwned(SHOT_ID, "use_shot")}
                >
                  {busy === SHOT_ID ? "…" : t("shop.offer.useOne")}
                </button>
              )}
              {shotKind === "buy_use" && (
                <button
                  type="button"
                  className="energy-offer-btn"
                  disabled={busy != null}
                  onClick={handleBuyAndUse}
                >
                  {busy === SHOT_ID ? "…" : t("shop.offer.buyAndUse")}
                </button>
              )}
              {shotKind === "no_cash" && (
                <button type="button" className="energy-offer-btn energy-offer-btn--cant" disabled>
                  {t("shop.offer.notEnoughCash")}
                </button>
              )}
            </div>

            {/* 3. Energy Drink: owned, or the bundles */}
            <div className="energy-offer-opt">
              {drinkArt && (
                <div className="energy-offer-art energy-offer-art--can">
                  <img className="shop-can" src={drinkArt} alt="" />
                </div>
              )}
              <div className="energy-offer-body">
                <b>{t("shop.offer.drinkTitle")}</b>
                <span>{drinkSub}</span>
              </div>
              {drinkKind === "use" && (
                <button
                  type="button"
                  className="energy-offer-btn"
                  disabled={busy != null}
                  onClick={() => handleUseOwned(DRINK_ID, "use_drink")}
                >
                  {busy === DRINK_ID ? "…" : t("shop.offer.useOne")}
                </button>
              )}
              {drinkKind === "none" && canSeeBundles && (
                <button
                  type="button"
                  className="energy-offer-link"
                  disabled={busy != null}
                  onClick={() => { track("see_bundles"); onSeeBundles?.(); }}
                >
                  {t("shop.offer.seeBundles")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
  // Portal to <body> so the overlay escapes the .app transform: scale(var(--ui-zoom)).
  return createPortal(node, document.body);
});
