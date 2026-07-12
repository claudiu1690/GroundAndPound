import { useEffect, useRef, useState } from "react";
import { Shield } from "lucide-react";
import { usePvpLadder } from "../../../hooks/usePvpLadder";
import { usePvpPosition } from "../../../hooks/usePvpPosition";
import { FiltersBar } from "./ladder/FiltersBar";
import { DivisionSummary } from "./ladder/DivisionSummary";
import { PositionCard } from "./ladder/PositionCard";
import { LadderTable } from "./ladder/LadderTable";
import { t } from "../../../lib/i18n";

/**
 * NewCompetitorShieldBanner — blue banner shown when onboarding.shield.active.
 */
function NewCompetitorShieldBanner({ expiresAt }) {
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt) - Date.now()) / 86400000))
    : 0;
  return (
    <div className="pvp-shield-banner pvp-new-comp-shield-banner">
      <Shield size={13} strokeWidth={2} style={{ color: "#3B82F6", flexShrink: 0 }} />
      <div className="pvp-shield-text">
        <strong>{t("pvp.ladder.shieldTitle")}</strong> —{" "}
        {daysLeft !== 1
          ? t("pvp.ladder.shieldProtectedPlural", { n: daysLeft })
          : t("pvp.ladder.shieldProtected", { n: daysLeft })}
        <div style={{ marginTop: 3, fontSize: 10, color: "#555" }}>
          {daysLeft !== 1
            ? t("pvp.ladder.shieldRemainingPlural", { n: daysLeft })
            : t("pvp.ladder.shieldRemaining", { n: daysLeft })}
        </div>
      </div>
    </div>
  );
}

/**
 * LadderTab — full ladder view.
 *
 * Props:
 *   season         {object}
 *   myFighterId    {string}
 *   onboarding     {object|null}
 *   onOpenProfile  {fn(playerId)}
 *   onChallenge    {fn(playerId)}   threaded from PvpHub.handleChallengeFromProfile
 *   viewerBanner   {object|null}    the viewer's banner config — skins their own row/card
 */
export function LadderTab({ season, myFighterId, onboarding, onOpenProfile, viewerBanner }) {
  const seasonId = season?.id;

  // ── position (never moves on filter change) ──────────────────────────────
  const { position, loading: posLoading } = usePvpPosition(seasonId);

  // ── filter state ─────────────────────────────────────────────────────────
  // division === null means "All divisions". It defaults to the player's own
  // division ONCE when position first loads; after that the player is free to
  // pick "All" (null) and it sticks.
  const [division, setDivision] = useState(null);
  const [weightClass, setWeightClass] = useState("All");
  const didInitDivision = useRef(false);

  useEffect(() => {
    if (!didInitDivision.current && position?.division) {
      didInitDivision.current = true;
      setDivision(position.division);
    }
  }, [position?.division]);

  // ── ladder data ───────────────────────────────────────────────────────────
  const {
    rows,
    divisionCounts,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    loadMore,
  } = usePvpLadder({
    seasonId,
    division: division ?? undefined,
    weightClass: season?.crossWeightClass ? weightClass : undefined,
  });

  return (
    <div className="lt-content">
      {/* New Competitor Shield */}
      {onboarding?.shield?.active && (
        <NewCompetitorShieldBanner expiresAt={onboarding.shield.expiresAt} />
      )}

      {/* Filters */}
      <FiltersBar
        division={division}
        setDivision={setDivision}
        weightClass={weightClass}
        setWeightClass={setWeightClass}
        season={season}
        total={total}
      />

      {/* Your position (pinned — independent of filters) */}
      {!posLoading && (
        <PositionCard position={position} viewerBanner={viewerBanner} />
      )}

      {/* Division spectrum strip */}
      <DivisionSummary
        divisionCounts={divisionCounts}
        division={division}
        setDivision={setDivision}
        myPosition={position}
      />

      {/* Full ladder table */}
      <LadderTable
        rows={rows}
        total={total}
        hasMore={hasMore}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        loadMore={loadMore}
        season={season}
        onOpenProfile={onOpenProfile}
        division={division}
        viewerBanner={viewerBanner}
      />
    </div>
  );
}
