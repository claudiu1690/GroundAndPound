import { badgeVisual, beltTierLabel } from "./badgeCatalog";

/**
 * 5 belt slots (Amateur → GCS), driven by the server `belts[]` array. Rendered to
 * MATCH the Championships badges exactly — same belt icon, colour, tinted tile when
 * won; same greyscale-locked treatment when not won. GCS Contender (winnable:false)
 * is never shown as "won".
 */
function BeltSlot({ slot }) {
  const label = beltTierLabel(slot.tier);
  const { Icon, color, bg } = badgeVisual(slot.badgeId, "championships");
  const won = slot.state === "won" && slot.winnable !== false;

  return (
    <div className="belt-item">
      <div
        className={`belt-img${won ? " belt-img--won" : " belt-img--locked"}`}
        style={won ? { background: bg, borderColor: color } : undefined}
        title={won ? `${label} champion` : `${label} — not won`}
      >
        <Icon size={26} color={won ? color : "#888"} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div className="belt-lbl" style={won ? { color } : undefined}>{label}</div>
    </div>
  );
}

export function ChampionshipBeltsCard({ belts }) {
  const slots = Array.isArray(belts) ? belts : [];
  return (
    <div className="p-card">
      <div className="p-card-lbl">Championship Belts</div>
      <div className="belts-row">
        {slots.length === 0 ? (
          <div className="career-empty">No belt data.</div>
        ) : (
          slots.map((slot) => <BeltSlot key={slot.tier || slot.badgeId} slot={slot} />)
        )}
      </div>
    </div>
  );
}
