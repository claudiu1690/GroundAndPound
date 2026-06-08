import { memo, useCallback, useEffect, useState } from "react";
import { Coins, Zap, TrendingUp, ShoppingBag, Info, Check } from "lucide-react";
import { api } from "../../api";
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
function BuyButton({ canAfford, busy, onClick, label = "Buy", className = "shop-buy-btn" }) {
  if (!canAfford) {
    return (
      <button type="button" className={`${className} shop-buy-btn--cant`} disabled title="Not enough cash">
        Not enough cash
      </button>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={busy}>
      {busy ? "…" : label}
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
            {isPremium && <span className="shop-energy-premium-tag">Premium</span>}
          </div>
          <div className="shop-energy-desc">Restores {item.energy} energy instantly.</div>
          <div className="shop-energy-balance">
            You have <span className={isPremium ? "shop-energy-bal--gold" : "shop-energy-bal--blue"}>{item.owned ?? 0}</span> in inventory
          </div>
        </div>
        <div className="shop-energy-action">
          {isPremium ? (
            <>
              <div className="shop-energy-cost shop-energy-cost--muted">Real money →</div>
              <button type="button" className="shop-buy-btn shop-buy-btn--gold" onClick={onGetMore}>
                Get More
              </button>
            </>
          ) : (
            <>
              <div className="shop-energy-cost">
                <Coins size={11} /> {item.price} Cash
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
        {isStack && <span className="shop-stack-tag">Best Value</span>}
        <div className="shop-xp-top">
          <div className="shop-xp-name">{booster.name}</div>
          <span className="shop-xp-sessions">{booster.sessions} sessions</span>
        </div>
        <div className="shop-xp-boost">+{pctLabel(booster.pct)}%</div>
        <div className="shop-xp-boost-lbl">{boosterEffectLine(booster)}</div>
        <div className="shop-xp-tags">
          {tags.map((t, i) => <StatTag key={i} {...t} />)}
        </div>
        <div className="shop-xp-footer">
          <div className="shop-xp-price"><Coins size={11} /> {booster.price}</div>
          {booster.locked ? (
            <button type="button" className="shop-buy-btn shop-buy-btn--ghost" disabled title="Locked">
              Locked
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
    ? "Tougher skin, better recovery. Injuries sustained are less severe."
    : "Consumed after your next fight resolves.";
  return (
    <div className="shop-buff-card">
      <div className="shop-buff-stripe" style={tagStripeStyle(tags)} />
      <div className="shop-buff-body">
        <div className="shop-buff-top">
          <div className="shop-buff-name">{buff.name}</div>
          <span className="shop-buff-duration">1 fight</span>
        </div>
        <div className="shop-buff-effect">{effect}</div>
        <div className="shop-buff-tags">
          {tags.map((t, i) => <StatTag key={i} {...t} />)}
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
      {bundle.popular && <div className="shop-bundle-popular">Most Popular</div>}
      <div className="shop-bundle-icon"><Zap size={26} /></div>
      <div className="shop-bundle-drinks">{bundle.drinks}</div>
      <div className="shop-bundle-unit">Energy Drinks</div>
      <div className="shop-bundle-price">{bundle.priceLabel}</div>
      <div className={`shop-bundle-per${savings != null ? " shop-bundle-per--savings" : ""}`}>
        {perDrink != null ? `$${perDrink.toFixed(2)} per drink` : ""}
        {savings != null && savings > 0 ? ` · save ${savings}%` : ""}
      </div>
      <button type="button" className="shop-bundle-btn" onClick={onBuy} disabled={busy}>
        {busy ? "…" : "Buy"}
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
  if (noneOwned) title = "You don't own any";
  else if (energyFull) title = "Already full";
  return (
    <div className="shop-inv-row">
      <div className={`shop-energy-icon ${item.premium ? "shop-energy-icon--gold" : "shop-energy-icon--blue"}`}>
        <Zap size={18} />
      </div>
      <div className="shop-inv-row-info">
        <div className="shop-inv-row-name">{item.name}</div>
        <div className="shop-inv-row-desc">Restores {item.energy} energy instantly.</div>
      </div>
      <div className="shop-inv-row-owned">
        <span className="shop-inv-owned-num">{owned}</span>
        <span className="shop-inv-owned-lbl">owned</span>
      </div>
      <button
        type="button"
        className="shop-buy-btn shop-buy-btn--blue"
        disabled={disabled}
        title={title}
        onClick={onUse}
      >
        {busy ? "…" : "Use"}
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
      <div className="shop-inv-booster-sub">sessions left of {total}</div>
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
      if (!silent) setError(e.message || "Failed to load the shop.");
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
      if (onMessage) onMessage(res.message || "Purchase complete.");
      await afterMutation();
    } catch (e) {
      if (onMessage) onMessage(e.message || "Purchase failed.");
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
      const msg = res.message || "Premium purchases are not available yet.";
      setPremiumNotice(msg);
      if (onMessage) onMessage(msg);
    } catch (e) {
      const msg = e.message || "Premium purchase unavailable.";
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
      if (onMessage) onMessage(res.message || `Restored ${res.restored ?? ""} energy.`);
      await afterMutation();
    } catch (e) {
      if (onMessage) onMessage(e.message || "Could not use item.");
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
        <div className="shop-page-eye">Store</div>
        <div className="shop-page-title">Shop</div>
        <div className="shop-page-sub">Consumables, pre-fight buffs, XP boosters and energy. Spend Cash or go premium.</div>
      </div>

      <div className="shop-tabs">
        <button type="button" className={`shop-tab-btn${tab === "cash" ? " act" : ""}`} onClick={() => setTab("cash")}>
          <Coins size={13} /> Cash Store
        </button>
        <button type="button" className={`shop-tab-btn${tab === "premium" ? " act" : ""}`} onClick={() => setTab("premium")}>
          <Zap size={13} /> Premium
          <span className="shop-tab-badge">Energy Drinks</span>
        </button>
        <button type="button" className={`shop-tab-btn${tab === "inventory" ? " act" : ""}`} onClick={() => setTab("inventory")}>
          <ShoppingBag size={13} /> My Inventory
          {invCount > 0 && <span className="shop-tab-badge">{invCount}</span>}
        </button>
      </div>

      <div className="shop-body">
        {loading && <div className="shop-state shop-state--loading">Loading the shop…</div>}

        {!loading && error && (
          <div className="shop-state shop-state--error">
            {error}
            <button type="button" className="shop-buy-btn shop-buy-btn--ghost" onClick={loadCatalog}>Retry</button>
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
        <div className="shop-section-label">Energy</div>
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
          XP Boosters <span className="shop-section-sub">· one active at a time · cash cost</span>
        </div>

        {activeBooster && (
          <div className="shop-active-banner">
            <TrendingUp size={16} className="shop-active-icon" />
            <div className="shop-active-text">
              <strong>{activeBooster.name} active</strong>
            </div>
            <div className="shop-active-right">
              <div className="shop-active-sessions">{activeBooster.sessionsLeft}</div>
              <div className="shop-active-sessions-lbl">sessions left</div>
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
          Pre-Fight Buffs <span className="shop-section-sub">· 1 fight only · one per category</span>
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
          <div className="shop-premium-eye">Premium</div>
          <div className="shop-premium-title">Energy Drinks</div>
          <div className="shop-premium-desc">
            Restore 50 energy instantly. Never let a full energy bar go to waste. Earn them through
            gameplay or buy a bundle — buying is always optional.
          </div>
        </div>
        <div className="shop-premium-balance">
          <div className="shop-premium-bal-val">{drinks}</div>
          <div className="shop-premium-bal-lbl">Drinks in inventory</div>
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
          You can also earn Energy Drinks for free through <strong>contract completions</strong>,{" "}
          <strong>win streaks</strong>, <strong>tier promotions</strong> and{" "}
          <strong>career milestones</strong>. Buying is always optional.
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
        <div className="shop-section-label">Energy</div>
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
        {energyFull && <div className="shop-inv-note">Energy is full — nothing to restore right now.</div>}
      </section>

      {/* XP booster */}
      <section className="shop-section">
        <div className="shop-section-label">XP Booster</div>
        {activeBooster ? (
          <InventoryBoosterCard booster={activeBooster} />
        ) : (
          <div className="shop-inv-empty">
            No active XP booster.{" "}
            <button type="button" className="shop-inline-link" onClick={onGoCash}>Browse the Cash Store →</button>
          </div>
        )}
      </section>

      {/* Pre-fight buffs */}
      <section className="shop-section">
        <div className="shop-section-label">Pre-Fight Buffs</div>
        {ownedBuffs.length > 0 ? (
          <div className="shop-inv-buff-grid">
            {ownedBuffs.map((b) => (
              <div key={b.id} className="shop-inv-buff-card">
                <div className="shop-inv-buff-name">{b.name}</div>
                <div className="shop-inv-buff-tags">
                  {b.count > 1 && <span className="shop-inv-buff-count">×{b.count}</span>}
                  <span className="shop-inv-buff-unused"><Check size={10} /> Unused</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="shop-inv-empty">
            No pre-fight buffs owned.{" "}
            <button type="button" className="shop-inline-link" onClick={onGoCash}>Browse the Cash Store →</button>
          </div>
        )}
        <div className="shop-inv-note">Pre-fight buffs are selected in Fight Camp, before a fight.</div>
      </section>
    </>
  );
}
