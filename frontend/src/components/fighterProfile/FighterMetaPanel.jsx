import { memo } from "react";

function MetaRow({ label, children, rowClassName = "", valueClassName = "" }) {
  return (
    <div className={`meta-row ${rowClassName}`.trim()}>
      <span className="meta-label">{label}</span>
      <span className={`meta-value ${valueClassName}`.trim()}>{children}</span>
    </div>
  );
}

/** A labelled group of meta rows — adds scannable structure to the panel. */
function MetaSection({ title, children, dataTut }) {
  return (
    <div className="meta-section" data-tut={dataTut}>
      <div className="meta-section-title">{title}</div>
      {children}
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
  // `rank` here is the player's display rank (1-N) — champion sits above the
  // ladder and the player can never hold that slot in their own tier's rankings.
  const rank = ranking?.rank ?? null;
  if (rank == null) {
    return (
      <span className="meta-rank meta-rank-unranked" title="Enter the rankings after 3 fights in this tier">
        Unranked · {tier}
      </span>
    );
  }
  // Title-shot zone = top 5 in division (champion + top 4 contenders).
  const isTopFive = rank <= 4;
  return (
    <span className={`meta-rank ${isTopFive ? "meta-rank-top5" : ""}`} title={isTopFive ? "Top 5 — title shot zone" : null}>
      <span className="meta-rank-num">#{rank}</span>
      <span className="meta-rank-text">in {tier}</span>
      {isTopFive && <span className="meta-rank-pill">TITLE ZONE</span>}
    </span>
  );
}

/**
 * Grouped meta panel — Resources / Media Career / Career / Profile sections.
 * Record is intentionally omitted; it's already on the gold hero card above.
 */
export const FighterMetaPanel = memo(function FighterMetaPanel({ fighter, campSlotsUsed }) {
  const rec = fighter.record ?? {};
  const koWins = rec.koWins ?? 0;
  const subWins = rec.subWins ?? 0;
  const gym = fighter.gymId;
  const tier = fighter.promotionTier ?? "Amateur";
  const campSessions = campSlotsUsed ?? fighter.trainingCampActions ?? 0;

  return (
    <div className="fighter-meta">
      {fighter.comebackMode && (
        <div className="meta-comeback-chip">⚡ Comeback Mode Active</div>
      )}

      <MetaSection title="Resources" dataTut="profile-resources">
        <MetaRow label="Cash" valueClassName="meta-value-gold">
          {(fighter.iron ?? 0).toLocaleString()}
        </MetaRow>
        <div className="meta-row meta-row-fame">
          <span className="meta-label">Fame</span>
          <FameBlock notoriety={fighter.notoriety} />
        </div>
      </MetaSection>

      <MetaSection title="Career" dataTut="profile-career">
        <div className="meta-row">
          <span className="meta-label">Rank</span>
          <span className="meta-value">
            <RankBlock ranking={fighter.ranking} tier={tier} />
          </span>
        </div>
        {(koWins > 0 || subWins > 0) && (
          <MetaRow label="Finishes">
            <>KO {koWins} · Sub {subWins}</>
          </MetaRow>
        )}
        {fighter.acceptedFightId && (
          <MetaRow label="Camp" valueClassName="meta-value-green">
            <>
              {campSessions} session{campSessions === 1 ? "" : "s"}
            </>
          </MetaRow>
        )}
      </MetaSection>

      <MetaSection title="Profile">
        <MetaRow label="Class">
          {fighter.weightClass} · {fighter.style}
        </MetaRow>
        {gym && typeof gym === "object" && (
          <MetaRow label="Home gym">{gym.name}</MetaRow>
        )}
        {fighter.backstory && (
          <MetaRow label="Backstory">{fighter.backstory}</MetaRow>
        )}
      </MetaSection>
    </div>
  );
});
