import { memo, useCallback, useState } from "react";
import { Zap, TrendingUp, FlaskConical } from "lucide-react";
import { api } from "../../api";
import { ownsAnything, unusedBuffCount, resolveBoosterDisplay, pctLabel } from "./shopConstants";

/**
 * Sidebar "Inventory" section — sits between stats and the menu nav.
 * Renders only when the fighter owns at least one item.
 *
 * Up to 4 rows: energy shots, energy drinks, active XP booster (info only),
 * and an unused pre-fight buff count (taps through to Shop). Energy use is
 * immediate (no confirm) and refreshes the fighter via onRefreshFighter so
 * the resource bars + main inventory update.
 */
export const InventorySidebar = memo(function InventorySidebar({
  fighter,
  onRefreshFighter,
  onNavigateShop,
  onMessage,
}) {
  const [busy, setBusy] = useState(null);

  const fighterId = fighter?._id;
  const inv = fighter?.inventory || {};
  const shots = inv.energyShots || 0;
  const drinks = inv.energyDrinks || 0;
  const booster = resolveBoosterDisplay(fighter?.activeBooster || null);
  const buffCount = unusedBuffCount(fighter);

  const energyCur = fighter?.energy?.current ?? fighter?.energy ?? 0;
  const energyMax = fighter?.energy?.max ?? 100;
  const energyFull = energyCur >= energyMax;

  const useItem = useCallback(async (itemId) => {
    if (!fighterId || busy) return;
    setBusy(itemId);
    try {
      const res = await api.useEnergyItem(fighterId, itemId);
      if (onMessage) onMessage(res.message || `Restored ${res.restored ?? ""} energy.`);
      if (onRefreshFighter) await onRefreshFighter(fighterId);
    } catch (e) {
      if (onMessage) onMessage(e.message || "Could not use item.");
    } finally {
      setBusy(null);
    }
  }, [fighterId, busy, onRefreshFighter, onMessage]);

  if (!ownsAnything(fighter)) return null;

  const fullTitle = energyFull ? "Already full" : undefined;

  return (
    <section className="panel inv-sidebar">
      <h2 className="panel-title inv-sidebar-title">
        Inventory
        <button type="button" className="inv-sidebar-shop" onClick={onNavigateShop}>Shop →</button>
      </h2>
      <div className="panel-body inv-sidebar-body">
        {shots > 0 && (
          <div className="inv-row">
            <span className="inv-row-icon inv-row-icon--blue"><Zap size={13} /></span>
            <span className="inv-row-name">Energy Shot</span>
            <span className="inv-row-count">×{shots}</span>
            <button
              type="button"
              className="inv-row-btn"
              disabled={energyFull || busy === "energy-shot"}
              title={fullTitle}
              onClick={() => useItem("energy-shot")}
            >
              {busy === "energy-shot" ? "…" : "Use"}
            </button>
          </div>
        )}

        {drinks > 0 && (
          <div className="inv-row">
            <span className="inv-row-icon inv-row-icon--gold"><Zap size={13} /></span>
            <span className="inv-row-name">Energy Drink</span>
            <span className="inv-row-count">×{drinks}</span>
            <button
              type="button"
              className="inv-row-btn"
              disabled={energyFull || busy === "energy-drink"}
              title={fullTitle}
              onClick={() => useItem("energy-drink")}
            >
              {busy === "energy-drink" ? "…" : "Use"}
            </button>
          </div>
        )}

        {booster && (
          <div className="inv-row inv-row--info">
            <span className="inv-row-icon inv-row-icon--gold"><TrendingUp size={13} /></span>
            <span className="inv-row-name">
              {booster.name || "XP Booster"}
              <span className="inv-row-meta">
                {booster.pct ? `+${pctLabel(booster.pct)}% · ` : ""}{booster.sessionsLeft} session{booster.sessionsLeft === 1 ? "" : "s"} left
              </span>
            </span>
          </div>
        )}

        {buffCount > 0 && (
          <button type="button" className="inv-row inv-row--link" onClick={onNavigateShop}>
            <span className="inv-row-icon inv-row-icon--violet"><FlaskConical size={13} /></span>
            <span className="inv-row-name">
              {buffCount} pre-fight buff{buffCount === 1 ? "" : "s"}
            </span>
            <span className="inv-row-chevron">›</span>
          </button>
        )}
      </div>
    </section>
  );
});
