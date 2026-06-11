import { useEffect, useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { usePvpOpponents } from "../../../hooks/usePvpOpponents";
import { PreFight } from "../PreFight";
import { FightResult } from "../FightResult";
import { seasonWeightClassLabel } from "../pvpConst";

function DiffPill({ difficulty }) {
  const map = {
    easy: { label: "Easy", color: "#4ADE80", bg: "rgba(58,154,74,0.12)", border: "rgba(58,154,74,0.2)" },
    even: { label: "Even", color: "#FBB042", bg: "rgba(200,122,16,0.12)", border: "rgba(200,122,16,0.2)" },
    hard: { label: "Hard", color: "#C8102E", bg: "rgba(200,16,46,0.12)", border: "rgba(200,16,46,0.2)" },
  };
  const style = map[difficulty] ?? map.even;
  return (
    <span
      className="pvp-diff-pill"
      style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
    >
      {style.label}
    </span>
  );
}

/**
 * FightTab — opponents list + pre-fight flow.
 *
 * New onboarding props consumed:
 *   onboarding.placement?.active — when true, show placement header instead of normal header
 *   candidate.isProtected        — grey "Protected" pill + disabled Challenge button
 *
 * New result fields routed:
 *   result.isPlacement           — FightResult branches to PlacementResult automatically
 *   result.placementComplete     — PlacementResult shows completion screen
 */
export function FightTab({ fighter, season, myRecord, onFightResolved, onboarding, preSelectedDefenderId, onPreSelectionConsumed }) {
  const { data, loading, refreshing, error, silentRefetch } = usePvpOpponents();
  const [selected, setSelected] = useState(null);   // candidate chosen
  const [fightResult, setFightResult] = useState(null);

  const candidates = data?.candidates ?? [];

  // When a preSelectedDefenderId arrives (from a profile Challenge click),
  // auto-select the matching candidate once the opponent list loads.
  // If the candidate isn't in the list we gracefully show the full list
  // without crashing. Consume the pre-selection ID immediately to avoid
  // re-triggering on data refreshes.
  useEffect(() => {
    if (!preSelectedDefenderId || loading || !data) return;
    const match = candidates.find((c) => c.playerId === preSelectedDefenderId);
    onPreSelectionConsumed?.();
    if (match) setSelected(match);
    // If not found, the list is shown normally — graceful degradation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedDefenderId, loading, data]);
  const energyCur = fighter?.energy?.current ?? 0;

  function handleFightComplete(result) {
    setFightResult(result);
    if (onFightResolved) onFightResolved(result);
  }

  function handleFightAgain() {
    setFightResult(null);
    setSelected(null);
    silentRefetch();
  }

  function handleBackToLadder() {
    setFightResult(null);
    setSelected(null);
  }

  // Show fight result screen
  if (fightResult) {
    return (
      <FightResult
        result={fightResult}
        fighter={fighter}
        onFightAgain={handleFightAgain}
        onBackToLadder={handleBackToLadder}
      />
    );
  }

  // Show pre-fight screen
  if (selected) {
    return (
      <PreFight
        fighter={fighter}
        candidate={selected}
        season={season}
        myRecord={myRecord}
        onBack={() => setSelected(null)}
        onFightComplete={handleFightComplete}
      />
    );
  }

  // Show opponents list
  return (
    <div className="pvp-fight-wrap">
      {/* Energy card */}
      <div className="pvp-energy-card">
        <div className="pvp-ec-icon">
          <Zap size={18} strokeWidth={2} />
        </div>
        <div className="pvp-ec-info">
          <div className="pvp-ec-name">Energy</div>
          <div className="pvp-ec-sub">Each PVP fight costs 15 energy</div>
        </div>
        <div className="pvp-ec-val">{energyCur}</div>
      </div>

      {/* Placement header — replaces normal header when in placement */}
      {onboarding?.placement?.active ? (
        <div className="pvp-placement-fight-header">
          <div className="pvp-placement-fight-title">
            Placement Match {Math.min(3, (onboarding.placement.fights ?? 0) + 1)} of 3
          </div>
          <div className="pvp-placement-fight-sub">
            Win to start higher on the ladder. No DP gained or lost during placement.
          </div>
          <button
            className="pvp-refresh-btn"
            onClick={silentRefetch}
            disabled={refreshing}
            title="Refresh opponents"
          >
            <RefreshCw size={13} strokeWidth={2} className={refreshing ? "pvp-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      ) : (
        <div className="pvp-fight-header">
          <div className="pvp-section-lbl" style={{ marginBottom: 0 }}>
            Available Opponents · {seasonWeightClassLabel(season)}
          </div>
          <button
            className="pvp-refresh-btn"
            onClick={silentRefetch}
            disabled={refreshing}
            title="Refresh opponents"
          >
            <RefreshCw size={13} strokeWidth={2} className={refreshing ? "pvp-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="pvp-loading">Finding opponents…</div>
      ) : error ? (
        <div className="pvp-error-note">{error}</div>
      ) : candidates.length === 0 ? (
        <div className="pvp-empty-opponents">
          No opponents found. The pool may be too small — check back later.
        </div>
      ) : (
        <div className="pvp-opponents-list">
          {candidates.map((c) => {
            const diffClass = c.difficulty === "hard" ? "pvp-mc-diff-hard" : c.difficulty === "easy" ? "pvp-mc-diff-easy" : "pvp-mc-diff-even";
            const cardClass = c.isBeltHolder ? "pvp-matchup-card pvp-matchup-champ" : c.isRival ? "pvp-matchup-card pvp-matchup-rival" : "pvp-matchup-card";

            const bracketNote = c.bracketBonus === "plus25"
              ? "+25% bonus DP — large bracket"
              : c.bracketBonus === "plus10"
                ? "+10% bonus DP — expanded bracket"
                : null;

            const rivalNote = c.isRival ? "Rivalry Resolved if you win — bonus DP" : null;
            const beltNote = c.isBeltHolder ? "+50 bonus DP for beating the belt holder" : null;

            return (
              <div key={c.playerId} className={cardClass}>
                <div className={`pvp-mc-diff ${diffClass}`} />
                <div className="pvp-mc-body">
                  <div className="pvp-mc-info">
                    <div className="pvp-mc-name-row">
                      <div className="pvp-mc-name">{c.name}</div>
                      {c.isBeltHolder && (
                        <>
                          <span>🏆</span>
                          <span className="pvp-mc-champ-tag">Belt Holder</span>
                        </>
                      )}
                      {c.isRival && <span className="pvp-mc-rival-tag">Rival</span>}
                      {c.isProtected && (
                        <span className="pvp-mc-protected-pill">Protected</span>
                      )}
                    </div>
                    <div className="pvp-mc-meta">
                      <span>{c.wins ?? 0}W · {c.losses ?? 0}L this season</span>
                      {season?.crossWeightClass && c.realWeightClass && (
                        <span className="pvp-wc-pill">{c.realWeightClass}</span>
                      )}
                    </div>
                    {(beltNote || rivalNote || bracketNote) && (
                      <div className={`pvp-mc-bonus ${c.isRival ? "pvp-mc-bonus-amb" : ""}`}>
                        {beltNote || rivalNote || bracketNote}
                      </div>
                    )}
                  </div>
                  <div className="pvp-mc-stats">
                    <div className="pvp-mc-ovr">OVR {c.overallRating ?? "—"}</div>
                    <div className="pvp-mc-dp-val">{(c.dp ?? 0).toLocaleString()} DP</div>
                  </div>
                  <DiffPill difficulty={c.difficulty} />
                </div>
                <div className="pvp-mc-action">
                  <button
                    className="pvp-chal-btn"
                    onClick={() => !c.isProtected && setSelected(c)}
                    disabled={energyCur < 15 || !!c.isProtected}
                    style={(energyCur < 15 || c.isProtected) ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                    title={c.isProtected ? "This fighter is protected — they're still finding their footing." : undefined}
                  >
                    Challenge
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {energyCur < 15 && !loading && (
        <div className="pvp-energy-warn">
          Not enough energy to fight. You need at least 15 energy.
        </div>
      )}
    </div>
  );
}
