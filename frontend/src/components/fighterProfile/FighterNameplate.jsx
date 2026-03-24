import { memo } from "react";

/**
 * Name, optional nickname, and compact tags (OVR, weight, style, tier).
 */
export const FighterNameplate = memo(function FighterNameplate({ fighter }) {
  return (
    <div className="fighter-nameplate">
      <div className="fighter-name-full">
        {fighter.firstName} {fighter.lastName}
      </div>
      {fighter.nickname && (
        <div className="fighter-nickname-display">"{fighter.nickname}"</div>
      )}
      <div className="fighter-tags">
        <span className="fighter-tag fighter-tag-ovr">OVR {fighter.overallRating}</span>
        <span className="fighter-tag">{fighter.weightClass}</span>
        <span className="fighter-tag">{fighter.style}</span>
        <span className="fighter-tag">{fighter.promotionTier ?? "Amateur"}</span>
      </div>
    </div>
  );
});
