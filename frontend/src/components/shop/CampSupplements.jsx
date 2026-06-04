import { memo, useCallback, useEffect, useState } from "react";
import { FlaskConical, ShoppingBag, X } from "lucide-react";
import { api } from "../../api";
import { buffStatTags } from "./shopConstants";

/**
 * Fight Camp "Supplements" section. Shows every pre-fight buff type from the
 * shop catalog as a selectable card. Owned buffs are interactive; not-owned
 * cards are dimmed with a "Buy →" link to the Shop. Single-select with a
 * "No supplement" clear option. Selection persists via PUT camp/:id/buff and
 * reflects campState.selectedBuffId.
 */
export const CampSupplements = memo(function CampSupplements({
  fighter,
  fightId,
  selectedBuffId,
  onSelected,
  onNavigateShop,
  onMessage,
  disabled = false,
}) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Optimistic local selection so cards highlight without flicker; falls back
  // to the server-confirmed selectedBuffId prop.
  const [localSel, setLocalSel] = useState(selectedBuffId ?? null);

  const fighterId = fighter?._id;

  useEffect(() => { setLocalSel(selectedBuffId ?? null); }, [selectedBuffId]);

  useEffect(() => {
    let live = true;
    if (!fighterId) return;
    setLoading(true);
    setError("");
    api.getShopCatalog(fighterId)
      .then((data) => { if (live) setCatalog(data); })
      .catch((e) => { if (live) setError(e.message || "Failed to load supplements."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fighterId]);

  const select = useCallback(async (buffId) => {
    if (!fightId || !fighterId || saving || disabled) return;
    const prev = localSel;
    setLocalSel(buffId);
    setSaving(true);
    try {
      const res = await api.selectCampBuff(fightId, fighterId, buffId);
      const confirmedId = res.selectedBuffId ?? buffId;
      const label = (catalog?.buffs || []).find((b) => b.id === confirmedId)?.name ?? null;
      if (onSelected) onSelected(confirmedId, label);
      if (onMessage && res.message) onMessage(res.message);
    } catch (e) {
      setLocalSel(prev); // revert on failure
      if (onMessage) onMessage(e.message || "Could not set supplement.");
    } finally {
      setSaving(false);
    }
  }, [fightId, fighterId, saving, disabled, localSel, catalog, onSelected, onMessage]);

  const buffs = catalog?.buffs || [];
  const ownedMap = fighter?.inventory?.prefightBuffs || {};
  const selectedBuff = buffs.find((b) => b.id === localSel) || null;

  return (
    <section className="camp-supps">
      <div className="camp-supps-head">
        <div className="camp-supps-head-text">
          <div className="camp-supps-title">
            <FlaskConical size={13} /> Supplements
          </div>
          <div className="camp-supps-sub">Optional pre-fight buffs — consumed after the fight resolves</div>
        </div>
        <span className="camp-supps-badge">Max 1 per fight</span>
      </div>

      {loading && <div className="camp-supps-state">Loading supplements…</div>}
      {!loading && error && (
        <div className="camp-supps-state camp-supps-state--error">{error}</div>
      )}

      {!loading && !error && (
        <>
          <div className="camp-supps-grid">
            {/* No supplement option */}
            <button
              type="button"
              className={`camp-supp-card camp-supp-card--none${!localSel ? " camp-supp-card--selected" : ""}`}
              onClick={() => select(null)}
              disabled={saving || disabled}
            >
              <span className="camp-supp-none-icon"><X size={16} /></span>
              <span className="camp-supp-name">No supplement</span>
              <span className="camp-supp-none-desc">Enter the fight without a buff</span>
            </button>

            {buffs.map((bf) => {
              const owned = (ownedMap[bf.id] || 0) > 0;
              const selected = localSel === bf.id;
              const tags = buffStatTags(bf);
              return (
                <button
                  key={bf.id}
                  type="button"
                  className={`camp-supp-card${selected ? " camp-supp-card--selected" : ""}${owned ? "" : " camp-supp-card--locked"}`}
                  onClick={() => owned ? select(bf.id) : onNavigateShop && onNavigateShop()}
                  disabled={saving || disabled}
                  title={owned ? undefined : "Not owned"}
                >
                  <div className="camp-supp-top">
                    <span className="camp-supp-name">{bf.name}</span>
                    {owned ? (
                      <span className="camp-supp-owned">Owned ×{ownedMap[bf.id]}</span>
                    ) : (
                      <span className="camp-supp-buy"><ShoppingBag size={10} /> Buy →</span>
                    )}
                  </div>
                  <div className="camp-supp-tags">
                    {tags.map((t, i) => (
                      <span key={i} className={`shop-bt shop-bt-${t.slug}`}>{t.text}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="camp-supps-summary">
            <span className="camp-supps-summary-lbl">Selected</span>
            <span className="camp-supps-summary-val">
              {selectedBuff ? selectedBuff.name : "No supplement"}
            </span>
          </div>
        </>
      )}
    </section>
  );
});
