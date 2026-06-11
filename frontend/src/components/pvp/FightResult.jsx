import { ArrowUp, ArrowDown, Minus, Flame, Swords, Shield } from "lucide-react";

/**
 * Screen 3 — Fight Result.
 * Receives the FightResult DTO from POST /pvp/fight (§3.4).
 * Field names match the contract exactly: attacker.dpChange, rankAfter,
 * promotionShield, flags.isRivalryResolved, dpBreakdown, etc.
 */
export function FightResult({ result, fighter, onFightAgain, onBackToLadder }) {
  if (!result) return null;

  const { youWon, method, attacker, defender, dpBreakdown, twistApplied, twistName, flags, commentary, energyRemaining } = result;

  const dpChange = attacker?.dpChange ?? 0;
  const dpBefore = attacker?.dpBefore ?? 0;
  const dpAfter = attacker?.dpAfter ?? 0;
  const rankBefore = attacker?.rankBefore;
  const rankAfter = attacker?.rankAfter;
  const streakAfter = attacker?.streakAfter ?? 0;
  const promoted = attacker?.promoted ?? false;
  const divisionAfter = attacker?.divisionAfter ?? attacker?.division ?? "";
  const divisionBefore = attacker?.divisionBefore ?? "";

  const opponentName = youWon ? defender?.name : (attacker?.name === fighter?.firstName + " " + fighter?.lastName ? defender?.name : defender?.name);

  // Build breakdown display string
  const breakdownParts = [];
  if (dpBreakdown) {
    if (dpBreakdown.base) breakdownParts.push(`${dpBreakdown.base > 0 ? "+" : ""}${dpBreakdown.base} base`);
    if (dpBreakdown.beltHolderBonus) breakdownParts.push(`+${dpBreakdown.beltHolderBonus} belt`);
    if (dpBreakdown.rivalryBonus) breakdownParts.push(`+${dpBreakdown.rivalryBonus} rivalry`);
    if (dpBreakdown.bracketBonus) breakdownParts.push(`+${dpBreakdown.bracketBonus} bracket`);
    if (dpBreakdown.streakMultiplier && dpBreakdown.streakMultiplier !== 1) breakdownParts.push(`×${dpBreakdown.streakMultiplier} streak`);
    if (dpBreakdown.repeatPenalty && dpBreakdown.repeatPenalty !== 1) breakdownParts.push(`×${dpBreakdown.repeatPenalty} repeat`);
  }
  const breakdownStr = breakdownParts.join(" · ");

  // DP history bars — max is based on promoteAt guess from division, or just scale vs current
  const maxDp = Math.max(dpBefore, dpAfter, 100);
  const barBefore = Math.min(100, (dpBefore / maxDp) * 100);
  const barAfter = Math.min(100, (dpAfter / maxDp) * 100);

  const rankDiff = rankBefore && rankAfter ? rankBefore - rankAfter : null;

  function methodLabel(m) {
    if (!m) return "";
    if (m === "ko") return "KO";
    if (m === "submission") return "Submission";
    if (m === "decision") return "Decision";
    if (m === "draw") return "Draw";
    return m;
  }

  return (
    <div className="pvp-card">
      <div className="pvp-card-nav">
        <div className="pvp-cnav-title">PVP Result</div>
        <div className="pvp-cnav-right">
          {divisionAfter}
        </div>
      </div>

      {/* Hero */}
      <div className={`pvp-fr-hero ${youWon ? "pvp-fr-hero-win" : "pvp-fr-hero-loss"}`}>
        <div className={`pvp-fr-outcome ${youWon ? "pvp-fr-outcome-win" : "pvp-fr-outcome-loss"}`}>
          {method === "draw" ? "Draw" : youWon ? "Victory" : "Defeat"}
        </div>
        <div className="pvp-fr-sub">
          vs {defender?.name ?? "opponent"} · {methodLabel(method)}
          {flags?.isRivalryResolved ? " · Rivalry Resolved" : ""}
          {flags?.isBeltHolderFight ? " · Belt Holder" : ""}
        </div>

        <div className="pvp-fr-dp-swing">
          <div>
            <div className={`pvp-fr-dp-val ${youWon ? "pvp-fr-dp-val-win" : "pvp-fr-dp-val-loss"}`}>
              {dpChange >= 0 ? "+" : ""}{dpChange} DP
            </div>
            <div className="pvp-fr-dp-lbl">Division Points {youWon ? "earned" : "lost"}</div>
            {breakdownStr && (
              <div className={`pvp-fr-dp-bonus ${!youWon ? "pvp-fr-dp-bonus-loss" : ""}`}>
                {breakdownStr}
                {twistApplied && twistName ? ` · ${twistName} twist` : ""}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="pvp-fr-body">
        {/* Rank movement */}
        {rankBefore != null && rankAfter != null && (
          <div className="pvp-ladder-move">
            <div className="pvp-lm-label">Ladder rank movement</div>
            <span className="pvp-lm-rank pvp-lm-same" style={{ color: "#AAAAAA" }}>#{rankBefore}</span>
            <div className="pvp-lm-arrow">→</div>
            <span className={`pvp-lm-rank ${rankDiff > 0 ? "pvp-lm-up" : rankDiff < 0 ? "pvp-lm-down" : "pvp-lm-same"}`}>
              #{rankAfter}
            </span>
            {rankDiff !== null && rankDiff !== 0 && (
              <span style={{ fontSize: 10, marginLeft: 4, color: rankDiff > 0 ? "#4ADE80" : "#C8102E" }}>
                {rankDiff > 0 ? "▲" : "▼"} {Math.abs(rankDiff)}
              </span>
            )}
          </div>
        )}

        {/* Promotion banner */}
        {promoted && (
          <div className="pvp-promo-banner">
            <ArrowUp size={18} strokeWidth={2} style={{ color: "#3B82F6" }} />
            <div style={{ flex: 1 }}>
              <div className="pvp-banner-title" style={{ color: "#3B82F6" }}>
                Promoted to {divisionAfter}!
              </div>
              <div className="pvp-banner-sub">
                You advanced from {divisionBefore}. Promotion Shield active for {attacker?.promotionShield ?? 3} fights.
              </div>
            </div>
          </div>
        )}

        {/* Rivalry resolved banner */}
        {flags?.isRivalryResolved && (
          <div className="pvp-rival-res-banner">
            <Swords size={18} strokeWidth={2} />
            <div style={{ flex: 1 }}>
              <div className="pvp-banner-title" style={{ color: "#C87A10" }}>Rivalry Resolved</div>
              <div className="pvp-banner-sub">3-0 record. The rivalry is over.</div>
            </div>
            <div className="pvp-banner-dp" style={{ color: "#C87A10" }}>+25 DP</div>
          </div>
        )}

        {/* Rivalry set banner */}
        {flags?.isRivalryFight && !flags?.isRivalryResolved && (
          <div className="pvp-rival-set-banner">
            <Swords size={18} strokeWidth={2} style={{ color: "#C87A10" }} />
            <div style={{ flex: 1 }}>
              <div className="pvp-banner-title" style={{ color: "#C87A10" }}>Rivalry Forming</div>
              <div className="pvp-banner-sub">One more win to resolve this rivalry and earn bonus DP.</div>
            </div>
          </div>
        )}

        {/* Streak banner — logic:
              streakAfter === 3 → multiplier kicks in NEXT fight, not this one
              streakAfter >= 4  → ×1.25 was already active on this fight */}
        {youWon && streakAfter >= 3 && (
          <div className="pvp-streak-res-banner">
            <Flame size={16} strokeWidth={2} style={{ color: "#D4A820" }} />
            <div style={{ flex: 1 }}>
              <div className="pvp-banner-title" style={{ color: "#D4A820" }}>
                {streakAfter}-win streak
                {streakAfter >= 4 ? " · ×1.25 active" : ""}
              </div>
              <div className="pvp-banner-sub">
                {streakAfter === 3
                  ? "Next win at ×1.25 multiplier"
                  : "×1.25 multiplier was active on this fight"}
              </div>
            </div>
          </div>
        )}

        {/* Streak broken — show when the DP breakdown had an active multiplier on the lost fight,
            indicating the player had a streak that is now gone. */}
        {!youWon && (dpBreakdown?.streakMultiplier ?? 1) > 1 && (
          <div className="pvp-streak-broken-banner">
            <Flame size={16} strokeWidth={2} style={{ color: "#C8102E" }} />
            <div style={{ flex: 1 }}>
              <div className="pvp-banner-title" style={{ color: "#C8102E" }}>Win streak broken</div>
              <div className="pvp-banner-sub">DP multiplier reset to ×1.0</div>
            </div>
          </div>
        )}

        {/* Defense shield note */}
        {!youWon && attacker?.promotionShield > 0 && (
          <div className="pvp-shield-note">
            <Shield size={13} strokeWidth={2} style={{ color: "#3B82F6" }} />
            <span>Promotion Shield active — {attacker.promotionShield} fight{attacker.promotionShield !== 1 ? "s" : ""} remaining</span>
          </div>
        )}

        {/* DP history bar */}
        <div className="pvp-dp-history">
          <div className="pvp-dph-title">
            Season DP · {dpBefore.toLocaleString()} → {dpAfter.toLocaleString()}
          </div>
          <div className="pvp-dph-bar">
            <div className="pvp-dph-lbl">Before</div>
            <div className="pvp-dph-track">
              <div className="pvp-dph-fill" style={{ width: `${barBefore}%`, background: "#3B82F6", opacity: 0.5 }} />
            </div>
            <div className="pvp-dph-val" style={{ color: "#AAAAAA" }}>{dpBefore.toLocaleString()}</div>
          </div>
          <div className="pvp-dph-bar">
            <div className="pvp-dph-lbl">After</div>
            <div className="pvp-dph-track">
              <div className="pvp-dph-fill" style={{ width: `${barAfter}%`, background: youWon ? "#3B82F6" : "#C8102E", opacity: youWon ? 1 : 0.7 }} />
            </div>
            <div className="pvp-dph-val" style={{ color: youWon ? "#F0F0F0" : "#C8102E" }}>{dpAfter.toLocaleString()}</div>
          </div>
        </div>

        {/* Commentary snippets */}
        {commentary && commentary.length > 0 && (
          <div className="pvp-commentary">
            {commentary.slice(0, 2).map((line, i) => (
              <div key={i} className="pvp-commentary-line">{line}</div>
            ))}
          </div>
        )}

        {energyRemaining != null && (
          <div className="pvp-energy-remaining">
            Energy remaining: {energyRemaining}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pvp-fr-actions">
        <button className="pvp-fr-btn pvp-fr-btn-prim" onClick={onFightAgain}>
          Fight Again
        </button>
        <button className="pvp-fr-btn pvp-fr-btn-sec" onClick={onBackToLadder}>
          Back to Ladder
        </button>
      </div>
    </div>
  );
}
