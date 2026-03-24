import { useState, memo } from "react";
import { api } from "../api";
import { RECOMMENDED_TCA, FIGHT_STRATEGIES } from "../constants/gameConstants";

const WEIGHT_CUTS = [
  { value: "easy",       label: "Easy cut",       sub: "100% Stamina · 0% miss risk" },
  { value: "moderate",   label: "Moderate cut",   sub: "90% Stamina · 5% miss risk · +5 Max Stamina" },
  { value: "aggressive", label: "Aggressive cut", sub: "75% Stamina · 20% miss risk · +12 Max Stamina" },
];

export const FightCamp = memo(function FightCamp({ fighter, resolving, onCamp, onResolve, onMessage }) {
  const [strategy, setStrategyLocal] = useState("");
  const [weightCut, setWeightCutLocal] = useState("easy");

  if (!fighter?.acceptedFightId) return null;

  const recommended = RECOMMENDED_TCA[fighter.promotionTier] ?? 2;
  const tca = fighter.trainingCampActions ?? 0;
  const underCamped = tca < recommended;
  const tcaPct = Math.min(100, (tca / recommended) * 100);

  const handleSetStrategy = async (e) => {
    const value = e.target.value;
    if (!value) return;
    setStrategyLocal(value);
    try {
      await api.setStrategy(fighter._id, fighter.acceptedFightId, value);
      onMessage?.(`Strategy set: ${value}`);
    } catch (err) {
      onMessage?.(err.message || "Failed to set strategy");
    }
  };

  const handleSetWeightCut = async (e) => {
    const value = e.target.value;
    setWeightCutLocal(value);
    try {
      await api.setWeightCut(fighter._id, fighter.acceptedFightId, value);
      const wc = WEIGHT_CUTS.find((w) => w.value === value);
      onMessage?.(`Weight cut: ${wc?.label ?? value}`);
    } catch (err) {
      onMessage?.(err.message || "Failed to set weight cut");
    }
  };

  return (
    <section className="panel fight-camp">
      <h2 className="panel-title">Fight Camp</h2>
      <div className="panel-body">
        {/* TCA progress */}
        <div className="camp-header">
          <div>
            <div className="camp-tca-big">{tca}</div>
            <div className="camp-tca-label">TCA</div>
          </div>
          <div className="camp-tca-info">
            <div className="camp-tca-status">
              {tca} of {recommended} recommended actions
            </div>
            <div style={{ height: "6px", background: "var(--bg-input)", borderRadius: "3px", overflow: "hidden", margin: "0.35rem 0" }}>
              <div style={{ height: "100%", width: `${tcaPct}%`, background: underCamped ? "#fbbf24" : "var(--green-bright)", borderRadius: "3px", transition: "width 0.3s" }} />
            </div>
            {underCamped ? (
              <div className="camp-tca-warning">Under-camped — stat/stamina penalty will apply</div>
            ) : (
              <div className="camp-tca-ok">Camp complete — ready to fight</div>
            )}
          </div>
        </div>

        <p className="camp-explanation">
          Each TCA is one focused training session for this fight. Fewer TCAs than recommended means a stat penalty on fight night. Stack your camp, choose your game plan, then step into the cage.
        </p>

        <div className="camp-grid">
          <div className="form-row" style={{ margin: 0 }}>
            <label>Fight Strategy</label>
            <select value={strategy} onChange={handleSetStrategy} className="strategy-select">
              <option value="">— Choose before resolving —</option>
              {FIGHT_STRATEGIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>Weight Cut</label>
            <select value={weightCut} onChange={handleSetWeightCut}>
              {WEIGHT_CUTS.map((wc) => (
                <option key={wc.value} value={wc.value}>{wc.label} — {wc.sub}</option>
              ))}
            </select>
          </div>
        </div>

        {weightCut === "moderate" && (
          <p className="camp-weight-note">Moderate cut: 5% chance to miss weight → −20% purse + Fame penalty.</p>
        )}
        {weightCut === "aggressive" && (
          <p className="camp-weight-note camp-weight-danger">Aggressive cut: 20% chance to miss weight → −20% purse + Fame penalty. High risk.</p>
        )}

        <div className="camp-actions">
          <button type="button" className="btn btn-secondary" onClick={onCamp}>
            + Add camp action
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onResolve}
            disabled={resolving}
            style={{ minWidth: "140px" }}
          >
            {resolving ? "Fight night…" : "⚔ Resolve fight"}
          </button>
        </div>
      </div>
    </section>
  );
});
