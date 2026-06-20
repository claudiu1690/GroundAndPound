import { useCallback, useEffect, useState } from "react";
import { Flame, Heart } from "lucide-react";
import { api } from "../../api";
import { t } from "@/lib/i18n";

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
      setError(e.message || t("media.targetPicker.error"));
      setTargets(null);
    } finally {
      setLoading(false);
    }
  }, [fighterId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="media-target-state">{t("media.targetPicker.loading")}</div>;
  if (error) {
    return (
      <div className="media-target-state media-target-state--error">
        {error}
        <button type="button" className="media-mini-btn" onClick={load}>{t("common.retry")}</button>
      </div>
    );
  }
  if (!targets || targets.length === 0) {
    return <div className="media-target-state">{t("media.targetPicker.empty")}</div>;
  }

  return (
    <div className="media-target-grid">
      {targets.map((target) => {
        const id = target.opponentId || target.id || target._id;
        const name = target.name || `${target.firstName ?? ""} ${target.lastName ?? ""}`.trim() || "Unknown";
        const ovr = target.overallRating ?? target.ovr;
        return (
          <button
            type="button"
            key={id}
            className={`media-target-card${String(selectedId) === String(id) ? " selected" : ""}`}
            onClick={() => onSelect(id)}
          >
            <div className="media-target-head">
              <span className="media-target-name">{name}</span>
              {target.hasBeef && <span className="media-target-chip beef"><Flame size={10} /> {t("media.targetPicker.chipBeef")}</span>}
              {target.hasRespect && <span className="media-target-chip respect"><Heart size={10} /> {t("media.targetPicker.chipRespect")}</span>}
            </div>
            <div className="media-target-meta">
              {ovr != null && <span>OVR {ovr}</span>}
              <span>{recordStr(target.record)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
