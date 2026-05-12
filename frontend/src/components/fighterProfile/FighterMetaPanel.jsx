import { memo } from "react";

function MetaRow({ label, children, rowClassName = "", valueClassName = "" }) {
  return (
    <div className={`meta-row ${rowClassName}`.trim()}>
      <span className="meta-label">{label}</span>
      <span className={`meta-value ${valueClassName}`.trim()}>{children}</span>
    </div>
  );
}

function FameBlock({ notoriety }) {
  const peak = notoriety?.peakTier ?? "UNKNOWN";
  return (
    <div className="meta-value meta-fame-stack">
      <div className="meta-fame-head">
        <span className={`fc-tier fc-tier-${peak}`}>
          {notoriety?.tierLabel ?? "Unknown"}
        </span>
        <span className="meta-fame-score">
          {(notoriety?.score ?? 0).toLocaleString()}
        </span>
      </div>
      {notoriety?.nextTierThreshold != null && (
        <div
          className="fame-tier-bar-wrap"
          title="Progress within this band toward next threshold"
        >
          <div
            className="fame-tier-bar"
            style={{ width: `${notoriety.progressWithinTier ?? 0}%` }}
          />
        </div>
      )}
      {notoriety?.isFrozen && (
        <span
          className="meta-fame-freeze"
          title="Fame frozen — win your next fight to resume growth"
        >
          ❄ Frozen
        </span>
      )}
      {notoriety?.decayWarningActive && (
        <span
          className="meta-fame-decay"
          title="Fight or do a media event to stop decay"
        >
          ⚠ Decay risk
        </span>
      )}
    </div>
  );
}

function RankBlock({ ranking, tier }) {
  const rank = ranking?.rank ?? null;
  if (rank == null) {
    return (
      <span className="meta-rank meta-rank-unranked" title="Enter the rankings after 3 fights in this tier">
        Unranked · {tier}
      </span>
    );
  }
  if (rank === 1) {
    return (
      <span className="meta-rank meta-rank-champion" title={`Champion of ${tier}`}>
        <span className="meta-rank-icon">👑</span>
        <span className="meta-rank-text">Champion · {tier}</span>
      </span>
    );
  }
  const isTopFive = rank <= 5;
  return (
    <span className={`meta-rank ${isTopFive ? "meta-rank-top5" : ""}`} title={isTopFive ? "Top 5 — title shot zone" : null}>
      <span className="meta-rank-num">#{rank}</span>
      <span className="meta-rank-text">in {tier}</span>
      {isTopFive && <span className="meta-rank-pill">TITLE ZONE</span>}
    </span>
  );
}

/**
 * Iron, fame, record, optional gym / camp / comeback / backstory lines.
 */
export const FighterMetaPanel = memo(function FighterMetaPanel({ fighter, campSlotsUsed }) {
  const rec = fighter.record ?? {};
  const koWins = rec.koWins ?? 0;
  const subWins = rec.subWins ?? 0;
  const gym = fighter.gymId;
  const tier = fighter.promotionTier ?? "Amateur";

  return (
    <div className="fighter-meta">
      <MetaRow label="Iron ⊗" valueClassName="meta-value-gold">
        {fighter.iron ?? 0}
      </MetaRow>

      <div className="meta-row meta-row-fame">
        <span className="meta-label">Fame</span>
        <FameBlock notoriety={fighter.notoriety} />
      </div>

      <MetaRow label="Rank">
        <RankBlock ranking={fighter.ranking} tier={tier} />
      </MetaRow>

      <MetaRow label="Record">
        <>
          <span className="meta-value-green">{rec.wins ?? 0}W</span>
          {" – "}
          <span className="meta-value-red">{rec.losses ?? 0}L</span>
          {" – "}
          {rec.draws ?? 0}D
        </>
      </MetaRow>

      {(koWins > 0 || subWins > 0) && (
        <MetaRow label="Finishes" rowClassName="meta-row-sub">
          <>
            KO {koWins} · Sub {subWins}
          </>
        </MetaRow>
      )}

      {gym && typeof gym === "object" && (
        <MetaRow label="Home gym">{gym.name}</MetaRow>
      )}

      {fighter.acceptedFightId && (
        <MetaRow label="Camp" valueClassName="meta-value-green">
          <>
            {campSlotsUsed ?? fighter.trainingCampActions ?? 0} session
            {(campSlotsUsed ?? fighter.trainingCampActions ?? 0) === 1 ? "" : "s"}
          </>
        </MetaRow>
      )}

      {fighter.comebackMode && (
        <MetaRow label="Comeback" valueClassName="meta-value-gold">
          Active
        </MetaRow>
      )}

      {fighter.backstory && (
        <MetaRow label="Backstory">{fighter.backstory}</MetaRow>
      )}
    </div>
  );
});
