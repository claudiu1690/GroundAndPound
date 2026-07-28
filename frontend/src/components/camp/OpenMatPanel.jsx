import { memo } from "react";
import { Swords } from "lucide-react";
import { t } from "@/lib/i18n";
import { Tip } from "./Tip";
import { injuryToneClass, dropToneClass, conditionDeltaToneClass } from "./campConstants";

/**
 * The no-coach fallback session — always available, solid/available-looking
 * per the approved mock (NOT dashed/dimmed like a locked option). Button is
 * labelled "Spar", not "Train Alone".
 */
export const OpenMatPanel = memo(function OpenMatPanel({ session, busy, batchMode = "1", fighter, onTrain }) {
  if (!session) return null;

  // Same batch resolution as coach drills (owner pick 06-V1): ×N clamped by
  // energy and the API's 25-session cap; MAX = as many as energy allows.
  const energyCurrent = fighter?.energy?.current ?? fighter?.energy ?? 0;
  const affordable = session.energy > 0 ? Math.floor(energyCurrent / session.energy) : 1;
  const cap = Math.min(25, Math.max(1, affordable));
  const qty = batchMode === "max" ? cap : Math.min(Number(batchMode) || 1, cap);
  return (
    <div className="yc-fallback-panel">
      <div className="yc-fallback-left">
        <div className="yc-fallback-icon"><Swords size={15} /></div>
        <div>
          <div className="yc-fallback-title">
            {session.name} <span className="yc-energy-chip" style={{ marginLeft: 6 }}>⚡ {session.energy}</span>
          </div>
          <div className="yc-fallback-sub">{session.description}</div>

          {/* Same readouts as a coach drill — this is a real trainable session,
              so it must show what it costs and what it can pay out. */}
          <div className="yc-drill-metrics yc-fallback-metrics">
            <div className="yc-dmetric">
              <Tip text={t("yourCamp.drill.injuryTip")} className="yc-dmetric-lbl">
                {t("yourCamp.drill.injuryLabel")}
              </Tip>
              <span className={`yc-dmetric-val ${injuryToneClass(session.injuryPct)}`}>
                {session.injuryPct}%
              </span>
            </div>
            <div className="yc-dmetric">
              <Tip text={t("yourCamp.openMat.dropTip")} className="yc-dmetric-lbl">
                {t("yourCamp.drill.dropLabel")}
              </Tip>
              {session.dropPct
                ? <span className={`yc-dmetric-val ${dropToneClass(session.dropPct)}`}>{session.dropPct}%</span>
                : <span className="yc-dmetric-val dash">—</span>}
            </div>
            <div className="yc-dmetric">
              <Tip text={t("yourCamp.drill.conditionTip")} className="yc-dmetric-lbl">
                {t("yourCamp.drill.conditionLabel")}
              </Tip>
              <span className={`yc-dmetric-val ${conditionDeltaToneClass(session.condDelta)}`}>
                {session.condDelta > 0 ? `+${session.condDelta}` : session.condDelta}
              </span>
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="yc-btn-train-ghost"
        disabled={!session.canTrain || busy}
        title={!session.canTrain ? (session.blockedReason || undefined) : undefined}
        onClick={() => onTrain(qty)}
      >
        {busy
          ? "…"
          : qty > 1
            ? t("yourCamp.openMat.sparBatch", { qty, energy: session.energy * qty })
            : t("yourCamp.openMat.spar")}
      </button>
    </div>
  );
});
