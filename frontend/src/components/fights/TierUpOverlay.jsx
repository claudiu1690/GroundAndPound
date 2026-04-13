import { memo } from "react";
import { tierLabel } from "../../constants/fame";
import { Trophy } from "lucide-react";

/**
 * Full-screen moment when fame peak tier increases (spec §14).
 */
export const TierUpOverlay = memo(function TierUpOverlay({ open, fromTier, toTier, onClose }) {
  if (!open) return null;

  return (
    <div className="tier-up-overlay" role="dialog" aria-modal="true" aria-label="Fame tier increased">
      <div className="tier-up-modal">
        <p className="tier-up-kicker">The MMA world is paying attention</p>
        <h2 className="tier-up-title">New fame tier</h2>
        <p className="tier-up-transition">
          <span className={`tier-up-from hdr-tier-${fromTier}`}>{tierLabel(fromTier)}</span>
          <span className="tier-up-arrow"> → </span>
          <span className={`tier-up-to hdr-tier-${toTier}`}>{tierLabel(toTier)}</span>
        </p>
        <p className="tier-up-hint">
          Higher tiers increase fight purses and unlock media & sponsorships (coming soon).
        </p>
        <button type="button" className="btn btn-primary tier-up-dismiss" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
});

export const BeltWonOverlay = memo(function BeltWonOverlay({ open, fromTier, toTier, weightClass, onClose }) {
  if (!open) return null;
  return (
    <div className="tier-up-overlay" role="dialog" aria-modal="true" aria-label="Belt won">
      <div className="tier-up-modal" style={{ borderColor: "#d4a012" }}>
        <p className="tier-up-kicker" style={{ color: "#fbbf24" }}>Championship victory</p>
        <h2 className="tier-up-title" style={{ color: "#fbbf24" }}>
          <Trophy size={24} /> NEW CHAMPION <Trophy size={24} />
        </h2>
        <p className="tier-up-transition">
          Won the <strong>{fromTier}</strong>
          <br />
          <strong>{weightClass} Title</strong>
        </p>
        <p className="tier-up-transition">
          <span style={{ color: "var(--text-muted)" }}>{fromTier}</span>
          <span className="tier-up-arrow"> {"\u2192"} </span>
          <span style={{ color: "#fbbf24" }}>{toTier}</span>
        </p>
        <p className="tier-up-hint">
          You proved yourself against the champion. New competition awaits.
        </p>
        <button type="button" className="btn btn-title tier-up-dismiss" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
});
