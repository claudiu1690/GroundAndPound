import { useCallback, useEffect, useState } from "react";
import { Skull, Flame, Handshake, Megaphone } from "lucide-react";
import { api } from "../../../api";

function RivRow({ Icon, iconColor, borderColor, name, tag, tagStyle, sub, bonus, bonusColor, window }) {
  return (
    <div className="media-riv-row" style={{ borderColor }}>
      <div className="media-riv-icon" style={{ color: iconColor }}><Icon size={18} /></div>
      <div className="media-riv-info">
        <div className="media-riv-name">
          {name}
          {tag && <span className="media-riv-tag" style={tagStyle}>{tag}</span>}
        </div>
        {sub && <div className="media-riv-sub">{sub}</div>}
      </div>
      <div className="media-riv-right">
        {bonus && <div className="media-riv-bonus" style={{ color: bonusColor }}>{bonus}</div>}
        {window && <div className="media-riv-window">{window}</div>}
      </div>
    </div>
  );
}

export function RivalryTab({ fighter, onMessage }) {
  const fighterId = fighter?._id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!fighterId) return;
    setLoading(true);
    setError("");
    try {
      setData(await api.getRivalry(fighterId));
    } catch (e) {
      setError(e.message || "Could not load the rivalry board.");
    } finally {
      setLoading(false);
    }
  }, [fighterId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="media-pane"><div className="media-state">Loading rivalries…</div></div>;
  if (error) {
    return (
      <div className="media-pane">
        <div className="media-state media-state--error">
          {error}
          <button type="button" className="media-mini-btn" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  const nemesis = data?.nemesis;
  const beef = data?.beef || [];
  const respect = data?.respect || [];
  const callout = data?.callout;
  const empty = !nemesis && beef.length === 0 && respect.length === 0 && !callout;

  return (
    <div className="media-pane">
      <div className="media-slbl">Active storylines</div>

      {empty ? (
        <div className="media-state">
          No active rivalries. Set beef flags via the Podcast or post-fight interviews.
          Call out opponents from the Fight tab.
        </div>
      ) : (
        <div className="media-riv-list">
          {nemesis && (
            <RivRow
              Icon={Skull}
              iconColor="var(--c-accent, #C8102E)"
              borderColor="rgba(200,16,46,0.25)"
              name={`Nemesis: ${nemesis.opponentName}`}
              tag="Nemesis"
              tagStyle={{ background: "rgba(200,16,46,0.1)", color: "var(--c-accent, #C8102E)", border: "1px solid rgba(200,16,46,0.2)" }}
              sub={`Beat you ${nemesis.lossCount} time${nemesis.lossCount === 1 ? "" : "s"} · appears in your fight offers`}
              bonus={nemesis.fameBonus ? `+${nemesis.fameBonus} fame` : null}
              bonusColor="var(--c-accent, #C8102E)"
              window="on win"
            />
          )}

          {beef.map((b) => (
            <RivRow
              key={`beef-${b.opponentId}`}
              Icon={Flame}
              iconColor="#F87171"
              borderColor="rgba(200,16,46,0.2)"
              name={`Beef with ${b.opponentName}`}
              tag="Beef"
              tagStyle={{ background: "rgba(200,16,46,0.1)", color: "#F87171", border: "1px solid rgba(200,16,46,0.15)" }}
              sub={b.source ? `Set via ${b.source}` : "Grudge match bonus on a win"}
              bonusColor="#F87171"
              window={`${b.expiresAfterFights} fight${b.expiresAfterFights === 1 ? "" : "s"} left`}
            />
          ))}

          {respect.map((r) => (
            <RivRow
              key={`respect-${r.opponentId}`}
              Icon={Handshake}
              iconColor="#93C5FD"
              borderColor="rgba(59,130,246,0.2)"
              name={`Respect for ${r.opponentName}`}
              tag="Respect"
              tagStyle={{ background: "rgba(59,130,246,0.1)", color: "#93C5FD", border: "1px solid rgba(59,130,246,0.2)" }}
              sub={r.source ? `Set via ${r.source}` : "Cash bonus on a win against them"}
              bonusColor="#93C5FD"
              window={`${r.expiresAfterFights} fight${r.expiresAfterFights === 1 ? "" : "s"} left`}
            />
          ))}

          {callout && (
            <RivRow
              Icon={Megaphone}
              iconColor="var(--c-gold, #D4A820)"
              borderColor="rgba(212,168,32,0.2)"
              name={`Callout: ${callout.opponentName}`}
              tag="Called out"
              tagStyle={{ background: "rgba(212,168,32,0.1)", color: "var(--c-gold, #D4A820)", border: "1px solid rgba(212,168,32,0.2)" }}
              sub={callout.isStretch ? "Stretch callout · appears in a tougher offer slot" : "Appears in your next offer slot"}
              bonus={callout.pursePct ? `+${callout.pursePct}% cash` : null}
              bonusColor="var(--c-gold, #D4A820)"
              window="next offer"
            />
          )}
        </div>
      )}
    </div>
  );
}
