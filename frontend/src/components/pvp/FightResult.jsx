import { DIVISIONS, divisionLabel, divisionMeta, OPEN_LABEL } from "./pvpConst";
import { PlacementResult } from "./PlacementResult";

/**
 * Screen 3 — Fight Result.
 * Receives the FightResult DTO from POST /pvp/fight (§3.4).
 * Props are UNCHANGED: { result, fighter, onFightAgain, onBackToLadder }
 *
 * New DTO fields consumed (onboarding / placement):
 *   result.isPlacement      — boolean; when true, render PlacementResult instead
 *   result.placement        — { fightNumber, total:3, wins } | null
 *   result.placementComplete — boolean; when true on 3rd fight
 *   result.catchUpActive    — boolean
 *   result.dpBreakdown.catchUpMultiplier — number; show gold row when > 1
 */
export function FightResult({ result, fighter, onFightAgain, onBackToLadder }) {
  if (!result) return null;

  // Branch: placement fights get their own screen (no DP swing)
  if (result.isPlacement) {
    return (
      <PlacementResult
        result={result}
        onFightAgain={onFightAgain}
        onBackToLadder={onBackToLadder}
      />
    );
  }

  const {
    youWon,
    method,
    attacker,
    defender,
    dpBreakdown,
    twistApplied,
    twistName,
    flags,
    commentary,
    energyRemaining,
    streakBefore,
    streakBroken,
    playerIsNowBeltHolder,
    beltHolderDpAfter,
    seasonWeeksRemaining,
    seasonNumber,
    crossWeightClass,
  } = result;

  // Derived flat names
  const isDraw = method === "draw";
  const outcome = isDraw ? "draw" : youWon ? "win" : "loss";

  const dpChange = attacker?.dpChange ?? 0;
  const dpBefore = attacker?.dpBefore ?? 0;
  const dpAfter = attacker?.dpAfter ?? 0;
  const rankBefore = attacker?.rankBefore;
  const rankAfter = attacker?.rankAfter;
  const streakAfter = attacker?.streakAfter ?? 0;
  const promoted = attacker?.promoted ?? false;
  const divisionAfter = attacker?.divisionAfter ?? attacker?.division ?? "";
  const divisionBefore = attacker?.divisionBefore ?? "";
  const division = attacker?.division ?? divisionAfter;

  const opponentName = defender?.name ?? "Opponent";
  const opponentDivision = defender?.divisionAfter ?? "";
  const opponentOvr = defender?.overallRating;
  const defenderWasBeltHolder = flags?.isBeltHolderFight ?? false;
  const rivalryResolved = flags?.isRivalryResolved ?? false;

  // Weight class label from fighter prop (capitalised)
  const weightClassLabel = fighter?.weightClass
    ? fighter.weightClass.charAt(0).toUpperCase() + fighter.weightClass.slice(1)
    : "";

  // Opponent's real weight class — only meaningful in Open seasons
  const opponentRealWc = crossWeightClass ? defender?.realWeightClass : null;

  // Division nav label — show "Before → After" when promoted
  const divNavLabel = promoted
    ? `${divisionLabel(divisionBefore)} → ${divisionLabel(divisionAfter)}`
    : divisionLabel(division);
  // In Open seasons the arena spans all classes — show the open label instead
  // of the viewer's single weight class so it reads as the open arena.
  const cardNavRight = crossWeightClass
    ? `${OPEN_LABEL} · ${divNavLabel}`
    : weightClassLabel
      ? `${weightClassLabel} · ${divNavLabel}`
      : divNavLabel;

  // DP sign display
  function dpSign(n) {
    if (isDraw) return "0";
    const abs = Math.abs(n).toLocaleString();
    return n >= 0 ? `+${abs}` : `−${abs}`;
  }

  // Method display label
  function methodLabel(m) {
    if (!m || m === "draw") return "Decision";
    if (m === "ko") return "KO";
    if (m === "submission") return "Submission";
    if (m === "decision") return "Decision";
    return m;
  }

  // ---------- CONTEXT PILLS ----------
  const contextPills = [];
  if (!isDraw) {
    if (youWon && (streakBefore ?? 0) >= 3) {
      contextPills.push({ cls: "streak", text: "🔥 ×1.25 streak" });
    }
    if (rivalryResolved) {
      contextPills.push({ cls: "rival", text: "⚔ Rivalry Resolved" });
    }
    if (youWon && defenderWasBeltHolder) {
      contextPills.push({ cls: "belt", text: "🏆 Belt Holder beaten +50" });
    }
    if (promoted) {
      contextPills.push({ cls: "promoted", text: "⬆ Promoted" });
    }
    if (!youWon && defenderWasBeltHolder) {
      contextPills.push({ cls: "belt", text: "🏆 Belt Holder" });
    }
    if (streakBroken) {
      contextPills.push({ cls: "broken", text: "Streak broken" });
    }
  }

  // ---------- DP BREAKDOWN ROWS ----------
  const breakdownRows = [];
  if (isDraw) {
    breakdownRows.push({ label: "Draw", value: "No change", cls: "penalty" });
    breakdownRows.push({
      label: "Streak",
      value: `Unchanged — ${streakBefore ?? streakAfter ?? 0} wins`,
      cls: "penalty",
    });
  } else if (dpBreakdown) {
    // Base
    if (youWon) {
      breakdownRows.push({ label: "Base win", value: `+${dpBreakdown.base ?? 120}`, cls: "base" });
    } else {
      const baseVal = dpBreakdown.base ?? dpChange;
      breakdownRows.push({ label: "Loss", value: `${baseVal}`, cls: "loss" });
    }
    // Belt holder bonus
    if ((dpBreakdown.beltHolderBonus ?? 0) !== 0) {
      breakdownRows.push({ label: "Belt Holder bonus", value: `+${dpBreakdown.beltHolderBonus}`, cls: "bonus" });
    }
    // Rivalry resolved
    if ((dpBreakdown.rivalryBonus ?? 0) !== 0) {
      breakdownRows.push({ label: "Rivalry resolved", value: `+${dpBreakdown.rivalryBonus}`, cls: "bonus" });
    }
    // Bracket bonus
    if ((dpBreakdown.bracketBonus ?? 0) !== 0) {
      breakdownRows.push({ label: "Bracket bonus", value: `+${dpBreakdown.bracketBonus}`, cls: "bonus" });
    }
    // Twist bonus
    if ((dpBreakdown.twistBonus ?? 0) !== 0) {
      breakdownRows.push({
        label: `${twistName ?? "Twist"} twist`,
        value: `+${dpBreakdown.twistBonus}`,
        cls: "bonus",
      });
    }
    // Streak multiplier (win)
    if (youWon && (dpBreakdown.streakMultiplier ?? 1) > 1) {
      breakdownRows.push({
        label: `Streak multiplier ×${dpBreakdown.streakMultiplier}`,
        value: `×${dpBreakdown.streakMultiplier}`,
        cls: "mult",
      });
    }
    // Catch-up multiplier (new competitor bonus)
    if ((dpBreakdown.catchUpMultiplier ?? 1) > 1) {
      breakdownRows.push({
        label: "Catch-up ×2",
        value: "×2",
        cls: "catchup",
      });
    }
    // Repeat penalty — show the actual DP it removed (signed, negative), not the bare
    // multiplier. The ×0.5/×0.25 is kept for the math; this is the human-readable hit.
    if ((dpBreakdown.repeatPenalty ?? 1) !== 1) {
      const penaltyDp = dpBreakdown.repeatPenaltyDp;
      breakdownRows.push({
        label: "Repeat penalty",
        value:
          penaltyDp != null && penaltyDp !== 0
            ? `${penaltyDp}` // already negative, e.g. "-109"
            : `×${dpBreakdown.repeatPenalty}`, // fallback for older payloads
        cls: "penalty",
        tip: `You've already fought this opponent ${dpBreakdown.repeatPenalty === 0.25 ? "3+ times" : "twice"} this week — repeat wins pay reduced DP (×${dpBreakdown.repeatPenalty}) so farming the same target isn't worth it.`,
      });
    }
    // Streak broken (loss)
    if (streakBroken) {
      breakdownRows.push({ label: "Streak multiplier", value: "reset to ×1.0", cls: "penalty" });
    }
  }

  // Total value class
  const totalCls = isDraw ? "draw" : youWon ? "win" : "loss";
  const totalLabel = isDraw ? "0 DP" : `${dpSign(dpChange)} DP`;

  // ---------- LADDER MOVEMENT ----------
  const rankDiff = rankBefore != null && rankAfter != null ? rankBefore - rankAfter : null;

  // ---------- BANNERS (ordered: promo, belt, rival-res, streak-up, streak-down) ----------
  const showPromoBanner = promoted;
  const showBeltBanner = (playerIsNowBeltHolder && defenderWasBeltHolder);
  const showRivalResBanner = rivalryResolved;
  const showStreakUpBanner = youWon && streakAfter >= 3;
  const showStreakDownBanner = !!streakBroken;

  // ---------- PROGRESS BAR ----------
  const divMeta = divisionMeta(division);
  const divMetaAfter = divisionMeta(divisionAfter);

  // Next division
  const currentDivIndex = DIVISIONS.findIndex((d) => d.key === division);
  const nextDiv = currentDivIndex >= 0 && currentDivIndex < DIVISIONS.length - 1
    ? DIVISIONS[currentDivIndex + 1]
    : null;
  const nextDivAfterIndex = DIVISIONS.findIndex((d) => d.key === divisionAfter);
  const nextDivAfter = nextDivAfterIndex >= 0 && nextDivAfterIndex < DIVISIONS.length - 1
    ? DIVISIONS[nextDivAfterIndex + 1]
    : null;

  function barPct(dp, promoteAt, floor) {
    if (promoteAt == null) {
      // Champion: show near-full bar relative to floor*1.1
      const ref = (floor ?? 5000) * 1.1;
      return Math.min(100, Math.max(0, (dp / ref) * 100));
    }
    return Math.min(100, Math.max(0, (dp / promoteAt) * 100));
  }

  // Belt-holder-defeated variant
  const isBeltHolderProg = playerIsNowBeltHolder && defenderWasBeltHolder && beltHolderDpAfter != null;
  const isPromoProg = promoted && !isBeltHolderProg;

  return (
    <div className="pvp-card">
      {/* Nav */}
      <div className="pvp-card-nav">
        <div className="pvp-cnav-title">PVP Result</div>
        <div className="pvp-cnav-right">{cardNavRight}</div>
      </div>

      {/* ── RESULT HERO ── */}
      <div className={`pvp-rh pvp-rh-${outcome}`}>
        <div className={`pvp-rh-glow pvp-rh-glow-${outcome}`} />

        {/* DP number */}
        <div className="pvp-rh-dp">
          <div className={`pvp-rh-dp-val pvp-rh-dp-val-${outcome}`}>{dpSign(dpChange)}</div>
          <div className={`pvp-rh-dp-lbl pvp-rh-dp-lbl-${outcome}`}>DP</div>
        </div>

        {/* Outcome + method */}
        <div className="pvp-rh-outcome-row">
          <span className={`pvp-rh-outcome pvp-rh-outcome-${outcome}`}>
            {isDraw ? "Draw" : youWon ? "Victory" : "Defeat"}
          </span>
          <span className={`pvp-rh-method pvp-rh-method-${outcome}`}>
            {methodLabel(method)}
          </span>
        </div>

        {/* Opponent line */}
        <div className="pvp-rh-sub">
          vs {opponentName}
          {crossWeightClass && opponentRealWc ? ` · ${opponentRealWc}` : ""}
          {opponentDivision ? ` · ${divisionLabel(opponentDivision)}` : ""}
          {defenderWasBeltHolder ? " · 🏆 Belt Holder" : ""}
        </div>

        {/* Context pills / draw plain text */}
        {isDraw ? (
          <div className="pvp-rh-context" style={{ color: "#555" }}>
            Streak unchanged · No rivalry progress · No DP change
          </div>
        ) : (
          <div className="pvp-rh-context">
            {contextPills.map((p, i) => (
              <span key={i} className={`pvp-rh-ctx-pill pvp-rh-ctx-pill-${p.cls}`}>
                {p.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── DP BREAKDOWN ── */}
      <div className="pvp-dpb">
        <div className="pvp-dpb-title">DP Breakdown</div>
        <div className="pvp-dpb-rows">
          {breakdownRows.map((row, i) => (
            <div key={i} className="pvp-dpb-row" title={row.tip || undefined}>
              <span className="pvp-dpb-lbl">
                {row.label}
                {row.tip && <span className="pvp-dpb-info"> ⓘ</span>}
              </span>
              <span className={`pvp-dpb-val pvp-dpb-val-${row.cls}`}>{row.value}</span>
            </div>
          ))}
        </div>
        <div className="pvp-dpb-divider" />
        <div className="pvp-dpb-total">
          <span className="pvp-dpb-total-lbl">Total</span>
          <span className={`pvp-dpb-total-val pvp-dpb-total-val-${totalCls}`}>{totalLabel}</span>
        </div>
      </div>

      {/* ── RESULT BODY ── */}
      <div className="pvp-rb">

        {/* Ladder movement */}
        {rankBefore != null && rankAfter != null && (
          <div className="pvp-lm">
            <span className="pvp-lm-label">Ladder position</span>
            <span className="pvp-lm-from">#{rankBefore}</span>
            <span className="pvp-lm-arrow">→</span>
            <span className={`pvp-lm-to pvp-lm-to-${rankDiff > 0 ? "up" : rankDiff < 0 ? "down" : "same"}`}>
              #{rankAfter}
            </span>
            {promoted ? (
              <span className="pvp-lm-delta pvp-lm-delta-up">▲ {divisionLabel(divisionAfter)}</span>
            ) : rankDiff !== null && rankDiff > 0 ? (
              <span className="pvp-lm-delta pvp-lm-delta-up">▲ {rankDiff} places</span>
            ) : rankDiff !== null && rankDiff < 0 ? (
              <span className="pvp-lm-delta pvp-lm-delta-down">▼ {Math.abs(rankDiff)} places</span>
            ) : (
              <span className="pvp-lm-delta pvp-lm-delta-same">No change</span>
            )}
          </div>
        )}

        {/* Promo banner */}
        {showPromoBanner && (
          <div className="pvp-banner pvp-banner-promo">
            <div className="pvp-banner-icon">⬆</div>
            <div className="pvp-banner-info">
              <div className="pvp-banner-title">Promoted to {divisionLabel(divisionAfter)}</div>
              <div className="pvp-banner-sub">
                Your DP resets to the new division&apos;s floor — keep winning to climb.
              </div>
            </div>
            <div className="pvp-banner-val">
              <span
                className="pvp-div-pill"
                style={{
                  background: `${divisionMeta(divisionAfter).color}1e`,
                  color: divisionMeta(divisionAfter).color,
                  border: `1px solid ${divisionMeta(divisionAfter).color}33`,
                }}
              >
                {divisionLabel(divisionAfter)}
              </span>
            </div>
          </div>
        )}

        {/* Belt banner */}
        {showBeltBanner && (
          <div className="pvp-banner pvp-banner-belt">
            <div className="pvp-banner-icon">🏆</div>
            <div className="pvp-banner-info">
              <div className="pvp-banner-title">Belt Holder Defeated</div>
              <div className="pvp-banner-sub">
                {opponentName} loses the top spot. You're now #1 — defend it to claim the belt at season end.
              </div>
            </div>
          </div>
        )}

        {/* Rivalry resolved banner */}
        {showRivalResBanner && (
          <div className="pvp-banner pvp-banner-rival-res">
            <div className="pvp-banner-icon">⚔</div>
            <div className="pvp-banner-info">
              <div className="pvp-banner-title">Rivalry Resolved</div>
              <div className="pvp-banner-sub">
                3 wins against {opponentName} this season. The rivalry is over.
              </div>
            </div>
            <div className="pvp-banner-val">+25</div>
          </div>
        )}

        {/* Streak up banner */}
        {showStreakUpBanner && (
          <div className="pvp-banner pvp-banner-streak-up">
            <div className="pvp-banner-icon">🔥</div>
            <div className="pvp-banner-info">
              <div className="pvp-banner-title">
                {streakAfter}-win streak{streakAfter >= 4 ? " · ×1.25 active" : ""}
              </div>
              <div className="pvp-banner-sub">
                {streakAfter === 3
                  ? "Win again to activate the ×1.25 multiplier."
                  : promoted
                  ? "Streak carries into the new division."
                  : "Next win is still at ×1.25 multiplier. Keep going."}
              </div>
            </div>
          </div>
        )}

        {/* Streak down banner */}
        {showStreakDownBanner && (
          <div className="pvp-banner pvp-banner-streak-down">
            <div className="pvp-banner-icon">💨</div>
            <div className="pvp-banner-info">
              <div className="pvp-banner-title">{(streakBefore ?? 0)}-win streak ended</div>
              <div className="pvp-banner-sub">
                DP multiplier reset to ×1.0. Win 3 in a row to reactivate ×1.25.
              </div>
            </div>
          </div>
        )}

        {/* ── DP PROGRESS BAR ── */}
        {isBeltHolderProg ? (
          // Variant 1: Belt-holder-defeated
          <div className="pvp-dp-prog">
            <div className="pvp-dp-prog-title">
              Champion Division · Season {seasonNumber ?? ""}
            </div>
            <div className="pvp-dp-bar-row">
              <span className="pvp-dp-bar-lbl">Your DP</span>
              <div className="pvp-dp-bar-track">
                <div
                  className="pvp-dp-bar-fill"
                  style={{ width: `${barPct(dpAfter, divMeta.promoteAt, divMeta.floor)}%`, background: "#4ADE80" }}
                />
              </div>
              <span className="pvp-dp-bar-val" style={{ color: "#4ADE80" }}>{(dpAfter ?? 0).toLocaleString()}</span>
            </div>
            <div className="pvp-dp-bar-row">
              <span className="pvp-dp-bar-lbl">{opponentName.split(" ")[0]}</span>
              <div className="pvp-dp-bar-track">
                <div
                  className="pvp-dp-bar-fill"
                  style={{ width: `${barPct(beltHolderDpAfter, divMeta.promoteAt, divMeta.floor)}%`, background: "rgba(59,130,246,0.4)" }}
                />
              </div>
              <span className="pvp-dp-bar-val" style={{ color: "#AAAAAA" }}>{(beltHolderDpAfter ?? 0).toLocaleString()}</span>
            </div>
            <div className="pvp-dp-note">
              {seasonWeeksRemaining ?? "?"} weeks remaining — <span>stay at #1</span> to claim the belt
            </div>
          </div>
        ) : isPromoProg ? (
          // Variant 2: Promotion
          <div className="pvp-dp-prog">
            <div className="pvp-dp-prog-title">
              {divisionLabel(divisionAfter)} Division · Starting DP
            </div>
            <div className="pvp-dp-bar-row">
              <span className="pvp-dp-bar-lbl">Position</span>
              <div className="pvp-dp-bar-track">
                <div
                  className="pvp-dp-bar-fill"
                  style={{ width: `${barPct(dpAfter, divMetaAfter.promoteAt, divMetaAfter.floor)}%`, background: "#4ADE80" }}
                />
              </div>
              <span className="pvp-dp-bar-val" style={{ color: "#AAAAAA" }}>{(dpAfter ?? 0).toLocaleString()}</span>
            </div>
            {nextDivAfter ? (
              <div className="pvp-dp-note">
                <span>{((nextDivAfter.promoteAt ?? 0) - dpAfter).toLocaleString()} DP</span> needed for {nextDivAfter.label} promotion
              </div>
            ) : (
              <div className="pvp-dp-note">You're in Champion.</div>
            )}
          </div>
        ) : isDraw ? (
          // Variant 3b: Draw
          <div className="pvp-dp-prog">
            <div className="pvp-dp-prog-title">Season DP — unchanged</div>
            <div className="pvp-dp-bar-row">
              <span className="pvp-dp-bar-lbl">DP</span>
              <div className="pvp-dp-bar-track">
                <div
                  className="pvp-dp-bar-fill"
                  style={{ width: `${barPct(dpAfter, divMeta.promoteAt, divMeta.floor)}%`, background: "#3B82F6", opacity: 0.5 }}
                />
              </div>
              <span className="pvp-dp-bar-val" style={{ color: "#AAAAAA" }}>{(dpAfter ?? 0).toLocaleString()}</span>
            </div>
            {nextDiv ? (
              <div className="pvp-dp-note">
                <span>{((nextDiv.promoteAt ?? 0) - dpAfter).toLocaleString()} DP</span> needed for {nextDiv.label} promotion
              </div>
            ) : (
              <div className="pvp-dp-note">You're at the top — Champion division.</div>
            )}
          </div>
        ) : youWon ? (
          // Variant 3a: Win
          <div className="pvp-dp-prog">
            <div className="pvp-dp-prog-title">
              Season DP · {(dpBefore ?? 0).toLocaleString()} → {(dpAfter ?? 0).toLocaleString()}
            </div>
            <div className="pvp-dp-bar-row">
              <span className="pvp-dp-bar-lbl">Before</span>
              <div className="pvp-dp-bar-track">
                <div
                  className="pvp-dp-bar-fill"
                  style={{ width: `${barPct(dpBefore, divMeta.promoteAt, divMeta.floor)}%`, background: "rgba(59,130,246,0.4)" }}
                />
              </div>
              <span className="pvp-dp-bar-val" style={{ color: "#AAAAAA" }}>{(dpBefore ?? 0).toLocaleString()}</span>
            </div>
            <div className="pvp-dp-bar-row">
              <span className="pvp-dp-bar-lbl">After</span>
              <div className="pvp-dp-bar-track">
                <div
                  className="pvp-dp-bar-fill"
                  style={{ width: `${barPct(dpAfter, divMeta.promoteAt, divMeta.floor)}%`, background: "#4ADE80" }}
                />
              </div>
              <span className="pvp-dp-bar-val" style={{ color: "#4ADE80" }}>{(dpAfter ?? 0).toLocaleString()}</span>
            </div>
            {nextDiv ? (
              <div className="pvp-dp-note">
                <span>{((nextDiv.promoteAt ?? 0) - dpAfter).toLocaleString()} DP</span> needed for {nextDiv.label} promotion
              </div>
            ) : (
              <div className="pvp-dp-note">You're at the top — Champion division.</div>
            )}
          </div>
        ) : (
          // Variant 4: Loss
          <div className="pvp-dp-prog">
            <div className="pvp-dp-prog-title">
              Season DP · {(dpBefore ?? 0).toLocaleString()} → {(dpAfter ?? 0).toLocaleString()}
            </div>
            <div className="pvp-dp-bar-row">
              <span className="pvp-dp-bar-lbl">Before</span>
              <div className="pvp-dp-bar-track">
                <div
                  className="pvp-dp-bar-fill"
                  style={{ width: `${barPct(dpBefore, divMeta.promoteAt, divMeta.floor)}%`, background: "rgba(59,130,246,0.4)" }}
                />
              </div>
              <span className="pvp-dp-bar-val" style={{ color: "#AAAAAA" }}>{(dpBefore ?? 0).toLocaleString()}</span>
            </div>
            <div className="pvp-dp-bar-row">
              <span className="pvp-dp-bar-lbl">After</span>
              <div className="pvp-dp-bar-track">
                <div
                  className="pvp-dp-bar-fill"
                  style={{ width: `${barPct(dpAfter, divMeta.promoteAt, divMeta.floor)}%`, background: "#C8102E", opacity: 0.6 }}
                />
              </div>
              <span className="pvp-dp-bar-val" style={{ color: "#C8102E" }}>{(dpAfter ?? 0).toLocaleString()}</span>
            </div>
            {(() => {
              const floor = divMeta.floor ?? 0;
              const above = (dpAfter ?? 0) - floor;
              const nearFloor = above < 60;
              return (
                <div className="pvp-dp-note">
                  {nearFloor
                    ? `Near floor — at risk of demotion on next loss`
                    : <>Still <span>{above.toLocaleString()} DP</span> above division floor — {divisionLabel(division)} secure</>}
                </div>
              );
            })()}
          </div>
        )}

        {/* Commentary — full fight play-by-play */}
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
      </div>

      {/* ── ACTIONS ── */}
      <div className="pvp-ra">
        <button className="pvp-ra-btn-prim" onClick={onFightAgain}>Fight Again</button>
        <button className="pvp-ra-btn-sec" onClick={onBackToLadder}>Back to Ladder</button>
      </div>
    </div>
  );
}
