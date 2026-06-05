import { memo } from "react";

const BADGE_HINTS = {
  "Iron Will": "Gym quest perk: lower KO/TKO risk when you take damage",
  "Amateur Champion": "Won your division's Amateur title and turned pro.",
  Champion: "Won a professional championship (Regional Pro and up).",
};

/**
 * Profile honor / perk chips (same visual row).
 */
export const FighterBadgeRow = memo(function FighterBadgeRow({ badges }) {
  if (!badges?.length) return null;
  return (
    <div className="fighter-badges">
      {badges.map((name) => (
        <span
          key={name}
          className="fighter-badge"
          title={BADGE_HINTS[name]}
        >
          ★ {name}
        </span>
      ))}
    </div>
  );
});
