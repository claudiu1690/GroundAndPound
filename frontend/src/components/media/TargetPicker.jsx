import { useCallback, useEffect, useState } from "react";
import { Flame, Heart } from "lucide-react";
import { api } from "../../api";

function recordStr(r) {
  if (!r) return "—";
  return `${r.wins ?? 0}-${r.losses ?? 0}${r.draws ? `-${r.draws}` : ""}`;
}

/**
 * Shared opponent picker. Fetches /media/:id/targets, lists candidates with
 * OVR / record / beef-respect chips, single-select. Calls onSelect(opponentId).
 */
export function TargetPicker({ fighterId, selectedId, onSelect }) {
  const [targets, setTargets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!fighterId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.getMediaTargets(fighterId);
      // Accept either { targets:[...] } or a raw array.
      const list = Array.isArray(data) ? data : (data.targets || data.candidates || []);
      setTargets(list);
    } catch (e) {
      setError(e.message || "Could not load targets.");
      setTargets(null);
    } finally {
      setLoading(false);
    }
  }, [fighterId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="media-target-state">Loading targets…</div>;
  if (error) {
    return (
      <div className="media-target-state media-target-state--error">
        {error}
        <button type="button" className="media-mini-btn" onClick={load}>Retry</button>
      </div>
    );
  }
  if (!targets || targets.length === 0) {
    return <div className="media-target-state">No valid targets right now.</div>;
  }

  return (
    <div className="media-target-grid">
      {targets.map((t) => {
        const id = t.opponentId || t.id || t._id;
        const name = t.name || `${t.firstName ?? ""} ${t.lastName ?? ""}`.trim() || "Unknown";
        const ovr = t.overallRating ?? t.ovr;
        return (
          <button
            type="button"
            key={id}
            className={`media-target-card${String(selectedId) === String(id) ? " selected" : ""}`}
            onClick={() => onSelect(id)}
          >
            <div className="media-target-head">
              <span className="media-target-name">{name}</span>
              {t.hasBeef && <span className="media-target-chip beef"><Flame size={10} /> Beef</span>}
              {t.hasRespect && <span className="media-target-chip respect"><Heart size={10} /> Respect</span>}
            </div>
            <div className="media-target-meta">
              {ovr != null && <span>OVR {ovr}</span>}
              <span>{recordStr(t.record)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
