import { useState, useEffect } from "react";
import { Zap, Lock } from "lucide-react";
import { usePvpSeason } from "../../hooks/usePvpSeason";
import { OPEN_LABEL } from "./pvpConst";
import { usePvpDefenseResults } from "../../hooks/usePvpDefenseResults";
import { LadderTab } from "./tabs/LadderTab";
import { FightTab } from "./tabs/FightTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { SeasonRewardsTab } from "./tabs/SeasonRewardsTab";
import { HallOfFameTab } from "./tabs/HallOfFameTab";
import { DefenseResults } from "./DefenseResults";
import { SeasonEndModal } from "./SeasonEndModal";
import { NewSeasonModal } from "./NewSeasonModal";
import { ReadOnlyProfile } from "./ReadOnlyProfile";
import { api } from "../../api";

const TABS = [
  { id: "ladder",   label: "Ladder" },
  { id: "fight",    label: "Fight" },
  { id: "history",  label: "History" },
  { id: "rewards",  label: "Season Rewards" },
  { id: "hof",      label: "Hall of Fame" },
];

/**
 * PvpHub — top container for the Proving Ground PVP system.
 * Calls GET /pvp/season/current/:weightClass for season + own record.
 * New fields consumed from that response: `justEnded` (boolean) and
 * `lastSeasonRecord` — present when justEnded, else null.
 *
 * Modal flow: SeasonEndModal → NewSeasonModal (linked by "Start New Season"
 * button). Dismissing either calls POST /pvp/acknowledge-season so the
 * banner doesn't reappear on subsequent visits.
 */
export function PvpHub({ fighter, onNavigate, onRefreshFighter }) {
  const weightClass = fighter?.weightClass ?? "featherweight";
  const fighterId = fighter?._id;

  const { data: seasonData, loading, error, silentRefetch } = usePvpSeason(weightClass);
  const { data: defData } = usePvpDefenseResults();

  const [activeTab, setActiveTab] = useState("ladder");
  const [showDefense, setShowDefense] = useState(false);
  const [showSeasonEnd, setShowSeasonEnd] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [ackDone, setAckDone] = useState(false);

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

  useEffect(() => {
    if (justEnded && lastSeasonRecord && !ackDone) {
      setShowSeasonEnd(true);
    }
  }, [justEnded, lastSeasonRecord, ackDone]);

  const unreadDefense = defData?.unreadCount ?? 0;
  const energyCur = fighter?.energy?.current ?? 0;

  async function handleSeasonEndClose() {
    setShowSeasonEnd(false);
    await fireAck();
  }

  function handleStartNewSeason() {
    setShowSeasonEnd(false);
    setShowNewSeason(true);
  }

  async function handleViewLeaderboard() {
    setShowSeasonEnd(false);
    setActiveTab("ladder");
    await fireAck();
  }

  async function handleEnterLadder() {
    setShowNewSeason(false);
    setActiveTab("ladder");
    await fireAck();
  }

  async function fireAck() {
    setAckDone(true);
    if (lastSeasonRecord?.seasonId) {
      try {
        await api.pvpAcknowledgeSeason(lastSeasonRecord.seasonId);
      } catch {
        // Non-fatal
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
        <div className="pvp-loading">Loading The Proving Ground…</div>
      </div>
    );
  }

  if (error && !seasonData) {
    return (
      <div className="pvp-hub-error">
        <div className="pvp-error-note">{error}</div>
        <button className="pvp-refresh-btn" onClick={silentRefetch}>Retry</button>
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
          <div className="pvp-locked-title">The Proving Ground — Locked</div>
          <div className="pvp-locked-copy">
            Prove yourself in the cage first. Win 3 career fights to unlock competitive PVP.
          </div>
          <div className="pvp-locked-progress">
            <div className="pvp-locked-prog-track">
              <div
                className="pvp-locked-prog-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="pvp-locked-prog-label">{careerWins} / {winsNeeded} wins</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pvp-hub">
      {/* Season End Modal */}
      {showSeasonEnd && lastSeasonRecord && (
        <SeasonEndModal
          lastSeasonRecord={lastSeasonRecord}
          nextSeason={season}
          onClose={handleSeasonEndClose}
          onViewLeaderboard={handleViewLeaderboard}
          onStartNewSeason={handleStartNewSeason}
        />
      )}

      {/* New Season Modal */}
      {showNewSeason && season && (
        <NewSeasonModal
          season={season}
          newDivision={lastSeasonRecord?.newDivision ?? null}
          newDp={lastSeasonRecord?.newDp ?? 0}
          previousDivision={lastSeasonRecord?.division ?? null}
          onEnter={handleEnterLadder}
        />
      )}

      {/* Defense results overlay */}
      {showDefense && (
        <DefenseResults
          myRecord={yourRecord}
          onBack={() => setShowDefense(false)}
          onGameplanChanged={() => silentRefetch()}
        />
      )}

      {/* Read-only profile view-swap — shown when viewingProfileId is set */}
      {viewingProfileId && !showDefense && !showSeasonEnd && !showNewSeason && (
        <ReadOnlyProfile
          fighterId={viewingProfileId}
          viewerFighter={fighter}
          season={season}
          onBack={() => setViewingProfileId(null)}
          onChallenge={handleChallengeFromProfile}
        />
      )}

      {/* Main hub — hidden while any overlay or profile view is open */}
      {!viewingProfileId && !showDefense && !showSeasonEnd && !showNewSeason && (
        <>
          {/* Hero */}
          <div className="pvp-hero">
            <div className="pvp-glow" />
            <div className="pvp-inner">
              <div>
                <div className="pvp-eye">Competitive</div>
                <div className="pvp-title">The Proving Ground</div>
                <div className="pvp-meta">
                  {season && (
                    <span className="pvp-s-badge">{seasonLabel}</span>
                  )}
                  {weeksLeft !== null && (
                    <span style={{ fontSize: 12, color: "#AAAAAA" }}>
                      {weeksLeft} week{weeksLeft !== 1 ? "s" : ""} remaining
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
                      Placement {onboarding.placement.fights ?? 0}/3
                    </span>
                  )}
                </div>
                {onboarding?.catchUp?.active && (
                  <div className="pvp-catchup-pill">
                    New Competitor Bonus — {catchUpDaysLeft}d left · DP &times;2
                  </div>
                )}
              </div>
              <div className="pvp-stats">
                <div className="pvp-pvs">
                  <div className="pvp-pvs-v pvp-pvs-g">{yourRecord?.wins ?? 0}</div>
                  <div className="pvp-pvs-l">Wins</div>
                </div>
                <div className="pvp-div-line" />
                <div className="pvp-pvs">
                  <div className="pvp-pvs-v pvp-pvs-r">{yourRecord?.losses ?? 0}</div>
                  <div className="pvp-pvs-l">Losses</div>
                </div>
                <div className="pvp-div-line" />
                <div className="pvp-pvs">
                  <div className="pvp-pvs-v pvp-pvs-gold">{(yourRecord?.dp ?? 0).toLocaleString()}</div>
                  <div className="pvp-pvs-l">DP</div>
                  {yourRecord?.winStreak >= 3 && (
                    <div className="pvp-pvs-s">×1.25 streak</div>
                  )}
                </div>
                <div className="pvp-div-line" />
                <div className="pvp-pvs">
                  <div className="pvp-pvs-v pvp-pvs-blue">{energyCur}</div>
                  <div className="pvp-pvs-l">Energy</div>
                  <div className="pvp-pvs-s">15E / fight</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="pvp-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`pvp-pt ${activeTab === tab.id ? "pvp-pt-act" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            {unreadDefense > 0 && (
              <button
                className="pvp-pt pvp-pt-defense"
                onClick={() => setShowDefense(true)}
              >
                Defense{" "}
                <span className="pvp-defense-badge">{unreadDefense}</span>
              </button>
            )}
          </div>

          {/* Tab content */}
          <div className="pvp-body">
            {activeTab === "ladder" && (
              <LadderTab
                season={season}
                myFighterId={fighterId}
                onboarding={onboarding}
                onOpenProfile={setViewingProfileId}
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
