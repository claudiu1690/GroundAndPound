import { memo } from "react";
import { tierLabel } from "../../constants/fame";
import { getRatingConfig, MATCH_STATUS_LABELS, MATCH_STATUS_COLORS } from "../../constants/campConfig";
import { ArrowUpCircle, Trophy } from "lucide-react";

/**
 * Post-fight summary: health/stamina lost, XP gained, fame, cash, injuries, comeback, weight miss, etc.
 */
export const FightSummary = memo(function FightSummary({ summary, description }) {
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
    notorietyGained: fameGained,
    notorietyFrozen: fameFrozen,
    xpGained,
    xpMultiplier,
    isComeback,
    weightCut,
    weightCutRoll,
    weightMissed,
    injuriesSustained,
    // newBadges removed — badges still earned/stored; will return as achievements.
    mentalResetRequired,
    completedQuests,
    promoted,
    statLevelUps,
    notorietyBreakdown: fameBreakdown,
    notorietyTierUp: fameTierUp,
    milestoneNotoriety: milestoneFame,
    campBreakdown,
    nemesisCleared,
    nemesisSet,
    nemesisName,
    beltWon,
    opponentName,
    titleShotLost,
    titleTargetTier,
    buff,
    drinksGranted,
    sponsorship,
  } = summary;

  // Energy Drink free-earn notices (post-fight). All guarded with ?? 0 so a
  // missing field on older/cached summaries renders nothing.
  const streakDrinks = drinksGranted?.streak ?? 0;
  const promoDrinks = drinksGranted?.promotion ?? 0;
  const sponsorDrinks = (sponsorship?.events ?? []).reduce((s, e) => s + (e.rewardDrinks ?? 0), 0);
  const drinkLabel = (n) => `${n} Energy Drink${n === 1 ? "" : "s"}`;

  const hasXp = xpGained && typeof xpGained === "object" && Object.keys(xpGained).length > 0;
  const recordLabel = recordChange === "W" ? "Win" : recordChange === "L" ? "Loss" : "Draw";

  // Outcome flavor key used across hero modifier.
  const oc = recordChange === "W" ? "win" : recordChange === "L" ? "loss" : "draw";
  const winText = recordChange === "W" ? "VICTORY" : recordChange === "L" ? "DEFEAT" : "DRAW";

  // Shared fame display (used in hero stat tile + Fight Stats card).
  const fameDisplay = fameGained > 0 ? `+${fameGained}` : fameGained === 0 ? "—" : fameGained;

  const hasDescription = !!description;

  return (
    <section className={`panel fight-summary${beltWon ? " fight-summary--belt" : ""}`} data-tut="result">
      <div className={`result-hero result-hero--${oc}`}>
        {beltWon && (
          <div className="fight-summary-belt-header">
            <Trophy size={18} /> NEW CHAMPION <Trophy size={18} />
          </div>
        )}
        <div className="result-eyebrow">{beltWon ? "Championship Result" : "Last Fight Summary"}</div>

        <div className="result-hero-body">
          <div className="result-hero-left">
            <div className="result-outcome-row">
              <span className={`result-win result-win--${oc}`}>{winText}</span>
              <span className={`result-method-badge result-method--${oc}`}>{outcome}</span>
            </div>
            <div className="result-sub">
              {opponentName ? `vs ${opponentName} · ` : ""}Record now {recordAfter}
            </div>
          </div>

          <div className="result-right">
            <div className="result-stat" data-tut="result-iron">
              <div className="result-stat-val result-stat-val--green">+{ironEarned ?? 0}</div>
              <div className="result-stat-label">Cash Earned</div>
            </div>
            <div className="result-stat" data-tut="result-fame">
              <div className="result-stat-val result-stat-val--gold">{fameDisplay}</div>
              <div className="result-stat-label">Fame</div>
            </div>
            <div className="result-stat">
              <div className="result-stat-val result-stat-val--blue">×{xpMultiplier ?? 1}</div>
              <div className="result-stat-label">XP Mult</div>
            </div>
          </div>
        </div>
      </div>

      <div className="notices">
        {isComeback && (
          <div className="notice notice--good">
            <span className="notice-glyph">⚡</span>
            <span>Comeback fight — ×1.5 XP bonus applied!</span>
          </div>
        )}

        {weightCut && weightCut !== "easy" && (
          <div className={`notice notice--${!weightMissed && weightCutRoll >= 0 ? "good" : weightMissed ? "danger" : "warn"}`}>
            <span className="notice-glyph">⚖</span>
            <span>
              Weight cut ({weightCut}): {weightCutRoll > 0 ? "+" + weightCutRoll : weightCutRoll} stamina
              {weightMissed
                ? " — missed weight! Purse reduced by 20% and Fame penalised."
                : weightCutRoll >= 0 ? " — cut went well" : " — cut went badly"}
            </span>
          </div>
        )}

        {fameFrozen && (
          <div className="notice notice--warn">
            <span className="notice-glyph">❄</span>
            <span>Fame frozen after 3 consecutive losses.</span>
          </div>
        )}

        {mentalResetRequired && (
          <div className="notice notice--danger">
            <span className="notice-glyph">🧠</span>
            <span>Mental Reset required — complete it in your fighter profile before your next fight.</span>
          </div>
        )}

        {titleShotLost && (
          <div className="notice notice--warn">
            <span className="notice-glyph">🔒</span>
            <span>
              {titleTargetTier === "Regional Pro"
                ? "Came up short. Win 2 fights to get another crack at turning pro. (0/2)"
                : <>Title shot lost. Win 2 fights to earn a rematch with <strong>{opponentName || "the champion"}</strong>. (0/2)</>}
            </span>
          </div>
        )}

        {nemesisCleared && (
          <div className="notice notice--good">
            <span className="notice-glyph">★</span>
            <span>Nemesis defeated — you&apos;ve settled the score with <strong>{nemesisName}</strong>! (+{150} Notoriety)</span>
          </div>
        )}

        {nemesisSet && (
          <div className="notice notice--danger">
            <span className="notice-glyph">☠</span>
            <span><strong>{nemesisName}</strong> is now your Nemesis — the rematch will be available in fight offers.</span>
          </div>
        )}

        {fameTierUp && (
          <div className="notice notice--good">
            <span className="notice-glyph">⭐</span>
            <span>Fame tier: {tierLabel(fameTierUp.from)} → <strong>{tierLabel(fameTierUp.to)}</strong></span>
          </div>
        )}

        {promoted && (
          <div className="notice notice--good">
            <span className="notice-glyph">⬆</span>
            <span>PROMOTED: {promoted.from} → {promoted.to}! New competition level unlocked.</span>
          </div>
        )}

        {streakDrinks > 0 && (
          <div className="notice notice--good">
            <span className="notice-glyph">⚡</span>
            <span>Win-streak reward: +{drinkLabel(streakDrinks)}</span>
          </div>
        )}

        {promoDrinks > 0 && (
          <div className="notice notice--good">
            <span className="notice-glyph">⚡</span>
            <span>Promotion reward: +{drinkLabel(promoDrinks)}</span>
          </div>
        )}

        {sponsorDrinks > 0 && (
          <div className="notice notice--good">
            <span className="notice-glyph">⚡</span>
            <span>Sponsor bonus: +{drinkLabel(sponsorDrinks)}</span>
          </div>
        )}

        {/* Badge earned notice removed — badges still earned/stored; will return as achievements. */}

        {injuriesSustained?.length > 0 && (
          <div className="notice notice--danger">
            <span className="notice-glyph">🩹</span>
            <span>Injuries sustained: <strong>{injuriesSustained.join(", ")}</strong> — check your fighter profile.</span>
          </div>
        )}

        {completedQuests?.length > 0 && (
          <div className="notice notice--good">
            <span className="notice-glyph">✓</span>
            <span>Quest completed: {completedQuests.join(", ")}!</span>
          </div>
        )}
      </div>

      <div className={`body-grid${hasDescription ? "" : " body-grid--single"}`}>
        <div className="fs-left-col">
          <div className="card">
            <div className="card-label">Fight Stats</div>
            <div className="stat-summary-row">
              <span className="stat-summary-label">Health</span>
              <span className="stat-summary-val">
                {healthEnd} / {healthStart}
                {healthLost > 0 && <span className="stat-summary-loss"> −{healthLost}</span>}
              </span>
            </div>
            <div className="stat-summary-row">
              <span className="stat-summary-label">Stamina</span>
              <span className="stat-summary-val">
                {staminaEnd} / {staminaStart}
                {staminaLost > 0 && <span className="stat-summary-loss"> −{staminaLost}</span>}
              </span>
            </div>
            <div className="stat-summary-row">
              <span className="stat-summary-label">Cash Earned</span>
              <span className="stat-summary-val stat-summary-val--green">
                +{ironEarned ?? 0}
                {weightMissed && <span className="stat-summary-note"> (−20% weight miss)</span>}
              </span>
            </div>
            <div className="stat-summary-row">
              <span className="stat-summary-label">Fame</span>
              <span className="stat-summary-val stat-summary-val--gold">
                {fameDisplay}
                {fameFrozen && <span className="stat-summary-note"> (frozen)</span>}
                {milestoneFame?.bonus > 0 && (
                  <span className="stat-summary-note"> +{milestoneFame.bonus} milestone</span>
                )}
                {Array.isArray(fameBreakdown) && fameBreakdown.length > 1 && (
                  <ul className="fight-summary-fame-lines">
                    {fameBreakdown.map((line, i) => (
                      <li key={i}>
                        {line.note}: {line.amount > 0 ? `+${line.amount}` : line.amount}
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            </div>
            {statLevelUps?.length > 0 && (
              <div className="stat-summary-row">
                <span className="stat-summary-label">Stat levels up</span>
                <span className="stat-summary-val stat-summary-val--blue">
                  {statLevelUps.join(", ")}
                </span>
              </div>
            )}
          </div>

          {(hasXp || statLevelUps?.length > 0) && (
            <div className="card">
              <div className="card-label">XP Gained</div>
              {hasXp && (
                <div className="xp-grid">
                  {Object.entries(xpGained).map(([stat, xp]) => (
                    <span key={stat} className="xp-tag">{stat} +{xp}</span>
                  ))}
                </div>
              )}
              {statLevelUps?.length > 0 && (
                <div className="xp-levelup-line">
                  <ArrowUpCircle size={12} /> Levelled up:
                  {statLevelUps.map((s) => (
                    <span key={s} className="levelup-tag">{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {campBreakdown && (
            <div className="card">
              <div className="card-label">
                Camp Breakdown
                {campBreakdown.rating && (
                  <span
                    className="camp-grade"
                    style={{ color: getRatingConfig(campBreakdown.rating).color }}
                  >
                    {campBreakdown.rating}
                  </span>
                )}
              </div>
              {campBreakdown.sessions?.length > 0 && campBreakdown.sessions.map((s, i) => {
                const statusColor = MATCH_STATUS_COLORS[s.matchStatus] ?? "#94a3b8";
                return (
                  <div key={i} className="camp-row">
                    <span className="camp-name">{s.label}</span>
                    <span className="camp-matched" style={{ color: statusColor }}>
                      {MATCH_STATUS_LABELS[s.matchStatus] ?? s.matchStatus}
                    </span>
                    <span className={s.triggered ? "camp-triggered" : "camp-not"}>
                      {s.triggered ? `Triggered ×${s.triggerCount}` : "Not Triggered"}
                    </span>
                    {s.triggered && s.description && (
                      <span className="camp-effect">{s.description}</span>
                    )}
                  </div>
                );
              })}
              {buff && (
                <div className="camp-row camp-row--buff">
                  <span className="camp-name">Supplement: {buff.label}</span>
                  <span className="camp-matched" style={{ color: "var(--gold-bright)" }}>
                    {buff.injuryMult != null ? "Recovery" : "Buff"}
                  </span>
                  <span className={buff.applied ? "camp-triggered" : "camp-not"}>
                    {buff.injuryMult != null
                      ? (buff.applied ? "Reduced injury severity" : "No injury sustained")
                      : (buff.applied ? "Applied" : "Not applied")}
                  </span>
                </div>
              )}
              {campBreakdown.wildcard && (
                <div className="wildcard-row">
                  <span className="wildcard-label">Wildcard</span>
                  <span className={`wildcard-text ${campBreakdown.wildcard.wasCountered ? "wildcard-text--countered" : "wildcard-text--uncountered"}`}>
                    {campBreakdown.wildcard.wasCountered
                      ? `Opponent ${campBreakdown.wildcard.description} — your camp work countered it!`
                      : `Opponent ${campBreakdown.wildcard.description} — you had no answer for this.`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {description}
      </div>
    </section>
  );
});
