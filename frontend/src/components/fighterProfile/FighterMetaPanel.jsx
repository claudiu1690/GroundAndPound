import { memo } from "react";
import { t } from "@/lib/i18n";

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
          title={t("fighterProfile.meta.fameProgressTitle")}
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
          title={t("fighterProfile.meta.fameFrozenTitle")}
        >
          {t("fighterProfile.meta.fameFrozen")}
        </span>
      )}
      {notoriety?.decayWarningActive && (
        <span
          className="meta-fame-decay"
          title={t("fighterProfile.meta.fameDecayTitle")}
        >
          {t("fighterProfile.meta.fameDecay")}
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
      <span className="meta-rank meta-rank-unranked" title={t("fighterProfile.meta.unrankedTitle")}>
        {t("fighterProfile.meta.unranked", { tier })}
      </span>
    );
  }
  // Title-shot zone = top 5 in division (champion + top 4 contenders).
  const isTopFive = rank <= 4;
  return (
    <span className={`meta-rank ${isTopFive ? "meta-rank-top5" : ""}`} title={isTopFive ? t("fighterProfile.meta.titleZoneTitle") : null}>
      <span className="meta-rank-num">#{rank}</span>
      <span className="meta-rank-text">{t("fighterProfile.meta.rankIn", { tier })}</span>
      {isTopFive && <span className="meta-rank-pill">{t("fighterProfile.meta.titleZone")}</span>}
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
        <div className="meta-comeback-chip">{t("fighterProfile.meta.comebackMode")}</div>
      )}

      <MetaSection title={t("fighterProfile.meta.sections.resources")} dataTut="profile-resources">
        <MetaRow label={t("fighterProfile.meta.labels.cash")} valueClassName="meta-value-gold">
          {(fighter.iron ?? 0).toLocaleString()}
        </MetaRow>
        <div className="meta-row meta-row-fame">
          <span className="meta-label">{t("fighterProfile.meta.labels.fame")}</span>
          <FameBlock notoriety={fighter.notoriety} />
        </div>
      </MetaSection>

      <MetaSection title={t("fighterProfile.meta.sections.career")} dataTut="profile-career">
        <div className="meta-row">
          <span className="meta-label">{t("fighterProfile.meta.labels.rank")}</span>
          <span className="meta-value">
            <RankBlock ranking={fighter.ranking} tier={tier} />
          </span>
        </div>
        {(koWins > 0 || subWins > 0) && (
          <MetaRow label={t("fighterProfile.meta.labels.finishes")}>
            <>{t("fighterProfile.meta.koSubLabel", { ko: koWins, sub: subWins })}</>
          </MetaRow>
        )}
        {fighter.acceptedFightId && (
          <MetaRow label={t("fighterProfile.meta.labels.camp")} valueClassName="meta-value-green">
            <>
              {campSessions === 1
                ? t("fighterProfile.meta.campSessions", { n: campSessions })
                : t("fighterProfile.meta.campSessionsPlural", { n: campSessions })}
            </>
          </MetaRow>
        )}
      </MetaSection>

      <MetaSection title={t("fighterProfile.meta.sections.profile")}>
        <MetaRow label={t("fighterProfile.meta.labels.class")}>
          {fighter.weightClass} · {fighter.style}
        </MetaRow>
        {gym && typeof gym === "object" && (
          <MetaRow label={t("fighterProfile.meta.labels.homeGym")}>{gym.name}</MetaRow>
        )}
        {fighter.backstory && (
          <MetaRow label={t("fighterProfile.meta.labels.backstory")}>{fighter.backstory}</MetaRow>
        )}
      </MetaSection>
    </div>
  );
});
