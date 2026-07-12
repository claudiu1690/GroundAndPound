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

  // Outcome flavor key used across hero modifier.
  const oc = recordChange === "W" ? "win" : recordChange === "L" ? "loss" : "draw";
  const winText = recordChange === "W" ? "VICTORY" : recordChange === "L" ? "DEFEAT" : "DRAW";

  // Shared fame display (used in hero stat tile).
  const fameDisplay = fameGained > 0 ? `+${fameGained}` : fameGained === 0 ? "—" : fameGained;

  const hasDescription = !!description;

  // ── Notice ticker ─────────────────────────────────────────────
  // Every post-fight notice as a compact {kind, glyph, text} chip; same
  // conditions and copy as the old full-width banner stack.
  const notices = [];
  if (isComeback) notices.push({ kind: "good", glyph: "⚡", text: t("fights.summary.noticeComeback") });
  if (weightCut && weightCut !== "easy") {
    notices.push({
      kind: !weightMissed && weightCutRoll >= 0 ? "good" : weightMissed ? "danger" : "warn",
      glyph: "⚖",
      text: weightMissed
        ? t("fights.summary.noticeWeightMissed", { type: weightCut, roll: weightCutRoll > 0 ? "+" + weightCutRoll : weightCutRoll })
        : weightCutRoll >= 0
          ? t("fights.summary.noticeWeightCutGood", { type: weightCut, roll: weightCutRoll > 0 ? "+" + weightCutRoll : weightCutRoll })
          : t("fights.summary.noticeWeightCutBad", { type: weightCut, roll: weightCutRoll }),
    });
  }
  if (fameFrozen) notices.push({ kind: "warn", glyph: "❄", text: t("fights.summary.noticeFameFrozen") });
  if (mentalResetRequired) notices.push({ kind: "danger", glyph: "🧠", text: t("fights.summary.noticeMentalReset") });
  if (titleShotLost) {
    notices.push({
      kind: "warn",
      glyph: "🔒",
      text: titleTargetTier === "Regional Pro"
        ? t("fights.summary.noticeTitleShotLostPro")
        : t("fights.summary.noticeTitleShotLostBelt", { champ: opponentName || "the champion" }),
    });
  }
  if (nemesisCleared) notices.push({ kind: "good", glyph: "★", text: t("fights.summary.noticeNemesisCleared", { name: nemesisName, bonus: 150 }) });
  if (nemesisSet) notices.push({ kind: "danger", glyph: "☠", text: t("fights.summary.noticeNemesisSet", { name: nemesisName }) });
  if (fameTierUp) notices.push({ kind: "good", glyph: "⭐", text: t("fights.summary.noticeFameTierUp", { from: tierLabel(fameTierUp.from), to: tierLabel(fameTierUp.to) }) });
  if (promoted) notices.push({ kind: "good", glyph: "⬆", text: t("fights.summary.noticePromoted", { from: promoted.from, to: promoted.to }) });
  if (streakDrinks > 0) notices.push({ kind: "good", glyph: "⚡", text: t("fights.summary.noticeStreakDrinks", { label: drinkLabel(streakDrinks) }) });
  if (promoDrinks > 0) notices.push({ kind: "good", glyph: "⚡", text: t("fights.summary.noticePromoDrinks", { label: drinkLabel(promoDrinks) }) });
  if (sponsorDrinks > 0) notices.push({ kind: "good", glyph: "⚡", text: t("fights.summary.noticeSponsorDrinks", { label: drinkLabel(sponsorDrinks) }) });
  // Badge earned notice removed — badges still earned/stored; will return as achievements.
  if (milestoneFame?.bonus > 0) notices.push({ kind: "good", glyph: "◆", text: t("fights.summary.statFame") + " " + t("fights.summary.statMilestone", { n: milestoneFame.bonus }) });
  if (weightMissed) notices.push({ kind: "danger", glyph: "⚖", text: t("fights.summary.statCash") + " " + t("fights.summary.statWeightMiss") });
  if (injuriesSustained?.length > 0) notices.push({ kind: "danger", glyph: "🩹", text: t("fights.summary.noticeInjuries", { list: injuriesSustained.join(", ") }) });
  if (completedQuests?.length > 0) notices.push({ kind: "good", glyph: "✓", text: t("fights.summary.noticeQuestCompleted", { list: completedQuests.join(", ") }) });

  const subVerb = oc === "win"
    ? t("fights.summary.subWin", { name: opponentName || "" })
    : oc === "loss"
      ? t("fights.summary.subLoss", { name: opponentName || "" })
      : t("fights.summary.subDraw", { name: opponentName || "" });

  return (
    <section className={`panel fight-summary${beltWon ? " fight-summary--belt" : ""}`} data-tut="result">
      <div className={`fs2-hero fs2-hero--${oc}`}>
        {beltWon && (
          <div className="fight-summary-belt-header">
            <Trophy size={18} /> {t("fights.summary.newChampion")} <Trophy size={18} />
          </div>
        )}
        <div className="fs2-eyebrow">{beltWon ? t("fights.summary.panelTitleBelt") : t("fights.summary.panelTitle")}</div>

        <div className="fs2-hrow">
          <div className="fs2-left">
            <div className="fs2-outcome">{winText}</div>
            <span className="fs2-method">{outcome}</span>
            <div className="fs2-sub">
              {opponentName ? <>{subVerb} · </> : null}{t("fights.summary.recordNow", { record: recordAfter })}
            </div>
          </div>

          <div className="fs2-tiles">
            <div className="fs2-tile fs2-tile--green" data-tut="result-iron">
              <div className="fs2-tile-val">+{ironEarned ?? 0}</div>
              <div className="fs2-tile-lbl">{t("fights.summary.cashEarned")}</div>
            </div>
            <div className="fs2-tile fs2-tile--gold" data-tut="result-fame">
              <div className="fs2-tile-val">{fameDisplay}</div>
              <div className="fs2-tile-lbl">{t("fights.summary.fameLabel")}</div>
            </div>
            <div className="fs2-tile fs2-tile--blue">
              <div className="fs2-tile-val">×{xpMultiplier ?? 1}</div>
              <div className="fs2-tile-lbl">{t("fights.summary.xpMultLabel")}</div>
            </div>
          </div>
        </div>
      </div>

      {notices.length > 0 && (
        <div className="fs2-ticker">
          {notices.map((n, i) => (
            <span className={`fs2-tick fs2-tick--${n.kind}`} key={i}>
              <span className="fs2-tick-dot" />
              <span className="fs2-tick-glyph">{n.glyph}</span>
              <span>{n.text}</span>
            </span>
          ))}
        </div>
      )}

      <div className={`body-grid${hasDescription ? "" : " body-grid--single"}`}>
        <div className="fs-left-col">
          <div className="card">
            <div className="card-label">{t("fights.summary.cardFightToll")}</div>
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
            {Array.isArray(fameBreakdown) && fameBreakdown.length > 1 && (
              <div className="stat-summary-row">
                <span className="stat-summary-label">{t("fights.summary.statFame")}</span>
                <span className="stat-summary-val stat-summary-val--gold">
                  {fameDisplay}
                  {fameFrozen && <span className="stat-summary-note"> {t("fights.summary.statFrozen")}</span>}
                  <ul className="fight-summary-fame-lines">
                    {fameBreakdown.map((line, i) => (
                      <li key={i}>
                        {line.note}: {line.amount > 0 ? `+${line.amount}` : line.amount}
                      </li>
                    ))}
                  </ul>
                </span>
              </div>
            )}
            {(hasXp || statLevelUps?.length > 0) && (
              <>
                <div className="card-label fs2-card-label--sub">{t("fights.summary.cardXpGained")}</div>
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
              </>
            )}
          </div>

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
