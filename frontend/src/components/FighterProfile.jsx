import { useState, memo } from "react";
import { STAT_TOOLTIPS } from "../constants/statTooltips";
import { api } from "../api";

const STAT_ORDER = ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"];
const SEVERITY_CLASS = { minor: "injury-minor", major: "injury-major" };

export const FighterProfile = memo(function FighterProfile({ fighter, gyms, onUpdateFighter, onRefreshFighter, onMessage }) {
  const [editing, setEditing] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editGymId, setEditGymId] = useState("");

  if (!fighter) {
    return (
      <section className="panel fighter-profile">
        <h2 className="panel-title">Fighter</h2>
        <div className="panel-body">
          <p className="panel-empty">Loading fighter data…</p>
        </div>
      </section>
    );
  }

  const startEdit = () => {
    setEditNickname(fighter?.nickname ?? "");
    setEditGymId(fighter?.gymId?._id ?? fighter?.gymId ?? "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!fighter?._id || !onUpdateFighter) return;
    try {
      await onUpdateFighter(fighter._id, {
        nickname: editNickname.trim() || undefined,
        gymId: editGymId || null,
      });
      setEditing(false);
    } catch (_) {}
  };

  const maxStForRest = fighter.maxStamina ?? 100;
  const restDisabled = (fighter.health ?? 100) >= 100 && (fighter.stamina ?? maxStForRest) >= maxStForRest;
  const restButtonTitle = restDisabled
    ? "Health and stamina are already full"
    : "3 Energy → +25 Health, +25 Stamina";

  return (
    <section className="panel fighter-profile">
      <h2 className="panel-title">Fighter</h2>

      {fighter && (
        <>
          {/* Nameplate */}
          <div className="fighter-nameplate">
            <div className="fighter-name-full">
              {fighter.firstName} {fighter.lastName}
            </div>
            {fighter.nickname && (
              <div className="fighter-nickname-display">"{fighter.nickname}"</div>
            )}
            <div className="fighter-tags">
              <span className="fighter-tag fighter-tag-ovr">OVR {fighter.overallRating}</span>
              <span className="fighter-tag">{fighter.weightClass}</span>
              <span className="fighter-tag">{fighter.style}</span>
              <span className="fighter-tag">{fighter.promotionTier ?? "Amateur"}</span>
            </div>
          </div>

          {/* Resource bars */}
          <div className="fighter-resources">
            {[
              { label: "Energy",  value: fighter.energy?.current ?? fighter.energy ?? 0, max: fighter.energy?.max ?? 100, cls: "resource-bar-energy" },
              { label: "Health",  value: fighter.health ?? 100,  max: 100,                      cls: "resource-bar-health" },
              { label: "Stamina", value: fighter.stamina ?? 100, max: fighter.maxStamina ?? 100, cls: "resource-bar-stamina" },
            ].map(({ label, value, max, cls }) => (
              <div className="resource-row" key={label}>
                <span className="resource-label">{label}</span>
                <div className="resource-bar-wrap">
                  <div className={`resource-bar ${cls}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
                </div>
                <span className="resource-value">{value}/{max}</span>
              </div>
            ))}
          </div>

          {/* Meta */}
          <div className="fighter-meta">
            <div className="meta-row">
              <span className="meta-label">Iron ⊗</span>
              <span className="meta-value meta-value-gold">{fighter.iron ?? 0}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Notoriety</span>
              <span className="meta-value">{fighter.notoriety ?? 0}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Record</span>
              <span className="meta-value">
                <span className="meta-value-green">{fighter.record?.wins ?? 0}W</span>
                {" – "}
                <span className="meta-value-red">{fighter.record?.losses ?? 0}L</span>
                {" – "}
                {fighter.record?.draws ?? 0}D
              </span>
            </div>
            {(fighter.record?.koWins > 0 || fighter.record?.subWins > 0) && (
              <div className="meta-row meta-row-sub">
                <span className="meta-label">Finishes</span>
                <span className="meta-value">
                  KO {fighter.record.koWins ?? 0} · Sub {fighter.record.subWins ?? 0}
                </span>
              </div>
            )}
            {fighter.gymId && typeof fighter.gymId === "object" && (
              <div className="meta-row">
                <span className="meta-label">Home gym</span>
                <span className="meta-value">{fighter.gymId.name}</span>
              </div>
            )}
            {fighter.acceptedFightId && (
              <div className="meta-row">
                <span className="meta-label">Camp</span>
                <span className="meta-value meta-value-green">{fighter.trainingCampActions ?? 0} TCA</span>
              </div>
            )}
            {fighter.comebackMode && (
              <div className="meta-row">
                <span className="meta-label">Comeback</span>
                <span className="meta-value meta-value-gold">Active</span>
              </div>
            )}
            {fighter.backstory && (
              <div className="meta-row">
                <span className="meta-label">Backstory</span>
                <span className="meta-value">{fighter.backstory}</span>
              </div>
            )}
          </div>

          {/* Badges */}
          {fighter.badges?.length > 0 && (
            <div className="fighter-badges">
              {fighter.badges.map((b) => (
                <span key={b} className="fighter-badge">★ {b}</span>
              ))}
            </div>
          )}

          {/* Actions */}
          {editing ? (
            <div className="profile-edit">
              <div className="form-row">
                <label>Nickname</label>
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="The Destroyer"
                  className="form-input"
                />
              </div>
              <div className="form-row">
                <label>Home gym</label>
                <select
                  value={editGymId}
                  onChange={(e) => setEditGymId(e.target.value)}
                  className="form-select"
                >
                  <option value="">None</option>
                  {(gyms || []).map((g) => (
                    <option key={g._id} value={g._id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="edit-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="profile-actions-row">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={restDisabled}
                title={restButtonTitle}
                onClick={async () => {
                  try {
                    await api.rest(fighter._id);
                    if (onRefreshFighter) await onRefreshFighter(fighter._id);
                  } catch (e) {
                    onMessage?.(e.message || "Rest failed");
                  }
                }}
              >
                Rest (3E)
              </button>
              {fighter.mentalResetRequired && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  title="5 Energy — clears mental block after 3 consecutive losses"
                  onClick={async () => {
                    try {
                      await api.mentalReset(fighter._id);
                      onMessage?.("Mental Reset done. You're cleared to fight again.");
                      if (onRefreshFighter) await onRefreshFighter(fighter._id);
                    } catch (e) {
                      onMessage?.(e.message || "Mental Reset failed");
                    }
                  }}
                >
                  Mental Reset (5E)
                </button>
              )}
            </div>
          )}

          {/* Stats */}
          {fighter.statProgress && (
            <div className="stat-meters">
              <h3 className="stat-meters-title">Stats &amp; XP</h3>
              {STAT_ORDER.map((name) => {
                const p = fighter.statProgress[name];
                if (!p) return null;
                const { value, xp, xpToNext } = p;
                const isMax = xpToNext == null;
                const pct = isMax ? 100 : (xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 0);
                return (
                  <div key={name} className="stat-row">
                    <span className="stat-name stat-tooltip" title={STAT_TOOLTIPS[name] ?? ""}>{name}</span>
                    <span className="stat-value">{value}</span>
                    <div className="stat-bar-wrap">
                      <div className="stat-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="stat-xp-text">
                      {isMax ? "Fight XP only" : `${xp} / ${xpToNext} XP`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Injuries */}
          {fighter.injuries?.length > 0 && (
            <div className="injuries-panel">
              <h3 className="injuries-title">Active Injuries</h3>
              {fighter.injuries.map((inj, i) => (
                <div key={i} className={`injury-item ${SEVERITY_CLASS[inj.severity] ?? ""}`}>
                  <div className="injury-header">
                    <span className="injury-label">{inj.label}</span>
                    <span className="injury-severity-badge">{inj.severity}</span>
                  </div>
                  <p className="injury-effect">{inj.effect}</p>
                  {inj.requiresDoctorVisit && !inj.doctorVisited && (
                    <button
                      type="button"
                      className="btn btn-warning btn-sm"
                      title={`Doctor: ${inj.docVisitEnergy} energy`}
                      onClick={async () => {
                        try {
                          await api.doctorVisit(fighter._id, inj.type);
                          onMessage?.(`Doctor visit complete — ${inj.label} healed.`);
                          if (onRefreshFighter) await onRefreshFighter(fighter._id);
                        } catch (e) {
                          onMessage?.(e.message || "Doctor visit failed");
                        }
                      }}
                    >
                      Visit doctor ({inj.docVisitEnergy}E)
                    </button>
                  )}
                  {!inj.requiresDoctorVisit && inj.recoverySessionsLeft > 0 && (
                    <p className="injury-recovery">
                      Recovery sessions left: <strong>{inj.recoverySessionsLeft}</strong>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
});
