import { listenersFromScore, formatListeners } from "../media/mediaFormat";

const DOC_FAME_TARGET = 40000;

/**
 * Media career summary. Listeners are derived client-side from notoriety.score
 * via the shared Media-tab helpers (consistent value). Documentary line shows
 * progress toward the fame target until recorded, then the recorded date.
 */
export function MediaCareerCard({ fighter }) {
  const score = Number(fighter?.notoriety?.score ?? 0);
  const episodes = fighter?.media?.episodeCount ?? 0;
  const listeners = formatListeners(listenersFromScore(score));

  const recorded = fighter?.media?.documentaryStatus === "recorded";
  let docValue;
  let docClass = "";
  if (recorded) {
    const at = fighter?.media?.documentaryRecordedAt;
    const dateStr = at ? new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
    docValue = `Recorded${dateStr ? ` · ${dateStr}` : ""}`;
    docClass = "gold";
  } else {
    docValue = `Not yet · ${score.toLocaleString()} / ${DOC_FAME_TARGET.toLocaleString()} fame`;
    docClass = "muted";
  }

  return (
    <div className="p-card">
      <div className="p-card-lbl">Media Career</div>
      <div className="cr"><span className="cl">Podcast episodes</span><span className="cv">{episodes}</span></div>
      <div className="cr"><span className="cl">Listeners</span><span className="cv" style={{ color: "var(--ts, #AAA)" }}>{listeners}</span></div>
      <div className="cr">
        <span className="cl">Documentary</span>
        <span className={`cv${docClass === "gold" ? " gold" : ""}`} style={docClass === "muted" ? { color: "var(--tm, #555)", fontSize: 11 } : { fontSize: 11 }}>
          {docValue}
        </span>
      </div>
    </div>
  );
}
