import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api } from "../../api";
import { ProfilePane } from "../career/ProfilePane";

/**
 * ReadOnlyProfile — renders another fighter's profile (read-only) within the
 * PVP hub, with a Challenge button driven by /pvp/challenge-eligibility.
 *
 * Props:
 *   fighterId      {string}   the profile to show
 *   viewerFighter  {object}   current logged-in fighter (not used for data; passed for context)
 *   season         {object}
 *   onBack         {fn}       returns to ladder
 *   onChallenge    {fn(defenderId)}  called when Challenge is confirmed
 */
export function ReadOnlyProfile({ fighterId, viewerFighter, season, onBack, onChallenge }) {
  const [eligibility, setEligibility] = useState(null);
  const [eligLoading, setEligLoading] = useState(false);
  const [eligError, setEligError] = useState(null);

  useEffect(() => {
    if (!fighterId) return;
    let cancelled = false;
    setEligLoading(true);
    setEligError(null);
    api.pvpChallengeEligibility(fighterId)
      .then((res) => {
        if (!cancelled) setEligibility(res);
      })
      .catch((e) => {
        if (!cancelled) setEligError(e.message || "Could not check challenge eligibility.");
      })
      .finally(() => {
        if (!cancelled) setEligLoading(false);
      });
    return () => { cancelled = true; };
  }, [fighterId]);

  // Derive button state from eligibility response
  const reason = eligibility?.reason ?? null;
  // Hide if self / not_same_season / season_not_active
  const hideButton = reason === "self" || reason === "not_same_season" || reason === "season_not_active";
  const isEnabled = eligibility?.eligible === true;
  const disabledTooltip =
    reason === "protected"
      ? "Protected"
      : reason === "out_of_range"
        ? "Out of range — OVR gap too large to challenge directly"
        : null;

  return (
    <div className="lt-rop-wrap">
      {/* Back button + Challenge button header */}
      <div className="lt-rop-header">
        <button className="lt-rop-back-btn" onClick={onBack}>
          <ChevronLeft size={14} strokeWidth={2} />
          Back to Ladder
        </button>

        {!eligLoading && !hideButton && (
          <button
            className="lt-rop-challenge-btn"
            disabled={!isEnabled}
            title={!isEnabled ? (disabledTooltip ?? undefined) : undefined}
            onClick={() => isEnabled && onChallenge(fighterId)}
            style={!isEnabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            Challenge
          </button>
        )}

        {eligLoading && (
          <span className="lt-rop-elig-loading">Checking eligibility…</span>
        )}

        {eligError && !eligLoading && (
          <span className="lt-rop-elig-error">{eligError}</span>
        )}
      </div>

      {/* Profile — read-only, arbitrary fighterId.
          The profile's CSS is scoped under `.career-page` (see App.css); the Career
          tab provides that ancestor via <section className="career-page">. Rendered
          here outside the Career tab, we must supply the same scope or the profile
          renders unstyled. */}
      <div className="career-page lt-rop-profile">
        <ProfilePane
          fighter={null}
          fighterId={fighterId}
          onMessage={null}
          onRefreshFighter={null}
          readOnly
        />
      </div>
    </div>
  );
}
