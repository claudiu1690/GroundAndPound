import { formatNudge, archetypeColor } from "./personaTypes";

/**
 * Static per-option nudge chip — "Hated −9 · Loud +7" — rendered straight
 * from the catalog entry's `nudge:{dx,dy,quadrant}` field. No fetch, no
 * resolution logic; just formatting. Renders nothing when there's no nudge
 * data (older payload / a genuinely neutral option).
 */
export function PersonaNudgeChip({ nudge, className = "" }) {
  if (!nudge) return null;
  const text = formatNudge(nudge);
  if (!text) return null;
  const color = nudge.quadrant ? archetypeColor(nudge.quadrant) : null;
  return (
    <span
      className={`persona-nudge-chip${className ? ` ${className}` : ""}`}
      style={color ? { borderColor: `${color}55`, color } : undefined}
    >
      {text}
    </span>
  );
}
