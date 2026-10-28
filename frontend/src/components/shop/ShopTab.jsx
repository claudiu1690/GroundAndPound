import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Coins, Zap, TrendingUp, ShoppingBag, Info, Check, X } from "lucide-react";
import { api } from "../../api";
import { t } from "@/lib/i18n";
import { usePurchaseStatus } from "../../hooks/usePurchaseStatus";
import { PremiumPanel } from "./PremiumPanel";
import {
  boosterEffect,
  buffStatTags,
  inventoryCount,
  purchaseReturnBanner,
  checkoutErrorKey,
  resolveBoosterDisplay,
  shopArtSrc,
} from "./shopConstants";

// ── Small presentational pieces ─────────────────────────────

function StatTag({ slug, text }) {
  return <span className={`shop-bt shop-bt-${slug}`}>{text}</span>;
}

/** Painted product art in a small square. Always decorative: the name and effect sit beside it. */
function ShopArt({ id }) {
  const src = shopArtSrc(id);
  if (!src) return null;
  return <img className="shop-art" src={src} alt="" loading="lazy" width="68" height="68" />;
}

const cashLabel = (n) => Number(n || 0).toLocaleString("en-US");

/** A cash buy button that folds "Not enough cash" into its own disabled state. */
function BuyButton({ canAfford, busy, onClick, label, className = "shop-buy-btn" }) {
  const buyLabel = label ?? t("shop.buy.label");
  if (!canAfford) {
    return (
      <button type="button" className={`${className} shop-buy-btn--cant`} disabled title={t("shop.buy.notEnoughCashTitle")}>
        {t("shop.buy.notEnoughCash")}
      </button>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={busy}>
      {busy ? "…" : buyLabel}
    </button>
  );
}

/** One shelf card: painted art on the left, name, effect line, price and the buy control. */
function ShopItem({ id, name, effect, extra, price, disabled = false, children }) {
  return (
    <div className={`shop-item${disabled ? " shop-item--disabled" : ""}`}>
      <ShopArt id={id} />
      <div className="shop-item-main">
        <div className="shop-item-name">{name}</div>
        <div className="shop-item-fx">{effect}</div>
        {extra}
        <div className="shop-item-row">
          <div className="shop-item-price"><Coins size={11} /> {cashLabel(price)}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Cash store cards ────────────────────────────────────────

function EnergyShotCard({ item, busy, onBuy }) {
  return (
    <ShopItem
      id={item.id}
      name={item.name}
      effect={t("shop.product.shotEffect")}
      extra={
        <div className="shop-item-owned">
          {t("shop.energy.inInventoryPrefix")}<span className="shop-item-owned-n">{item.owned ?? 0}</span>{t("shop.energy.inInventorySuffix")}
        </div>
      }
      price={item.price}
    >
      <BuyButton canAfford={item.canAfford} busy={busy} onClick={onBuy} className="shop-buy-btn shop-buy-btn--ghost" />
    </ShopItem>
  );
}

function BoosterCard({ booster, dimmed, busy, onBuy }) {
  const fx = boosterEffect(booster);
  const blocked = dimmed || booster.locked;
  return (
    <ShopItem
      id={booster.id}
      name={booster.name}
      effect={
        <>
          {t("shop.product.boosterXp", { pct: fx.pct })}
          {fx.allStats
            ? <>, {t("shop.product.boosterAllStats")}</>
            : <> {fx.tags.map((tg, i) => <StatTag key={i} {...tg} />)}</>}
          {" · "}
          {t("shop.product.boosterSessions", { n: fx.sessions })}
        </>
      }
      price={booster.price}
      disabled={blocked}
    >
      {booster.locked ? (
        <button type="button" className="shop-buy-btn shop-buy-btn--ghost" disabled title={t("shop.booster.locked")}>
          {t("shop.booster.locked")}
        </button>
      ) : (
        <BuyButton canAfford={booster.canAfford} busy={busy} onClick={onBuy} className="shop-buy-btn shop-buy-btn--ghost" />
      )}
    </ShopItem>
  );
}

function BuffCard({ buff, busy, onBuy }) {
  const isInjury = buff.injuryMult != null;
  const tags = isInjury ? [] : buffStatTags(buff);
  return (
    <ShopItem
      id={buff.id}
      name={buff.name}
      effect={isInjury
        ? t("shop.product.collagenEffect")
        : tags.map((tg, i) => <StatTag key={i} {...tg} />)}
      price={buff.price}
    >
      <BuyButton canAfford={buff.canAfford} busy={busy} onClick={onBuy} className="shop-buy-btn shop-buy-btn--ghost" />
    </ShopItem>
  );
}

// ── Inventory tab pieces ────────────────────────────────────

function InventoryEnergyRow({ item, energyFull, busy, onUse }) {
  const owned = item.owned ?? 0;
  const noneOwned = owned <= 0;
  const disabled = noneOwned || energyFull || busy;
  let title;
  if (noneOwned) title = t("shop.camp.notOwned");
  else if (energyFull) title = t("shop.sidebar.alreadyFull");
  return (
    <div className="shop-inv-row">
      <div className={`shop-energy-icon ${item.premium ? "shop-energy-icon--gold" : "shop-energy-icon--blue"}`}>
        <Zap size={18} />
      </div>
      <div className="shop-inv-row-info">
        <div className="shop-inv-row-name">{item.name}</div>
        <div className="shop-inv-row-desc">{t("shop.energy.restoresDesc", { energy: item.energy })}</div>
      </div>
      <div className="shop-inv-row-owned">
        <span className="shop-inv-owned-num">{owned}</span>
        <span className="shop-inv-owned-lbl">{t("shop.inventory.owned")}</span>
      </div>
      <button
        type="button"
        className="shop-buy-btn shop-buy-btn--blue"
        disabled={disabled}
        title={title}
        onClick={onUse}
      >
        {busy ? "…" : t("shop.inventory.use")}
      </button>
    </div>
  );
}

function InventoryBoosterCard({ booster }) {
  if (!booster) return null;
  const total = booster.totalSessions || 1;
  const left = booster.sessionsLeft || 0;
  const pct = Math.min(100, Math.round((left / total) * 100));
  return (
    <div className="shop-inv-booster">
      <div className="shop-inv-booster-top">
        <TrendingUp size={16} className="shop-inv-booster-icon" />
        <span className="shop-inv-booster-name">{booster.name}</span>
        <span className="shop-inv-booster-big">{left}</span>
      </div>
      <div className="shop-inv-booster-sub">{t("shop.inventory.sessionsLeft", { total })}</div>
      <div className="shop-inv-booster-track">
        <div className="shop-inv-booster-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────

export const ShopTab = memo(function ShopTab({
  fighter,
  onRefreshFighter,
  onMessage,
  isGuest = false,
  onOpenAccount,
  purchaseReturn = null, // { outcome: "success" | "cancelled", sessionId } from the Stripe return URL
  onPurchaseReturnConsumed,
  expandRequest = null, // { from, nonce }: App asks for the bundle panel open (e.g. "See bundles" in the offer)
}) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("cash"); // cash | inventory
  const [busyId, setBusyId] = useState(null); // item/bundle id currently mutating
  const [premiumNotice, setPremiumNotice] = useState("");

  // ── Premium panel state ──
  // `panelInit` is the server's premiumPanel from the FIRST successful load of this mount and is
  // never overwritten: a silent reload after a buy/use/delivery must not fold the panel or change
  // its eyebrow mid-visit. `expanded` is local UI state; A2 never remembers it across visits.
  const [panelInit, setPanelInit] = useState(null);
  const [expanded, setExpandedState] = useState(false);
  const [hideable, setHideable] = useState(false);
  const panelInitRef = useRef(null);
  const seenSentRef = useRef(false);
  const expandedRef = useRef(false);

  const fighterId = fighter?._id;

  const setExpanded = useCallback((v) => {
    expandedRef.current = v;
    setExpandedState(v);
  }, []);

  // New fighter => forget the frozen first-load state (declared before the load effect).
  useEffect(() => {
    panelInitRef.current = null;
    seenSentRef.current = false;
    setPanelInit(null);
  }, [fighterId]);

  const loadCatalog = useCallback(async ({ silent = false } = {}) => {
    if (!fighterId) return;
    // Silent reloads (after a purchase) keep the current catalog mounted so the
    // page doesn't flash the full-page loading state and remount every card.
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await api.getShopCatalog(fighterId);
      setCatalog(data);
      if (!panelInitRef.current) {
        const p = data.premiumPanel || { mode: "collapsed", reason: null };
        panelInitRef.current = p;
        setPanelInit(p);
        if (p.mode === "full") setExpanded(true);
      }
    } catch (e) {
      if (!silent) setError(e.message || t("shop.loadError"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fighterId, setExpanded]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Mark the full panel seen only once it has actually rendered: an effect runs after commit,
  // so a player who leaves the Shop before the catalog arrives does not use up the one-time
  // panel. Idempotent and fire-and-forget; on failure the server shows it in full next visit.
  useEffect(() => {
    if (panelInit?.mode !== "full" || seenSentRef.current || !fighterId) return;
    seenSentRef.current = true;
    api.markPremiumPanelSeen(fighterId).catch(() => {});
  }, [panelInit, fighterId]);

  const afterMutation = useCallback(async () => {
    await loadCatalog({ silent: true });
    if (onRefreshFighter && fighterId) await onRefreshFighter(fighterId);
  }, [loadCatalog, onRefreshFighter, fighterId]);

  /** Transient expansion (never touches the server flags). No-op when already open. */
  const openPanel = useCallback((from) => {
    if (expandedRef.current) return;
    setExpanded(true);
    setHideable(true);
    if (fighterId) {
      api.trackClientEvent(fighterId, "premium_panel_expanded", { from }).catch(() => {});
    }
  }, [fighterId, setExpanded]);

  const hidePanel = useCallback(() => {
    setExpanded(false);
    setHideable(false);
  }, [setExpanded]);

  // ── Return from Stripe Checkout ──
  // The hook follows the order until the webhook has delivered (or given up). Only a
  // "success" return with a session id is followed; "cancelled" needs no lookup.
  const followSessionId = purchaseReturn?.outcome === "success" ? purchaseReturn.sessionId : null;
  const purchaseStatus = usePurchaseStatus(fighterId, followSessionId);
  const banner = purchaseReturnBanner(purchaseReturn, purchaseStatus);

  useEffect(() => {
    if (purchaseReturn) openPanel("purchase_return");
  }, [purchaseReturn, openPanel]);

  // "See bundles" from the out-of-energy offer (or any other caller) asks for the panel open.
  const expandNonce = expandRequest?.nonce;
  const expandFrom = expandRequest?.from;
  useEffect(() => {
    if (expandNonce) openPanel(expandFrom || "offer");
  }, [expandNonce, expandFrom, openPanel]);

  // Delivered: pull the new inventory in once (fighter + catalog owned counts).
  const refreshedForSession = useRef(null);
  useEffect(() => {
    if (purchaseStatus.phase !== "fulfilled" || refreshedForSession.current === followSessionId) return;
    refreshedForSession.current = followSessionId;
    afterMutation();
  }, [purchaseStatus.phase, followSessionId, afterMutation]);

  // Browser back from Stripe can restore this page from bfcache with the "opening checkout"
  // state still set. Re-enable the buttons when that happens.
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) setBusyId(null); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const handleBuy = useCallback(async (itemId) => {
    if (!fighterId || busyId) return;
    setBusyId(itemId);
    try {
      const res = await api.buyItem(fighterId, itemId, 1);
      if (onMessage) onMessage(res.message || t("shop.messages.purchaseComplete"));
      await afterMutation();
    } catch (e) {
      if (onMessage) onMessage(e.message || t("shop.messages.purchaseFailed"));
    } finally {
      setBusyId(null);
    }
  }, [fighterId, busyId, afterMutation, onMessage]);

  /**
   * Real money. Opens a Stripe Checkout Session and hands the browser to Stripe.
   *
   * DELIBERATELY GRANTS NOTHING AND REFRESHES NOTHING. The old stub could safely pretend;
   * this cannot. Goods are granted by the signature-verified webhook, so anything optimistic
   * here would show drinks the player has not paid for yet, and the payment can still fail,
   * be abandoned at Stripe, or complete minutes later on a card that needs 3-D Secure.
   *
   * `busyId` is intentionally left set: this navigates away, so re-enabling the button would
   * only offer a second click during the redirect.
   */
  const handleBuyPremium = useCallback(async (bundleId) => {
    if (!fighterId || busyId) return;
    setBusyId(bundleId);
    setPremiumNotice("");
    try {
      const res = await api.createCheckout(fighterId, bundleId);
      if (!res || !res.url) throw new Error(t("shop.messages.premiumPurchaseUnavailable"));
      window.location.assign(res.url);
      return;
    } catch (e) {
      // Contract codes carry a specific, actionable message; anything else is generic.
      const key = checkoutErrorKey(e.code);
      const msg = key
        ? t(key)
        : (e.message || t("shop.messages.premiumPurchaseUnavailable"));
      setPremiumNotice(msg);
      if (onMessage) onMessage(msg);
      setBusyId(null);
    }
  }, [fighterId, busyId, onMessage]);

  const handleUse = useCallback(async (itemId) => {
    if (!fighterId || busyId) return;
    setBusyId(itemId);
    try {
      const res = await api.useEnergyItem(fighterId, itemId);
      if (onMessage) onMessage(res.message || t("shop.messages.restoredEnergy", { restored: res.restored ?? "" }));
      await afterMutation();
    } catch (e) {
      if (onMessage) onMessage(e.message || t("shop.messages.couldNotUse"));
    } finally {
      setBusyId(null);
    }
  }, [fighterId, busyId, afterMutation, onMessage]);

  // ── Page shell with header + tabs (always rendered) ──
  // Active booster lives on the fighter (not inventory) but is shown in the
  // inventory view, so include it in the tab badge count.
  const invCount = inventoryCount(fighter?.inventory) + (fighter?.activeBooster ? 1 : 0);
  const drinks = fighter?.inventory?.energyDrinks ?? 0;
  const showBody = !loading && !error && catalog;

  return (
    <div className="shop-tab">
      <div className="shop-page-header">
        <div className="shop-page-head-text">
          <div className="shop-page-eye">{t("shop.pageEye")}</div>
          <div className="shop-page-title">{t("shop.pageTitle")}</div>
          <div className="shop-page-sub">{t("shop.pageSub")}</div>
        </div>
        <div className="shop-wallet">
          <div className="shop-wallet-chip">
            <small>{t("shop.wallet.cash")}</small>
            <span className="shop-wallet-cash">{cashLabel(fighter?.iron)}</span>
          </div>
          <button
            type="button"
            className="shop-wallet-chip shop-wallet-chip--drinks"
            onClick={() => openPanel("chip")}
            disabled={!showBody}
          >
            <small>{t("shop.wallet.drinks")}</small>
            <span>{drinks}</span>
            <span className="shop-wallet-plus" aria-hidden="true">+</span>
          </button>
        </div>
      </div>

      {banner && (
        <div className={`shop-return shop-return--${banner.tone}`} role="status" aria-live="polite">
          <Info size={14} className="shop-return-icon" />
          <div className="shop-return-text">{t(banner.key, banner.vars)}</div>
          {!banner.busy && onPurchaseReturnConsumed && (
            <button
              type="button"
              className="shop-return-close"
              onClick={onPurchaseReturnConsumed}
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {showBody && (
        <div className="shop-panel-area">
          <PremiumPanel
            expanded={expanded}
            hideable={hideable}
            reason={panelInit?.reason ?? null}
            catalog={catalog}
            drinks={drinks}
            busyId={busyId}
            notice={premiumNotice}
            isGuest={isGuest}
            onOpenAccount={onOpenAccount}
            onBuy={handleBuyPremium}
            onExpand={openPanel}
            onHide={hidePanel}
          />
        </div>
      )}

      <div className="shop-tabs">
        <button type="button" className={`shop-tab-btn${tab === "cash" ? " act" : ""}`} onClick={() => setTab("cash")}>
          <Coins size={13} /> {t("shop.tabs.cash")}
        </button>
        <button type="button" className={`shop-tab-btn${tab === "inventory" ? " act" : ""}`} onClick={() => setTab("inventory")}>
          <ShoppingBag size={13} /> {t("shop.tabs.inventory")}
          {invCount > 0 && <span className="shop-tab-badge">{invCount}</span>}
        </button>
      </div>

      <div className="shop-body">
        {loading && <div className="shop-state shop-state--loading">{t("shop.loading")}</div>}

        {!loading && error && (
          <div className="shop-state shop-state--error">
            {error}
            <button type="button" className="shop-buy-btn shop-buy-btn--ghost" onClick={() => loadCatalog()}>{t("common.retry")}</button>
          </div>
        )}

        {showBody && (
          <>
            {tab === "cash" && (
              <CashStore
                catalog={catalog}
                busyId={busyId}
                onBuy={handleBuy}
              />
            )}
            {tab === "inventory" && (
              <InventoryView
                catalog={catalog}
                fighter={fighter}
                busyId={busyId}
                onUse={handleUse}
                onGoCash={() => setTab("cash")}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
});

// ── CASH STORE ──────────────────────────────────────────────

function CashStore({ catalog, busyId, onBuy }) {
  const { activeBooster, energyItems = [], boosters = [], buffs = [] } = catalog;
  // The Energy Drink is real money only; it lives in the bundle panel, not on this shelf.
  const cashEnergy = energyItems.filter((i) => !i.premium);
  return (
    <>
      {/* Energy */}
      <section className="shop-section">
        <div className="shop-section-label">{t("shop.shelves.energy")}</div>
        <div className="shop-shelf">
          {cashEnergy.map((item) => (
            <EnergyShotCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onBuy={() => onBuy(item.id)}
            />
          ))}
        </div>
      </section>

      {/* XP boosters */}
      <section className="shop-section">
        <div className="shop-section-label">{t("shop.shelves.boosters")}</div>

        {activeBooster && (
          <div className="shop-active-banner">
            <TrendingUp size={16} className="shop-active-icon" />
            <div className="shop-active-text">
              <strong>{t("shop.activeBooster.banner", { name: activeBooster.name })}</strong>
            </div>
            <div className="shop-active-right">
              <div className="shop-active-sessions">{activeBooster.sessionsLeft}</div>
              <div className="shop-active-sessions-lbl">{t("shop.activeBooster.sessionsLeft")}</div>
            </div>
          </div>
        )}

        <div className="shop-shelf">
          {boosters.map((b) => (
            <BoosterCard
              key={b.id}
              booster={b}
              dimmed={!!activeBooster}
              busy={busyId === b.id}
              onBuy={() => onBuy(b.id)}
            />
          ))}
        </div>
      </section>

      {/* Pre-fight supplements */}
      <section className="shop-section">
        <div className="shop-section-label">{t("shop.shelves.supplements")}</div>
        <div className="shop-shelf">
          {buffs.map((bf) => (
            <BuffCard key={bf.id} buff={bf} busy={busyId === bf.id} onBuy={() => onBuy(bf.id)} />
          ))}
        </div>
      </section>
    </>
  );
}

// ── INVENTORY VIEW ──────────────────────────────────────────

function InventoryView({ catalog, fighter, busyId, onUse, onGoCash }) {
  const energyFull = !!catalog.energyFull;
  const energyItems = catalog.energyItems || [];
  // Fall back to the raw fighter booster only via resolveBoosterDisplay — the raw
  // subdoc has no name/pct, which would render a blank booster name otherwise.
  const activeBooster = catalog.activeBooster || resolveBoosterDisplay(fighter?.activeBooster) || null;
  const buffs = fighter?.inventory?.prefightBuffs || {};
  // Build a lookup of buff display names from the catalog.
  const buffNames = {};
  (catalog.buffs || []).forEach((b) => { buffNames[b.id] = b.name; });
  const ownedBuffs = Object.entries(buffs)
    .filter(([, c]) => (c || 0) > 0)
    .map(([id, count]) => ({ id, count, name: buffNames[id] || id }));

  return (
    <>
      {/* Energy */}
      <section className="shop-section">
        <div className="shop-section-label">{t("shop.sections.energy")}</div>
        <div className="shop-inv-energy">
          {energyItems.map((item) => (
            <InventoryEnergyRow
              key={item.id}
              item={item}
              energyFull={energyFull}
              busy={busyId === item.id}
              onUse={() => onUse(item.id)}
            />
          ))}
        </div>
        {energyFull && <div className="shop-inv-note">{t("shop.inventory.energyFull")}</div>}
      </section>

      {/* XP booster */}
      <section className="shop-section">
        <div className="shop-section-label">{t("shop.sections.xpBoosters")}</div>
        {activeBooster ? (
          <InventoryBoosterCard booster={activeBooster} />
        ) : (
          <div className="shop-inv-empty">
            {t("shop.inventory.noBooster")}{" "}
            <button type="button" className="shop-inline-link" onClick={onGoCash}>{t("shop.inventory.browseStore")}</button>
          </div>
        )}
      </section>

      {/* Pre-fight buffs */}
      <section className="shop-section">
        <div className="shop-section-label">{t("shop.sections.preFightBuffs")}</div>
        {ownedBuffs.length > 0 ? (
          <div className="shop-inv-buff-grid">
            {ownedBuffs.map((b) => (
              <div key={b.id} className="shop-inv-buff-card">
                <div className="shop-inv-buff-name">{b.name}</div>
                <div className="shop-inv-buff-tags">
                  {b.count > 1 && <span className="shop-inv-buff-count">×{b.count}</span>}
                  <span className="shop-inv-buff-unused"><Check size={10} /> {t("shop.inventory.unused")}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="shop-inv-empty">
            {t("shop.inventory.noBuffs")}{" "}
            <button type="button" className="shop-inline-link" onClick={onGoCash}>{t("shop.inventory.browseStore")}</button>
          </div>
        )}
        <div className="shop-inv-note">{t("shop.inventory.buffNote")}</div>
      </section>
    </>
  );
}
