/**
 * PVP history card. There's no PVP data yet (the profile `pvp` field is null),
 * so this renders a simple empty state. When PVP ships, branch on `pvp` here.
 */
export function PvpHistoryCard({ pvp }) {
  // PVP isn't implemented yet — `pvp` is always null. When it ships, render the
  // season rows here when data is present; otherwise show the empty state.
  return (
    <div className="p-card">
      <div className="p-card-lbl">PVP History</div>
      <div className="career-empty">No PVP history yet</div>
    </div>
  );
}
