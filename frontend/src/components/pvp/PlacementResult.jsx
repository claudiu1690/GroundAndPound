import { Shield } from "lucide-react";
import { divisionLabel } from "./pvpConst";

/**
 * PlacementResult — shown when result.isPlacement is true.
 * Renders a placement-bout summary with no DP swing hero.
 * On result.placementComplete shows the final placement screen.
 *
 * Props:
 *   result    — FightResult DTO (with isPlacement, placement, placementComplete)
 *   onFightAgain    — continue to next placement or next fight
 *   onBackToLadder  — go back to ladder/hub (used on completion)
 */
export function PlacementResult({ result, onFightAgain, onBackToLadder }) {
  if (!result) return null;

  const {
    youWon,
    method,
    defender,
    placement,
    placementComplete,
    attacker,
    commentary,
    energyRemaining,
  } = result;

  const isDraw = method === "draw";
  const outcome = isDraw ? "draw" : youWon ? "win" : "loss";

  const fightNumber = placement?.fightNumber ?? 1;
  const totalFights = placement?.total ?? 3;
  const wins = placement?.wins ?? 0;
  const remaining = totalFights - fightNumber;

  const opponentName = defender?.name ?? "Opponent";

  function methodLabel(m) {
    if (!m || m === "draw") return "Decision";
    if (m === "ko") return "KO";
    if (m === "submission") return "Submission";
    if (m === "decision") return "Decision";
    return m;
  }

  // ── PLACEMENT COMPLETE SCREEN ──
  if (placementComplete) {
    const divisionAfter = attacker?.divisionAfter ?? attacker?.division ?? "";
    const dpAfter = attacker?.dpAfter ?? 0;

    return (
      <div className="pvp-card">
        <div className="pvp-card-nav">
          <div className="pvp-cnav-title">Placement Complete</div>
          <div className="pvp-cnav-right">The Proving Ground</div>
        </div>

        {/* Completion hero */}
        <div className="pvp-rh pvp-rh-win">
          <div className="pvp-rh-glow pvp-rh-glow-win" />
          <div className="pvp-placement-complete-badge">
            <Shield size={28} strokeWidth={1.5} style={{ color: "#3B82F6", marginBottom: 6 }} />
          </div>
          <div className="pvp-rh-outcome-row">
            <span className="pvp-rh-outcome pvp-rh-outcome-win">Placement Complete</span>
          </div>
          <div className="pvp-rh-sub">
            {wins} win{wins !== 1 ? "s" : ""} out of {totalFights}
          </div>
        </div>

        {/* Starting position card */}
        <div className="pvp-placement-summary-card">
          <div className="pvp-ps-row">
            <div className="pvp-ps-item">
              <div className="pvp-ps-lbl">Starting Position</div>
              <div className="pvp-ps-val">
                Division {divisionLabel(divisionAfter)} &middot; {(dpAfter ?? 0).toLocaleString()} DP
              </div>
            </div>
          </div>
          <div className="pvp-shield-banner" style={{ marginTop: 10 }}>
            <Shield size={13} strokeWidth={2} style={{ color: "#3B82F6", flexShrink: 0 }} />
            <div className="pvp-shield-text">
              <strong>New Competitor Shield active</strong> — 7 days of protection from challenges.
            </div>
          </div>
        </div>

        {/* Commentary */}
        {commentary && commentary.length > 0 && (
          <div className="pvp-commentary">
            {commentary.map((line, i) => (
              <div key={i} className="pvp-commentary-line">{line}</div>
            ))}
          </div>
        )}

        <div className="pvp-ra">
          <button className="pvp-ra-btn-prim" onClick={onBackToLadder}>Enter the Ladder</button>
        </div>
      </div>
    );
  }

  // ── PLACEMENT BOUT SCREEN ──
  return (
    <div className="pvp-card">
      <div className="pvp-card-nav">
        <div className="pvp-cnav-title">Placement Match</div>
        <div className="pvp-cnav-right">Bout {fightNumber} of {totalFights}</div>
      </div>

      {/* Result hero — no DP swing */}
      <div className={`pvp-rh pvp-rh-${outcome}`}>
        <div className={`pvp-rh-glow pvp-rh-glow-${outcome}`} />

        {/* Placement bout label replaces DP number */}
        <div className="pvp-placement-bout-label">
          Placement Bout {fightNumber} of {totalFights}
        </div>

        <div className="pvp-rh-outcome-row">
          <span className={`pvp-rh-outcome pvp-rh-outcome-${outcome}`}>
            {isDraw ? "Draw" : youWon ? "Victory" : "Defeat"}
          </span>
          <span className={`pvp-rh-method pvp-rh-method-${outcome}`}>
            {methodLabel(method)}
          </span>
        </div>

        <div className="pvp-rh-sub">vs {opponentName}</div>

        <div className="pvp-rh-context">
          <span className="pvp-rh-ctx-pill pvp-rh-ctx-pill-base">No DP change</span>
        </div>
      </div>

      {/* Placement progress */}
      <div className="pvp-dpb">
        <div className="pvp-dpb-title">Placement Progress</div>
        <div className="pvp-dpb-rows">
          <div className="pvp-dpb-row">
            <span className="pvp-dpb-lbl">Bout</span>
            <span className="pvp-dpb-val pvp-dpb-val-base">{fightNumber} of {totalFights}</span>
          </div>
          <div className="pvp-dpb-row">
            <span className="pvp-dpb-lbl">Wins</span>
            <span className="pvp-dpb-val pvp-dpb-val-win">{wins}</span>
          </div>
        </div>
        <div className="pvp-dpb-divider" />
        <div className="pvp-dpb-total">
          <span className="pvp-dpb-total-lbl">Remaining</span>
          <span className="pvp-dpb-total-val pvp-dpb-total-val-draw">
            {remaining} placement fight{remaining !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Commentary */}
      {commentary && commentary.length > 0 && (
        <div className="pvp-commentary">
          {commentary.map((line, i) => (
            <div key={i} className="pvp-commentary-line">{line}</div>
          ))}
        </div>
      )}

      {energyRemaining != null && (
        <div className="pvp-energy-remaining">
          Energy remaining: {energyRemaining}
        </div>
      )}

      <div className="pvp-ra">
        <button className="pvp-ra-btn-prim" onClick={onFightAgain}>Next Placement Fight</button>
        <button className="pvp-ra-btn-sec" onClick={onBackToLadder}>Back to Ladder</button>
      </div>
    </div>
  );
}
