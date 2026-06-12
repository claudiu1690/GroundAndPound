/**
 * ConsequencesBlock — shared sub-component rendered after the DP breakdown.
 * Shows HP lost, injuries sustained, XP gained, stat level-ups, and a
 * flavor line about the opponent's state.
 *
 * Props:
 *   consequences  — { health: { before, after }, injuriesSustained: String[],
 *                     xpGained: { STR, STA, AGI, ... }, statLevelUps: String[] }
 *                   All fields optional-chained; absent payload renders nothing.
 *   defender      — { wasHurt: Boolean, tookInjury: Boolean }  (flavor only)
 *   isPlacement   — when true, show "No physical cost (placement)" variant.
 *
 * Guard: renders null if consequences is falsy AND isPlacement is false.
 */
export function ConsequencesBlock({ consequences, defender, isPlacement }) {
  // Placement fights that still lack consequences: show flat note
  if (!consequences && !isPlacement) return null;
  if (!consequences && isPlacement) {
    return (
      <div className="pvp-cons">
        <div className="pvp-cons-title">Physical Cost</div>
        <div className="pvp-cons-placement-note">No physical cost (placement)</div>
      </div>
    );
  }

  const healthBefore = consequences.health?.before ?? 100;
  const healthAfter  = consequences.health?.after  ?? 100;
  const hpLost       = healthBefore - healthAfter;
  const hpPct        = Math.min(100, Math.max(0, (healthAfter / 100) * 100));
  const beforePct    = Math.min(100, Math.max(0, (healthBefore / 100) * 100));

  const injuries      = consequences.injuriesSustained ?? [];
  const xpGained      = consequences.xpGained ?? {};
  const statLevelUps  = consequences.statLevelUps ?? [];

  // Build XP display entries — only stats that have nonzero xp
  const xpEntries = Object.entries(xpGained).filter(([, v]) => v > 0);

  // Defender flavor
  const defenderFlavor = defender?.tookInjury
    ? "You hurt your opponent."
    : defender?.wasHurt
      ? "Your opponent is banged up."
      : null;

  return (
    <div className="pvp-cons">
      <div className="pvp-cons-title">Your Physical Cost</div>

      {/* HP bar — before → after */}
      <div className="pvp-cons-hp-block">
        <div className="pvp-cons-hp-row">
          <span className="pvp-cons-hp-lbl">HP</span>
          <div className="pvp-cons-hp-track">
            {/* before fill (ghost) */}
            <div
              className="pvp-cons-hp-fill-before"
              style={{ width: `${beforePct}%` }}
            />
            {/* after fill (live) */}
            <div
              className="pvp-cons-hp-fill-after"
              style={{
                width: `${hpPct}%`,
                background: healthAfter >= 70 ? "#4ADE80" : healthAfter >= 40 ? "#FBB042" : "#C8102E",
              }}
            />
          </div>
          <span className="pvp-cons-hp-val">
            {healthBefore} → {healthAfter}
          </span>
          {hpLost > 0 ? (
            <span className="pvp-cons-hp-lost">−{hpLost} HP</span>
          ) : (
            <span className="pvp-cons-hp-ok">No damage taken</span>
          )}
        </div>
      </div>

      {/* Injury card */}
      {injuries.length > 0 && (
        <div className="pvp-cons-injury-card">
          <div className="pvp-cons-injury-header">Injuries sustained</div>
          <div className="pvp-cons-injury-list">
            {injuries.map((inj, i) => (
              <span key={i} className="pvp-cons-injury-chip">{inj}</span>
            ))}
          </div>
          <div className="pvp-cons-injury-note">
            These injuries may block career fights. Treat them at the Hospital.
          </div>
        </div>
      )}

      {/* XP gained */}
      {xpEntries.length > 0 && (
        <div className="pvp-cons-xp-row">
          <span className="pvp-cons-xp-lbl">XP gained</span>
          <span className="pvp-cons-xp-vals">
            {xpEntries.map(([stat, val], i) => (
              <span key={stat}>
                {i > 0 && <span className="pvp-cons-xp-sep"> · </span>}
                <span className="pvp-cons-xp-stat">{stat}</span>
                {" "}
                <span className="pvp-cons-xp-amt">+{val}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Stat level-ups */}
      {statLevelUps.length > 0 && (
        <div className="pvp-cons-levelups">
          {statLevelUps.map((stat, i) => (
            <span key={i} className="pvp-cons-levelup-chip">{stat} leveled up!</span>
          ))}
        </div>
      )}

      {/* Defender flavor (secondary, subdued) */}
      {defenderFlavor && (
        <div className="pvp-cons-defender-flavor">{defenderFlavor}</div>
      )}
    </div>
  );
}
