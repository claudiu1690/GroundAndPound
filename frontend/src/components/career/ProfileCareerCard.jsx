/**
 * Career summary rows: rank, record, finishes, streak, gym, style, fame.
 */
function Row({ label, value, valueClass, small }) {
  return (
    <div className="cr">
      <span className="cl">{label}</span>
      <span className={`cv${valueClass ? ` ${valueClass}` : ""}`} style={small ? { fontSize: 11 } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function ProfileCareerCard({ fighter }) {
  const rec = fighter?.record ?? {};
  const recordStr = `${rec.wins ?? 0}W · ${rec.losses ?? 0}L · ${rec.draws ?? 0}D`;

  const rankNum = fighter?.ranking?.rank;
  const rankValue = rankNum != null
    ? `#${rankNum}${fighter?.promotionTier ? ` ${fighter.promotionTier}` : ""}`
    : "Unranked";

  const winStreak = Number(fighter?.winStreak ?? 0);
  const lossStreak = Number(fighter?.consecutiveLosses ?? 0);
  let streakLabel = null;
  if (winStreak > 0) streakLabel = { value: `${winStreak}W`, valueClass: "grn" };
  else if (lossStreak > 0) streakLabel = { value: `${lossStreak}L`, valueClass: "acc" };
  else streakLabel = { value: "—", valueClass: "" };

  return (
    <div className="p-card">
      <div className="p-card-lbl">Career</div>
      <Row label="Rank" value={rankValue} valueClass="acc" />
      <Row label="Record" value={recordStr} />
      <Row label="KOs" value={rec.koWins ?? 0} />
      <Row label="Submissions" value={rec.subWins ?? 0} />
      <Row label="Decisions" value={rec.decisionWins ?? 0} />
      <Row label={winStreak > 0 || lossStreak <= 0 ? "Win streak" : "Loss streak"} value={streakLabel.value} valueClass={streakLabel.valueClass} />
      <Row label="Gym" value={fighter?.gymId?.name || "—"} small />
      <Row label="Style" value={fighter?.style || "—"} small />
      <Row label="Fame" value={fighter?.notoriety?.tierLabel || "—"} valueClass="gold" small />
    </div>
  );
}
