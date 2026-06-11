import { useState } from "react";
import { Swords, ChevronLeft } from "lucide-react";
import { usePvpDefenseResults } from "../../hooks/usePvpDefenseResults";
import { api } from "../../api";

/**
 * Screen 4 — Defense Report.
 * Shows unread offline defenses and lets the fighter change their defense gameplan.
 */
export function DefenseResults({ myRecord, onBack, onGameplanChanged }) {
  const { data, loading, error } = usePvpDefenseResults();
  const [gameplan, setGameplan] = useState(myRecord?.defenseGameplan ?? "balanced");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const results = data?.results ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  async function handleSetGameplan(gp) {
    setGameplan(gp);
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.pvpSetDefenseGameplan(gp);
      setSaveMsg("Saved");
      if (onGameplanChanged) onGameplanChanged(gp);
    } catch (e) {
      setSaveMsg(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pvp-card">
      <div className="pvp-card-nav">
        {onBack && (
          <button className="pvp-cnav-back" onClick={onBack}>
            <ChevronLeft size={14} strokeWidth={2.5} /> Ladder
          </button>
        )}
        <div className="pvp-cnav-title">Defense Report</div>
        <div className="pvp-cnav-right">While you were away</div>
      </div>

      {unreadCount > 0 && (
        <div className="pvp-def-notice">
          <Swords size={14} strokeWidth={2} style={{ color: "#C87A10" }} />
          <div className="pvp-def-notice-text">
            <strong>{unreadCount} player{unreadCount !== 1 ? "s" : ""} challenged you</strong> while you were
            offline. Your defense gameplan:{" "}
            <strong style={{ color: "#C8102E", textTransform: "capitalize" }}>{gameplan}</strong>
          </div>
        </div>
      )}

      <div className="pvp-def-body">
        {loading ? (
          <div className="pvp-loading">Loading defense results…</div>
        ) : error ? (
          <div className="pvp-error-note">{error}</div>
        ) : results.length === 0 ? (
          <div className="pvp-def-empty">No unread defense challenges.</div>
        ) : (
          <>
            <div className="pvp-section-lbl">Results</div>
            {results.map((r) => {
              const won = r.youWon;
              const dp = r.dpChange ?? 0;
              return (
                <div key={r.fightId} className="pvp-def-result-card">
                  <div className="pvp-def-stripe" style={{ background: won ? "#3A9A4A" : "#C8102E" }} />
                  <div className="pvp-def-content">
                    <div className={`pvp-def-outcome ${won ? "pvp-def-outcome-w" : "pvp-def-outcome-l"}`}>
                      {won ? "Held" : "Lost"}
                    </div>
                    <div className="pvp-def-info">
                      <div className="pvp-def-opp">{r.attackerName} challenged you</div>
                      <div className="pvp-def-sub">
                        {r.method ? (r.method === "ko" ? "KO" : r.method === "submission" ? "Submission" : "Decision") : "—"}
                        {r.halfRate ? " · Half-rate loss" : ""}
                      </div>
                    </div>
                    <div>
                      <div className={`pvp-def-dp ${won ? "pvp-def-dp-w" : "pvp-def-dp-l"}`}>
                        {dp === 0 ? "+0 DP" : `${dp} DP`}
                      </div>
                      <div className="pvp-def-note">
                        {won ? "Defense win = no DP change" : "Half rate on defense losses"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Gameplan selector */}
        <div className="pvp-gameplan-set">
          <div className="pvp-gps-info">
            <div className="pvp-gps-title">Your default defense gameplan</div>
            <div className="pvp-gps-btns">
              {["aggressive", "balanced", "counter"].map((gp) => (
                <button
                  key={gp}
                  className={`pvp-gps-btn ${gameplan === gp ? "pvp-gps-btn-act" : ""}`}
                  onClick={() => handleSetGameplan(gp)}
                  disabled={saving}
                  style={{ textTransform: "capitalize" }}
                >
                  {gp}
                </button>
              ))}
            </div>
            {saveMsg && (
              <div style={{ fontSize: 10, color: saveMsg === "Saved" ? "#4ADE80" : "#C8102E", marginTop: 4 }}>
                {saveMsg}
              </div>
            )}
          </div>
        </div>

        {onBack && (
          <button className="pvp-fight-btn" style={{ background: "#3B82F6" }} onClick={onBack}>
            Back to Ladder
          </button>
        )}
      </div>
    </div>
  );
}
