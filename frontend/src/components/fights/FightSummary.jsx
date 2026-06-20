import { memo } from "react";
import { tierLabel } from "../../constants/fame";
import { getRatingConfig, MATCH_STATUS_LABELS, MATCH_STATUS_COLORS } from "../../constants/campConfig";
import { ArrowUpCircle, Trophy } from "lucide-react";
import { t } from "@/lib/i18n";

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
            <Trophy size={18} /> {t("fights.summary.newChampion")} <Trophy size={18} />
          </div>
        )}
        <div className="result-eyebrow">{beltWon ? t("fights.summary.panelTitleBelt") : t("fights.summary.panelTitle")}</div>

        <div className="result-hero-body">
          <div className="result-hero-left">
            <div className="result-outcome-row">
              <span className={`result-win result-win--${oc}`}>{winText}</span>
              <span className={`result-method-badge result-method--${oc}`}>{outcome}</span>
            </div>
            <div className="result-sub">
              {opponentName ? t("fights.summary.recordVs", { name: opponentName }) : ""}{t("fights.summary.recordNow", { record: recordAfter })}
            </div>
          </div>

          <div className="result-right">
            <div className="result-stat" data-tut="result-iron">
              <div className="result-stat-val result-stat-val--green">+{ironEarned ?? 0}</div>
              <div className="result-stat-label">{t("fights.summary.cashEarned")}</div>
            </div>
            <div className="result-stat" data-tut="result-fame">
              <div className="result-stat-val result-stat-val--gold">{fameDisplay}</div>
              <div className="result-stat-label">{t("fights.summary.fameLabel")}</div>
            </div>
            <div className="result-stat">
              <div className="result-stat-val result-stat-val--blue">×{xpMultiplier ?? 1}</div>
              <div className="result-stat-label">{t("fights.summary.xpMultLabel")}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="notices">
        {isComeback && (
          <div className="notice notice--good">
            <span className="notice-glyph">⚡</span>
            <span>{t("fights.summary.noticeComeback")}</span>
          </div>
        )}

        {weightCut && weightCut !== "easy" && (
          <div className={`notice notice--${!weightMissed && weightCutRoll >= 0 ? "good" : weightMissed ? "danger" : "warn"}`}>
            <span className="notice-glyph">⚖</span>
            <span>
              {weightMissed
                ? t("fights.summary.noticeWeightMissed", { type: weightCut, roll: weightCutRoll > 0 ? "+" + weightCutRoll : weightCutRoll })
                : weightCutRoll >= 0
                  ? t("fights.summary.noticeWeightCutGood", { type: weightCut, roll: weightCutRoll > 0 ? "+" + weightCutRoll : weightCutRoll })
                  : t("fights.summary.noticeWeightCutBad", { type: weightCut, roll: weightCutRoll })}
            </span>
          </div>
        )}

        {fameFrozen && (
          <div className="notice notice--warn">
            <span className="notice-glyph">❄</span>
            <span>{t("fights.summary.noticeFameFrozen")}</span>
          </div>
        )}

        {mentalResetRequired && (
          <div className="notice notice--danger">
            <span className="notice-glyph">🧠</span>
            <span>{t("fights.summary.noticeMentalReset")}</span>
          </div>
        )}

        {titleShotLost && (
          <div className="notice notice--warn">
            <span className="notice-glyph">🔒</span>
            <span>
              {titleTargetTier === "Regional Pro"
                ? t("fights.summary.noticeTitleShotLostPro")
                : t("fights.summary.noticeTitleShotLostBelt", { champ: opponentName || "the champion" })}
            </span>
          </div>
        )}

        {nemesisCleared && (
          <div className="notice notice--good">
            <span className="notice-glyph">★</span>
            <span>{t("fights.summary.noticeNemesisCleared", { name: nemesisName, bonus: 150 })}</span>
          </div>
        )}

        {nemesisSet && (
          <div className="notice notice--danger">
            <span className="notice-glyph">☠</span>
            <span>{t("fights.summary.noticeNemesisSet", { name: nemesisName })}</span>
          </div>
        )}

        {fameTierUp && (
          <div className="notice notice--good">
            <span className="notice-glyph">⭐</span>
            <span>{t("fights.summary.noticeFameTierUp", { from: tierLabel(fameTierUp.from), to: tierLabel(fameTierUp.to) })}</span>
          </div>
        )}

        {promoted && (
          <div className="notice notice--good">
            <span className="notice-glyph">⬆</span>
            <span>{t("fights.summary.noticePromoted", { from: promoted.from, to: promoted.to })}</span>
          </div>
        )}

        {streakDrinks > 0 && (
          <div className="notice notice--good">
            <span className="notice-glyph">⚡</span>
            <span>{t("fights.summary.noticeStreakDrinks", { label: drinkLabel(streakDrinks) })}</span>
          </div>
        )}

        {promoDrinks > 0 && (
          <div className="notice notice--good">
            <span className="notice-glyph">⚡</span>
            <span>{t("fights.summary.noticePromoDrinks", { label: drinkLabel(promoDrinks) })}</span>
          </div>
        )}

        {sponsorDrinks > 0 && (
          <div className="notice notice--good">
            <span className="notice-glyph">⚡</span>
            <span>{t("fights.summary.noticeSponsorDrinks", { label: drinkLabel(sponsorDrinks) })}</span>
          </div>
        )}

        {/* Badge earned notice removed — badges still earned/stored; will return as achievements. */}

        {injuriesSustained?.length > 0 && (
          <div className="notice notice--danger">
            <span className="notice-glyph">🩹</span>
            <span>{t("fights.summary.noticeInjuries", { list: injuriesSustained.join(", ") })}</span>
          </div>
        )}

        {completedQuests?.length > 0 && (
          <div className="notice notice--good">
            <span className="notice-glyph">✓</span>
            <span>{t("fights.summary.noticeQuestCompleted", { list: completedQuests.join(", ") })}</span>
          </div>
        )}
      </div>

      <div className={`body-grid${hasDescription ? "" : " body-grid--single"}`}>
        <div className="fs-left-col">
          <div className="card">
            <div className="card-label">{t("fights.summary.cardFightStats")}</div>
            <div className="stat-summary-row">
              <span className="stat-summary-label">{t("fights.summary.statHealth")}</span>
              <span className="stat-summary-val">
                {healthEnd} / {healthStart}
                {healthLost > 0 && <span className="stat-summary-loss"> −{healthLost}</span>}
              </span>
            </div>
            <div className="stat-summary-row">
              <span className="stat-summary-label">{t("fights.summary.statStamina")}</span>
              <span className="stat-summary-val">
                {staminaEnd} / {staminaStart}
                {staminaLost > 0 && <span className="stat-summary-loss"> −{staminaLost}</span>}
              </span>
            </div>
            <div className="stat-summary-row">
              <span className="stat-summary-label">{t("fights.summary.statCash")}</span>
              <span className="stat-summary-val stat-summary-val--green">
                +{ironEarned ?? 0}
                {weightMissed && <span className="stat-summary-note"> {t("fights.summary.statWeightMiss")}</span>}
              </span>
            </div>
            <div className="stat-summary-row">
              <span className="stat-summary-label">{t("fights.summary.statFame")}</span>
              <span className="stat-summary-val stat-summary-val--gold">
                {fameDisplay}
                {fameFrozen && <span className="stat-summary-note"> {t("fights.summary.statFrozen")}</span>}
                {milestoneFame?.bonus > 0 && (
                  <span className="stat-summary-note"> {t("fights.summary.statMilestone", { n: milestoneFame.bonus })}</span>
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
                <span className="stat-summary-label">{t("fights.summary.statLevelUps")}</span>
                <span className="stat-summary-val stat-summary-val--blue">
                  {statLevelUps.join(", ")}
                </span>
              </div>
            )}
          </div>

          {(hasXp || statLevelUps?.length > 0) && (
            <div className="card">
              <div className="card-label">{t("fights.summary.cardXpGained")}</div>
              {hasXp && (
                <div className="xp-grid">
                  {Object.entries(xpGained).map(([stat, xp]) => (
                    <span key={stat} className="xp-tag">{stat} +{xp}</span>
                  ))}
                </div>
              )}
              {statLevelUps?.length > 0 && (
                <div className="xp-levelup-line">
                  <ArrowUpCircle size={12} /> {t("fights.summary.levelledUp")}
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
                {t("fights.summary.cardCampBreakdown")}
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
                      {s.triggered ? t("fights.summary.campTriggered", { n: s.triggerCount }) : t("fights.summary.campNotTriggered")}
                    </span>
                    {s.triggered && s.description && (
                      <span className="camp-effect">{s.description}</span>
                    )}
                  </div>
                );
              })}
              {buff && (
                <div className="camp-row camp-row--buff">
                  <span className="camp-name">{t("fights.summary.campSupplementLabel", { name: buff.label })}</span>
                  <span className="camp-matched" style={{ color: "var(--gold-bright)" }}>
                    {buff.injuryMult != null ? t("fights.summary.campRecoveryType") : t("fights.summary.campBuffType")}
                  </span>
                  <span className={buff.applied ? "camp-triggered" : "camp-not"}>
                    {buff.injuryMult != null
                      ? (buff.applied ? t("fights.summary.campRecoveryApplied") : t("fights.summary.campRecoveryNotApplied"))
                      : (buff.applied ? t("fights.summary.campBuffApplied") : t("fights.summary.campBuffNotApplied"))}
                  </span>
                </div>
              )}
              {campBreakdown.wildcard && (
                <div className="wildcard-row">
                  <span className="wildcard-label">{t("fights.summary.campWildcardLabel")}</span>
                  <span className={`wildcard-text ${campBreakdown.wildcard.wasCountered ? "wildcard-text--countered" : "wildcard-text--uncountered"}`}>
                    {campBreakdown.wildcard.wasCountered
                      ? t("fights.summary.campWildcardCountered", { desc: campBreakdown.wildcard.description })
                      : t("fights.summary.campWildcardUncountered", { desc: campBreakdown.wildcard.description })}
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
