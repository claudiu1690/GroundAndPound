import { memo, useCallback, useEffect, useState } from "react";
import { Coins, Zap, TrendingUp, ShoppingBag, Info, Check } from "lucide-react";
import { api } from "../../api";
import { t } from "@/lib/i18n";
import {
  buffStatTags,
  boosterStatTags,
  boosterEffectLine,
  inventoryCount,
  pctLabel,
  resolveBoosterDisplay,
} from "./shopConstants";

// ── Small presentational pieces ─────────────────────────────

function StatTag({ slug, text }) {
  return <span className={`shop-bt shop-bt-${slug}`}>{text}</span>;
}

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

// ── Energy section ──────────────────────────────────────────

function EnergyCard({ item, busy, onBuy, onGetMore }) {
  const isPremium = !!item.premium;
  return (
    <div className={`shop-energy-card${isPremium ? " shop-energy-card--premium" : ""}`}>
      <div className={`shop-energy-stripe ${isPremium ? "shop-energy-stripe--gold" : "shop-energy-stripe--blue"}`} />
      <div className="shop-energy-body">
        <div className={`shop-energy-icon ${isPremium ? "shop-energy-icon--gold" : "shop-energy-icon--blue"}`}>
          <Zap size={18} />
        </div>
        <div className="shop-energy-info">
          <div className="shop-energy-name">
            {item.name}
            {isPremium && <span className="shop-energy-premium-tag">{t("shop.energy.premiumTag")}</span>}
          </div>
          <div className="shop-energy-desc">{t("shop.energy.restoresDesc", { energy: item.energy })}</div>
          <div className="shop-energy-balance">
            {t("shop.energy.inInventoryPrefix")}<span className={isPremium ? "shop-energy-bal--gold" : "shop-energy-bal--blue"}>{item.owned ?? 0}</span>{t("shop.energy.inInventorySuffix")}
          </div>
        </div>
        <div className="shop-energy-action">
          {isPremium ? (
            <>
              <div className="shop-energy-cost shop-energy-cost--muted">{t("shop.energy.realMoneyLabel")}</div>
              <button type="button" className="shop-buy-btn shop-buy-btn--gold" onClick={onGetMore}>
                {t("shop.energy.getMore")}
              </button>
            </>
          ) : (
            <>
              <div className="shop-energy-cost">
                <Coins size={11} /> {item.price}
              </div>
              <BuyButton
                canAfford={item.canAfford}
                busy={busy}
                onClick={onBuy}
                className="shop-buy-btn shop-buy-btn--gold"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── XP booster card ─────────────────────────────────────────

function BoosterCard({ booster, dimmed, busy, onBuy }) {
  const tags = boosterStatTags(booster);
  const isStack = booster.stats === "ALL" && booster.sessions >= 8;
  const blocked = dimmed || booster.locked;
  return (
    <div className={`shop-xp-card${isStack ? " shop-xp-card--stack" : ""}${blocked ? " shop-xp-card--disabled" : ""}`}>
      <div className="shop-xp-stripe" />
      <div className="shop-xp-body">
        {isStack && <span className="shop-stack-tag">{t("shop.booster.bestValue")}</span>}
        <div className="shop-xp-top">
          <div className="shop-xp-name">{booster.name}</div>
          <span className="shop-xp-sessions">{booster.sessions} {t("shop.booster.sessionsSuffix")}</span>
        </div>
        <div className="shop-xp-boost">+{pctLabel(booster.pct)}%</div>
        <div className="shop-xp-boost-lbl">{boosterEffectLine(booster)}</div>
        <div className="shop-xp-tags">
          {tags.map((tg, i) => <StatTag key={i} {...tg} />)}
        </div>
        <div className="shop-xp-footer">
          <div className="shop-xp-price"><Coins size={11} /> {booster.price}</div>
          {booster.locked ? (
            <button type="button" className="shop-buy-btn shop-buy-btn--ghost" disabled title={t("shop.booster.locked")}>
              {t("shop.booster.locked")}
            </button>
          ) : (
            <BuyButton canAfford={booster.canAfford} busy={busy} onClick={onBuy} className="shop-buy-btn shop-buy-btn--ghost" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pre-fight buff card ─────────────────────────────────────

function BuffCard({ buff, busy, onBuy }) {
  const tags = buffStatTags(buff);
  const effect = buff.injuryMult != null
    ? t("shop.buff.effectToughSkin")
    : t("shop.buff.effectConsumed");
  return (
    <div className="shop-buff-card">
      <div className="shop-buff-stripe" style={tagStripeStyle(tags)} />
      <div className="shop-buff-body">
        <div className="shop-buff-top">
          <div className="shop-buff-name">{buff.name}</div>
          <span className="shop-buff-duration">{t("shop.buff.duration")}</span>
        </div>
        <div className="shop-buff-effect">{effect}</div>
        <div className="shop-buff-tags">
          {tags.map((tg, i) => <StatTag key={i} {...tg} />)}
        </div>
        <div className="shop-buff-footer">
          <div className="shop-buff-price"><Coins size={11} /> {buff.price}</div>
          <BuyButton canAfford={buff.canAfford} busy={busy} onClick={onBuy} className="shop-buy-btn shop-buy-btn--ghost" />
        </div>
      </div>
    </div>
  );
}

/** Pick a stripe colour from the first tag's slug (purely cosmetic). */
function tagStripeStyle(tags) {
  const slug = tags[0]?.slug ?? "xp";
  const map = {
    str: "var(--c-accent)",
    spd: "var(--c-blue)",
    gnd: "#8B5CF6",
    sub: "#14B8A6",
    leg: "#3A9A4A",
    wre: "var(--c-amber-bright)",
    chn: "#7DD3FC",
    fiq: "#A855F7",
    def: "#3A9A4A",
    xp: "var(--c-amber-bright)",
  };
  return { background: map[slug] ?? "var(--c-amber-bright)" };
}

// ── Premium bundle card ─────────────────────────────────────

function BundleCard({ bundle, smallest, busy, onBuy }) {
  // Derive per-drink + savings vs smallest bundle for the 3 bigger ones.
  const price = parsePrice(bundle.priceLabel);
  const perDrink = price != null && bundle.drinks ? price / bundle.drinks : null;
  let savings = null;
  if (smallest && smallest.drinks && perDrink != null) {
    const smallPrice = parsePrice(smallest.priceLabel);
    const smallPer = smallPrice != null ? smallPrice / smallest.drinks : null;
    if (smallPer && bundle.id !== smallest.id) {
      savings = Math.round((1 - perDrink / smallPer) * 100);
    }
  }
  return (
    <div className={`shop-bundle-card${bundle.popular ? " shop-bundle-card--popular" : ""}`}>
      {bundle.popular && <div className="shop-bundle-popular">{t("shop.bundle.mostPopular")}</div>}
      <div className="shop-bundle-icon"><Zap size={26} /></div>
      <div className="shop-bundle-drinks">{bundle.drinks}</div>
      <div className="shop-bundle-unit">{t("shop.bundle.energyDrinks")}</div>
      <div className="shop-bundle-price">{bundle.priceLabel}</div>
      <div className={`shop-bundle-per${savings != null ? " shop-bundle-per--savings" : ""}`}>
        {perDrink != null ? `$${perDrink.toFixed(2)} ${t("shop.bundle.perDrinkSuffix")}` : ""}
        {savings != null && savings > 0 ? ` · ${t("shop.bundle.save", { pct: savings })}` : ""}
      </div>
      <button type="button" className="shop-bundle-btn" onClick={onBuy} disabled={busy}>
        {busy ? "…" : t("shop.bundle.buy")}
      </button>
    </div>
  );
}

function parsePrice(label) {
  if (!label) return null;
  const m = String(label).replace(/[^0-9.]/g, "");
  const n = parseFloat(m);
  return Number.isFinite(n) ? n : null;
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

export const ShopTab = memo(function ShopTab({ fighter, onRefreshFighter, onMessage }) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("cash"); // cash | premium | inventory
  const [busyId, setBusyId] = useState(null); // item/bundle id currently mutating
  const [premiumNotice, setPremiumNotice] = useState("");

  const fighterId = fighter?._id;

  const loadCatalog = useCallback(async ({ silent = false } = {}) => {
    if (!fighterId) return;
    // Silent reloads (after a purchase) keep the current catalog mounted so the
    // page doesn't flash the full-page loading state and remount every card.
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await api.getShopCatalog(fighterId);
      setCatalog(data);
    } catch (e) {
      if (!silent) setError(e.message || t("shop.loadError"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fighterId]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const afterMutation = useCallback(async () => {
    await loadCatalog({ silent: true });
    if (onRefreshFighter && fighterId) await onRefreshFighter(fighterId);
  }, [loadCatalog, onRefreshFighter, fighterId]);

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

  const handleBuyPremium = useCallback(async (bundleId) => {
    if (!fighterId || busyId) return;
    setBusyId(bundleId);
    setPremiumNotice("");
    try {
      const res = await api.buyPremium(fighterId, bundleId);
      // Stub: grant nothing, surface the message. No balance change.
      const msg = res.message || t("shop.messages.premiumUnavailable");
      setPremiumNotice(msg);
      if (onMessage) onMessage(msg);
    } catch (e) {
      const msg = e.message || t("shop.messages.premiumPurchaseUnavailable");
      setPremiumNotice(msg);
      if (onMessage) onMessage(msg);
    } finally {
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

  return (
    <div className="shop-tab">
      <div className="shop-page-header">
        <div className="shop-page-eye">{t("shop.pageEye")}</div>
        <div className="shop-page-title">{t("shop.pageTitle")}</div>
        <div className="shop-page-sub">{t("shop.pageSub")}</div>
      </div>

      <div className="shop-tabs">
        <button type="button" className={`shop-tab-btn${tab === "cash" ? " act" : ""}`} onClick={() => setTab("cash")}>
          <Coins size={13} /> {t("shop.tabs.cash")}
        </button>
        <button type="button" className={`shop-tab-btn${tab === "premium" ? " act" : ""}`} onClick={() => setTab("premium")}>
          <Zap size={13} /> {t("shop.tabs.premium")}
          <span className="shop-tab-badge">{t("shop.tabs.premiumBadge")}</span>
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
            <button type="button" className="shop-buy-btn shop-buy-btn--ghost" onClick={loadCatalog}>{t("common.retry")}</button>
          </div>
        )}

        {!loading && !error && catalog && (
          <>
            {tab === "cash" && (
              <CashStore
                catalog={catalog}
                busyId={busyId}
                onBuy={handleBuy}
                onGetMore={() => setTab("premium")}
              />
            )}
            {tab === "premium" && (
              <PremiumStore
                catalog={catalog}
                fighter={fighter}
                busyId={busyId}
                notice={premiumNotice}
                onBuy={handleBuyPremium}
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

function CashStore({ catalog, busyId, onBuy, onGetMore }) {
  const { activeBooster, energyItems = [], boosters = [], buffs = [] } = catalog;
  return (
    <>
      {/* Energy */}
      <section className="shop-section">
        <div className="shop-section-label">{t("shop.sections.energy")}</div>
        <div className="shop-energy-row">
          {energyItems.map((item) => (
            <EnergyCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onBuy={() => onBuy(item.id)}
              onGetMore={onGetMore}
            />
          ))}
        </div>
      </section>

      {/* XP boosters */}
      <section className="shop-section">
        <div className="shop-section-label">
          {t("shop.sections.xpBoosters")} <span className="shop-section-sub">{t("shop.sections.xpBoostersSub")}</span>
        </div>

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

        <div className="shop-grid-4">
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

      {/* Pre-fight buffs */}
      <section className="shop-section">
        <div className="shop-section-label">
          {t("shop.sections.preFightBuffs")} <span className="shop-section-sub">{t("shop.sections.preFightBuffsSub")}</span>
        </div>
        <div className="shop-grid-3">
          {buffs.map((bf) => (
            <BuffCard key={bf.id} buff={bf} busy={busyId === bf.id} onBuy={() => onBuy(bf.id)} />
          ))}
        </div>
      </section>
    </>
  );
}

// ── PREMIUM STORE ───────────────────────────────────────────

function PremiumStore({ catalog, fighter, busyId, notice, onBuy }) {
  const bundles = catalog.premiumBundles || [];
  const drinks = fighter?.inventory?.energyDrinks ?? 0;
  // Smallest by drink count drives savings comparison.
  const smallest = bundles.reduce(
    (min, b) => (!min || (b.drinks || 0) < (min.drinks || 0) ? b : min),
    null
  );
  return (
    <section className="shop-premium">
      <div className="shop-premium-hero">
        <div>
          <div className="shop-premium-eye">{t("shop.premium.eye")}</div>
          <div className="shop-premium-title">{t("shop.premium.title")}</div>
          <div className="shop-premium-desc">
            {t("shop.premium.desc")}
          </div>
        </div>
        <div className="shop-premium-balance">
          <div className="shop-premium-bal-val">{drinks}</div>
          <div className="shop-premium-bal-lbl">{t("shop.premium.drinksInInventory")}</div>
        </div>
      </div>

      {notice && (
        <div className="shop-premium-notice">
          <Info size={14} /> {notice}
        </div>
      )}

      <div className="shop-bundle-grid">
        {bundles.map((b) => (
          <BundleCard key={b.id} bundle={b} smallest={smallest} busy={busyId === b.id} onBuy={() => onBuy(b.id)} />
        ))}
      </div>

      <div className="shop-premium-earn">
        <Info size={14} className="shop-premium-earn-icon" />
        <div className="shop-premium-earn-text">
          {t("shop.premium.earnNote")}
        </div>
      </div>
    </section>
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
