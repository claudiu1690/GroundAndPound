import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { usePvpSeason } from "../../hooks/usePvpSeason";
import { usePvpDefenseResults } from "../../hooks/usePvpDefenseResults";
import { LadderTab } from "./tabs/LadderTab";
import { FightTab } from "./tabs/FightTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { SeasonRewardsTab } from "./tabs/SeasonRewardsTab";
import { HallOfFameTab } from "./tabs/HallOfFameTab";
import { DefenseResults } from "./DefenseResults";
import { SeasonEndModal } from "./SeasonEndModal";
import { NewSeasonModal } from "./NewSeasonModal";
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
 * `lastSeasonRecord` ({ seasonId, seasonNumber, seasonName, weightClass,
 *   division, divisionColor, dp, rank, isBeltHolder,
 *   rewards: { iron, fame, drinks, badge },
 *   newDivision, newDp }) — present when justEnded, else null.
 *
 * Modal flow: SeasonEndModal → NewSeasonModal (linked by "Start New Season"
 * button). Dismissing either calls POST /pvp/acknowledge-season so the
 * banner doesn't reappear on subsequent visits.
 */
export function PvpHub({ fighter, onNavigate }) {
  const weightClass = fighter?.weightClass ?? "featherweight";
  const fighterId = fighter?._id;

  const { data: seasonData, loading, error, silentRefetch } = usePvpSeason(weightClass);
  const { data: defData } = usePvpDefenseResults();

  const [activeTab, setActiveTab] = useState("ladder");
  const [showDefense, setShowDefense] = useState(false);
  const [showSeasonEnd, setShowSeasonEnd] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);
  // Once the player has acknowledged the season-end flow we suppress re-showing
  // for the lifetime of this component mount (the ack POST ensures it won't
  // reappear on the next full page load either).
  const [ackDone, setAckDone] = useState(false);

  const season = seasonData?.season ?? null;
  const yourRecord = seasonData?.yourRecord ?? null;
  const poolCount = seasonData?.poolCount ?? 0;
  const justEnded = seasonData?.justEnded ?? false;
  const lastSeasonRecord = seasonData?.lastSeasonRecord ?? null;

  // Trigger SeasonEndModal exactly once per payload when justEnded is true
  // and the player hasn't yet acknowledged this season transition.
  useEffect(() => {
    if (justEnded && lastSeasonRecord && !ackDone) {
      setShowSeasonEnd(true);
    }
  }, [justEnded, lastSeasonRecord, ackDone]);

  const unreadDefense = defData?.unreadCount ?? 0;
  const energyCur = fighter?.energy?.current ?? 0;

  // Called from SeasonEndModal "View Leaderboard" or close (X) button — skips
  // the new-season modal and fires the ack so it won't reappear.
  async function handleSeasonEndClose() {
    setShowSeasonEnd(false);
    await fireAck();
  }

  // Called from SeasonEndModal "Start New Season" — chains to NewSeasonModal.
  function handleStartNewSeason() {
    setShowSeasonEnd(false);
    setShowNewSeason(true);
  }

  // Called from SeasonEndModal "View Leaderboard" button.
  async function handleViewLeaderboard() {
    setShowSeasonEnd(false);
    setActiveTab("ladder");
    await fireAck();
  }

  // Called from NewSeasonModal "Enter the Ladder" button — final step.
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
        // Non-fatal: worst case the modal reappears next visit until ack succeeds.
      }
    }
  }

  function handleFightResolved() {
    silentRefetch();
  }

  const seasonLabel = season
    ? `Season ${season.seasonNumber}${season.name ? ` — ${season.name}` : ""}`
    : "—";

  const weeksLeft = season?.endDate
    ? Math.max(0, Math.ceil((new Date(season.endDate) - Date.now()) / (7 * 86400000)))
    : null;

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

  return (
    <div className="pvp-hub">
      {/* Season End Modal (Screen 5) */}
      {showSeasonEnd && lastSeasonRecord && (
        <SeasonEndModal
          lastSeasonRecord={lastSeasonRecord}
          nextSeason={season}
          onClose={handleSeasonEndClose}
          onViewLeaderboard={handleViewLeaderboard}
          onStartNewSeason={handleStartNewSeason}
        />
      )}

      {/* New Season Modal (Screen 6) — driven by lastSeasonRecord.newDivision/newDp */}
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

      {/* Main hub — hidden while a full-screen overlay is open */}
      {!showDefense && !showSeasonEnd && !showNewSeason && (
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
                  {season?.twistName && season.twistName !== "Iron Circuit" && (
                    <span className="pvp-twist-pill">
                      {season.twistName}
                    </span>
                  )}
                </div>
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
            {/* Defense results badge */}
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
                yourRecord={yourRecord}
                poolCount={poolCount}
                myFighterId={fighterId}
                onFight={() => setActiveTab("fight")}
              />
            )}
            {activeTab === "fight" && (
              <FightTab
                fighter={fighter}
                season={season}
                myRecord={yourRecord}
                onFightResolved={handleFightResolved}
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
