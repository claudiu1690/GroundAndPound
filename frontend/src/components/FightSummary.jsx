import { memo } from "react";

/**
 * Post-fight summary: health/stamina lost, XP gained, notoriety, iron, injuries, comeback, weight miss, etc.
 */
export const FightSummary = memo(function FightSummary({ summary }) {
  if (!summary) return null;

  const {
    outcome,
    recordChange,
    recordAfter,
    healthStart,
    healthEnd,
    healthLost,
    staminaStart,
    staminaEnd,
    staminaLost,
    ironEarned,
    notorietyGained,
    notorietyFrozen,
    xpGained,
    xpMultiplier,
    isComeback,
    weightCut,
    weightMissed,
    injuriesSustained,
    newBadges,
    mentalResetRequired,
    completedQuests,
    promoted,
  } = summary;

  const hasXp = xpGained && typeof xpGained === "object" && Object.keys(xpGained).length > 0;
  const recordLabel = recordChange === "W" ? "Win" : recordChange === "L" ? "Loss" : "Draw";

  return (
    <section className="panel fight-summary">
      <h2 className="panel-title">Fight Summary</h2>
      <div className="panel-body">
        <div className="fight-summary-outcome">
          <span className={`fight-summary-result fight-summary-result-${recordChange?.toLowerCase()}`}>
            {outcome}
          </span>
          <span className="fight-summary-record-change">
            ({recordLabel}) — Record: {recordAfter}
          </span>
        </div>

        {isComeback && (
          <div className="fight-summary-note fight-summary-comeback">
            Comeback fight — ×1.5 XP bonus applied!
          </div>
        )}

        {weightMissed && (
          <div className="fight-summary-note fight-summary-warning">
            ⚠ Missed weight ({weightCut} cut) — purse reduced by 20% and Notoriety penalised.
          </div>
        )}

        {notorietyFrozen && (
          <div className="fight-summary-note fight-summary-warning">
            Notoriety frozen after 3 consecutive losses.
          </div>
        )}

        {mentalResetRequired && (
          <div className="fight-summary-note fight-summary-danger">
            Mental Reset required — complete it in your fighter profile before your next fight.
          </div>
        )}

        {promoted && (
          <div className="fight-summary-note fight-summary-badge" style={{ fontSize: "13px", fontWeight: 800 }}>
            ⬆ PROMOTED: {promoted.from} → {promoted.to}! New competition level unlocked.
          </div>
        )}

        {newBadges?.length > 0 && (
          <div className="fight-summary-note fight-summary-badge">
            Badge earned: {newBadges.join(", ")}
          </div>
        )}

        {injuriesSustained?.length > 0 && (
          <div className="fight-summary-note fight-summary-injury">
            Injuries sustained: <strong>{injuriesSustained.join(", ")}</strong> — check your fighter profile.
          </div>
        )}

        <table className="torn-table fight-summary-table">
          <tbody>
            <tr>
              <td className="torn-td-label">Health</td>
              <td className="torn-td-value">
                {healthEnd} / {healthStart}
                {healthLost > 0 && <span className="fight-summary-delta"> (−{healthLost})</span>}
              </td>
            </tr>
            <tr>
              <td className="torn-td-label">Stamina</td>
              <td className="torn-td-value">
                {staminaEnd} / {staminaStart}
                {staminaLost > 0 && <span className="fight-summary-delta"> (−{staminaLost})</span>}
              </td>
            </tr>
            <tr>
              <td className="torn-td-label">Iron earned</td>
              <td className="torn-td-value">
                +{ironEarned ?? 0}
                {weightMissed && <span className="fight-summary-delta"> (−20% weight miss)</span>}
              </td>
            </tr>
            <tr>
              <td className="torn-td-label">Notoriety</td>
              <td className="torn-td-value">
                {notorietyGained > 0 ? `+${notorietyGained}` : notorietyGained === 0 ? "—" : notorietyGained}
                {notorietyFrozen && <span className="fight-summary-delta"> (frozen)</span>}
              </td>
            </tr>
            {xpMultiplier != null && (
              <tr>
                <td className="torn-td-label">XP multiplier</td>
                <td className="torn-td-value">
                  ×{xpMultiplier}
                  {isComeback && <span className="fight-summary-comeback-tag"> (comeback)</span>}
                </td>
              </tr>
            )}
            {hasXp && (
              <tr>
                <td className="torn-td-label">XP gained</td>
                <td className="torn-td-value">
                  <span className="fight-summary-xp">
                    {Object.entries(xpGained).map(([stat, xp]) => (
                      <span key={stat} className="fight-summary-xp-stat">{stat} +{xp}</span>
                    ))}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {completedQuests?.length > 0 && (
          <div className="fight-summary-quests">
            Quest completed: {completedQuests.join(", ")}!
          </div>
        )}
      </div>
    </section>
  );
});
