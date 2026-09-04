import { useState, useEffect, useRef } from "react";
import { Zap, Lock } from "lucide-react";
import { usePvpSeason } from "../../hooks/usePvpSeason";
import { OPEN_LABEL } from "./pvpConst";
import { t } from "../../lib/i18n";
import { usePvpDefenseResults } from "../../hooks/usePvpDefenseResults";
import { LadderTab } from "./tabs/LadderTab";
import { FightTab } from "./tabs/FightTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { SeasonRewardsTab } from "./tabs/SeasonRewardsTab";
import { HallOfFameTab } from "./tabs/HallOfFameTab";
import { DefenseResults } from "./DefenseResults";
import { SeasonPosterModal } from "./SeasonPosterModal";
import { ReadOnlyProfile } from "./ReadOnlyProfile";
import { OfflineDefenseBanner } from "./OfflineDefenseBanner";
import { PreSeasonCountdown } from "./PreSeasonCountdown";
import { api } from "../../api";

function buildTabs() {
  return [
    { id: "ladder",  label: t("pvp.hub.tabLadder") },
    { id: "fight",   label: t("pvp.hub.tabFight") },
    { id: "history", label: t("pvp.hub.tabHistory") },
    { id: "rewards", label: t("pvp.hub.tabRewards") },
    { id: "hof",     label: t("pvp.hub.tabHof") },
  ];
}

/**
 * PvpHub — top container for the Proving Ground PVP system.
 * Calls GET /pvp/season/current/:weightClass for season + own record.
 * New fields consumed from that response: `justEnded` (boolean) and
 * `lastSeasonRecord` — present when justEnded, else null.
 *
 * Modal flow: a single SeasonPosterModal ("Fight Poster") shows the ended
 * season's results and the new season's launch in one presentational
 * component. Any of its three close paths (backdrop/Escape/close button,
 * "View Final Ladder", "Enter the Ladder") calls POST
 * /pvp/acknowledge-season exactly once (see `fireAck`) so the poster
 * doesn't reappear on subsequent visits this session.
 */
export function PvpHub({ fighter, onNavigate, onRefreshFighter, onOpenCareerFight }) {
  const weightClass = fighter?.weightClass ?? "featherweight";
  const fighterId = fighter?._id;

  const { data: seasonData, loading, error, silentRefetch } = usePvpSeason(weightClass);
  const { data: defData } = usePvpDefenseResults();

  const [activeTab, setActiveTab] = useState("ladder");
  const [showDefense, setShowDefense] = useState(false);
  const [seasonEndDismissed, setSeasonEndDismissed] = useState(false);
  const [ackDone, setAckDone] = useState(false);
  // Guards the three close paths (backdrop/Escape/close, view ladder, enter
  // ladder) so a race between them produces exactly one acknowledge POST.
  const ackFired = useRef(false);
  // Optimistic hide: banner disappears instantly on click before the refetch lands
  const [defenseAcked, setDefenseAcked] = useState(false);

  // Profile view-swap state
  const [viewingProfileId, setViewingProfileId] = useState(null);

  // Pre-selected defender for FightTab (set when user challenges from a profile)
  const [preSelectedDefenderId, setPreSelectedDefenderId] = useState(null);

  const season = seasonData?.season ?? null;
  const yourRecord = seasonData?.yourRecord ?? null;
  const poolCount = seasonData?.poolCount ?? 0;
  const justEnded = seasonData?.justEnded ?? false;
  const lastSeasonRecord = seasonData?.lastSeasonRecord ?? null;
  const onboarding = seasonData?.onboarding ?? null;

  // Derived during render, NOT set from an effect. An effect would paint the
  // hub once with the data and only mount the poster on the next commit, which
  // showed a one-frame flash of the hero banner before the poster covered it.
  const showSeasonEnd = justEnded && !!lastSeasonRecord && !ackDone && !seasonEndDismissed;

  const unreadDefense = defData?.unreadCount ?? 0;
  const energyCur = fighter?.energy?.current ?? 0;

  async function handleSeasonEndClose() {
    setSeasonEndDismissed(true);
    await fireAck();
  }

  async function handleEnterLadder() {
    setSeasonEndDismissed(true);
    setActiveTab("ladder");
    await fireAck();
  }

  async function fireAck() {
    if (ackFired.current) return; // three close paths, exactly one POST
    ackFired.current = true;
    setAckDone(true);
    if (lastSeasonRecord?.seasonId) {
      try {
        await api.pvpAcknowledgeSeason(lastSeasonRecord.seasonId);
      } catch {
        // Non-fatal — swallowed. The modal already closed and ackDone
        // prevents re-open this session; it reappears next page load.
      }
    }
  }

  function handleFightResolved() {
    silentRefetch();
    // Refresh the global fighter so the energy bar reflects the 15-energy PVP cost
    // immediately, instead of waiting for the next 60s energy poll.
    if (onRefreshFighter && fighter?._id) onRefreshFighter(fighter._id, { clearMessage: false });
  }

  /**
   * Called from the OfflineDefenseBanner "View defense report →" button.
   * This is the ONLY path that acks (marks defense results as read).
   * Optimistically hides the banner, acks via the API, then refreshes the
   * fighter so the unread dot clears app-wide on the next render.
   * If reportFightId is available, navigates to the Career feed with the
   * fight drawer auto-opened.
   */
  async function handleViewDefenseReport() {
    const d = fighter?.pvpDefense;
    setDefenseAcked(true);                              // optimistic hide
    try { await api.pvpDefenseResults(true); } catch {} // ACK — the ONLY ack path
    if (onRefreshFighter && fighter?._id) onRefreshFighter(fighter._id, { clearMessage: false }); // clears dot app-wide on next render
    if (onOpenCareerFight && d?.reportFightId) onOpenCareerFight(d.reportFightId, d.reportFightKind || "pvp");
  }

  /**
   * Called from ReadOnlyProfile's Challenge button.
   * Closes the profile, switches to Fight tab, and pre-selects the defender.
   * FightTab currently manages its own `selected` state via setSelected —
   * we pass the pre-selected ID via the preSelectedDefenderId prop.
   * Limitation: FightTab will show the opponents list with the pre-selected
   * candidate highlighted only if the backend includes that fighter in the
   * matchmaking pool. If the fighter isn't in the pool, FightTab will show
   * normally with the pre-selection ignored (graceful degradation).
   */
  function handleChallengeFromProfile(defenderId) {
    setViewingProfileId(null);
    setPreSelectedDefenderId(defenderId);
    setActiveTab("fight");
  }

  const seasonLabel = season
    ? `Season ${season.seasonNumber}${season.name ? ` — ${season.name}` : ""}`
    : "—";

  const weeksLeft = season?.endDate
    ? Math.max(0, Math.ceil((new Date(season.endDate) - Date.now()) / (7 * 86400000)))
    : null;

  function daysFromNow(isoDate) {
    if (!isoDate) return 0;
    return Math.max(0, Math.ceil((new Date(isoDate) - Date.now()) / 86400000));
  }

  const catchUpDaysLeft = daysFromNow(onboarding?.catchUp?.expiresAt);

  if (loading && !seasonData) {
    return (
      <div className="pvp-hub-loading">
        <div className="pvp-loading">{t("pvp.hub.loading")}</div>
      </div>
    );
  }

  if (error && !seasonData) {
    return (
      <div className="pvp-hub-error">
        <div className="pvp-error-note">{error}</div>
        <button className="pvp-refresh-btn" onClick={silentRefetch}>{t("common.retry")}</button>
      </div>
    );
  }

  // Locked screen
  if (onboarding?.locked) {
    const careerWins = onboarding.careerWins ?? 0;
    const winsNeeded = onboarding.winsNeeded ?? 3;
    const pct = Math.min(100, Math.max(0, (careerWins / winsNeeded) * 100));

    return (
      <div className="pvp-hub">
        <div className="pvp-locked-screen">
          <div className="pvp-locked-icon">
            <Lock size={32} strokeWidth={1.5} style={{ color: "#555" }} />
          </div>
          <div className="pvp-locked-title">{t("pvp.locked.title")}</div>
          <div className="pvp-locked-copy">
            {t("pvp.locked.copy")}
          </div>
          <div className="pvp-locked-progress">
            <div className="pvp-locked-prog-track">
              <div
                className="pvp-locked-prog-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="pvp-locked-prog-label">{t("pvp.locked.progressLabel", { wins: careerWins, needed: winsNeeded })}</div>
          </div>
        </div>
      </div>
    );
  }

  // Pre-season countdown — shown when the resolved season hasn't started yet.
  // Locked gate above has top priority: a locked player never reaches this branch.
  if (season?.status === "upcoming") {
    return <PreSeasonCountdown season={season} fighter={fighter} onElapsed={silentRefetch} />;
  }

  return (
    <div className="pvp-hub">
      {/* Season Poster Modal — single "Fight Poster" for the season rollover */}
      {showSeasonEnd && lastSeasonRecord && (
        <SeasonPosterModal
          key={lastSeasonRecord.seasonId}
          lastSeasonRecord={lastSeasonRecord}
          season={season}
          onEnterLadder={handleEnterLadder}
          onClose={handleSeasonEndClose}
        />
      )}

      {/* Defense results overlay */}
      {showDefense && (
        <DefenseResults
          myRecord={yourRecord}
          fighter={fighter}
          onBack={() => setShowDefense(false)}
          onGameplanChanged={() => silentRefetch()}
        />
      )}

      {/* Read-only profile view-swap — shown when viewingProfileId is set */}
      {viewingProfileId && !showDefense && !showSeasonEnd && (
        <ReadOnlyProfile
          fighterId={viewingProfileId}
          viewerFighter={fighter}
          season={season}
          onBack={() => setViewingProfileId(null)}
          onChallenge={handleChallengeFromProfile}
        />
      )}

      {/* Main hub — hidden while any overlay or profile view is open */}
      {!viewingProfileId && !showDefense && !showSeasonEnd && (
        <>
          {/* Hero */}
          <div
            className="pvp-hero"
            style={{ backgroundImage: "url(/pvp/octagon.webp)" }}
          >
            <div className="pvp-hero-overlay" aria-hidden="true" />
            <div className="pvp-inner">
              <div>
                <div className="pvp-eye">{t("pvp.hub.eyebrow")}</div>
                <div className="pvp-title">{t("pvp.hub.title")}</div>
                <div className="pvp-meta">
                  {season && (
                    <span className="pvp-s-badge">{seasonLabel}</span>
                  )}
                  {weeksLeft !== null && (
                    <span style={{ fontSize: 12, color: "#AAAAAA" }}>
                      {weeksLeft !== 1
                        ? t("pvp.hub.weeksRemainingPlural", { n: weeksLeft })
                        : t("pvp.hub.weeksRemaining", { n: weeksLeft })}
                    </span>
                  )}
                  {season?.crossWeightClass && (
                    <span className="pvp-open-pill">
                      {OPEN_LABEL}
                    </span>
                  )}
                  {season?.twistName && season.twistName !== "Iron Circuit" && (
                    <span className="pvp-twist-pill">
                      {season.twistName}
                    </span>
                  )}
                  {onboarding?.placement?.active && (
                    <span className="pvp-placement-pill">
                      {t("pvp.hub.placementPill", { done: onboarding.placement.fights ?? 0 })}
                    </span>
                  )}
                </div>
                {onboarding?.catchUp?.active && (
                  <div className="pvp-catchup-pill">
                    {t("pvp.hub.catchupPill", { days: catchUpDaysLeft })}
                  </div>
                )}
              </div>
              <div className="pvp-statbar">
                <div className="pvp-sb-cell">
                  <div className="pvp-sb-v pvp-sb-v-g">{yourRecord?.wins ?? 0}</div>
                  <div className="pvp-sb-l">{t("pvp.hub.statWins")}</div>
                </div>
                <div className="pvp-sb-div" aria-hidden="true" />
                <div className="pvp-sb-cell">
                  <div className="pvp-sb-v pvp-sb-v-r">{yourRecord?.losses ?? 0}</div>
                  <div className="pvp-sb-l">{t("pvp.hub.statLosses")}</div>
                </div>
                <div className="pvp-sb-div" aria-hidden="true" />
                <div className="pvp-sb-cell pvp-sb-cell-dp">
                  <div className="pvp-sb-v pvp-sb-v-gold">{(yourRecord?.dp ?? 0).toLocaleString()}</div>
                  <div className="pvp-sb-l">{t("pvp.hub.statDp")}</div>
                  {yourRecord?.winStreak >= 3 && (
                    <div className="pvp-sb-s">{t("pvp.hub.streakMultiplier")}</div>
                  )}
                </div>
                <div className="pvp-sb-div" aria-hidden="true" />
                <div className="pvp-sb-cell">
                  <div className="pvp-sb-v pvp-sb-v-blue">{energyCur}</div>
                  <div className="pvp-sb-l">{t("pvp.hub.statEnergy")}</div>
                  <div className="pvp-sb-s">{t("pvp.hub.energyCostPerFight")}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Offline defense banner — only shown when there are unread results */}
          <OfflineDefenseBanner
            summary={defenseAcked ? null : fighter?.pvpDefense}
            onViewReport={handleViewDefenseReport}
          />

          {/* Tabs */}
          <div className="pvp-tabs">
            {buildTabs().map((tab) => (
              <button
                key={tab.id}
                className={`pvp-pt ${activeTab === tab.id && !showDefense ? "pvp-pt-act" : ""}`}
                onClick={() => { setShowDefense(false); setActiveTab(tab.id); }}
              >
                {tab.label}
              </button>
            ))}
            {/* Always available — opens the Defense Report where the player sets
                their default defense gameplan. Badge appears only when there are
                unread offline-defense results. */}
            <button
              className={`pvp-pt pvp-pt-defense ${showDefense ? "pvp-pt-act" : ""}`}
              onClick={() => setShowDefense(true)}
            >
              {t("pvp.hub.tabDefense")}
              {unreadDefense > 0 && (
                <span className="pvp-defense-badge">{unreadDefense}</span>
              )}
            </button>
          </div>

          {/* Tab content */}
          <div className="pvp-body">
            {activeTab === "ladder" && (
              <LadderTab
                season={season}
                myFighterId={fighterId}
                onboarding={onboarding}
                onOpenProfile={setViewingProfileId}
                viewerBanner={fighter?.banner}
              />
            )}
            {activeTab === "fight" && (
              <FightTab
                fighter={fighter}
                season={season}
                myRecord={yourRecord}
                onFightResolved={handleFightResolved}
                onboarding={onboarding}
                preSelectedDefenderId={preSelectedDefenderId}
                onPreSelectionConsumed={() => setPreSelectedDefenderId(null)}
              />
            )}
            {activeTab === "history" && (
              <HistoryTab season={season} />
            )}
            {activeTab === "rewards" && (
              <SeasonRewardsTab season={season} yourRecord={yourRecord} />
            )}
            {activeTab === "hof" && (
              <HallOfFameTab season={season} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
