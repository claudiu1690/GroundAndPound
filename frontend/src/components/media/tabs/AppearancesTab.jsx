import { useCallback, useEffect, useState } from "react";
import { Clock, Flame, Heart } from "lucide-react";
import { api } from "../../../api";
import { appearanceMeta, appearanceDescription, refreshesInLabel, daysLeftLabel } from "../mediaFormat";
import { TargetPicker } from "../TargetPicker";
import { t } from "@/lib/i18n";

const GUEST_TONES = [
  { key: "TRASH", labelKey: "media.appearances.toneBeef", Icon: Flame },
  { key: "RESPECT", labelKey: "media.appearances.toneRespect", Icon: Heart },
];

function rewardTags(app) {
  const tags = [];
  if (app.fame) tags.push({ cls: "fame", text: `+${app.fame} fame` });
  if (app.cash) tags.push({ cls: "cash", text: `+$${app.cash} cash` });
  if (app.needsTarget) tags.push({ cls: "beef", text: "Beef or Respect" });
  return tags;
}

function AppearanceCard({ app, fighterId, busy, onTake }) {
  const meta = appearanceMeta(app.type);
  const { Icon } = meta;
  const needsTone = app.type === "PODCAST_GUEST";
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState(null);
  const [targetId, setTargetId] = useState(null);

  const act = () => {
    if (needsTone) {
      if (!open) { setOpen(true); return; }
      onTake(app.instanceId, { tone, targetOpponentId: targetId });
    } else {
      onTake(app.instanceId, {});
    }
  };

  const canSubmit = !needsTone || (!!tone && !!targetId);

  return (
    <div className="media-app-card">
      <div className="media-app-stripe" style={{ background: meta.color }} />
      <div className="media-app-body">
        <div className="media-app-icon" style={{ background: meta.bg, color: meta.color }}>
          <Icon size={16} />
        </div>
        <div className="media-app-info">
          <div className="media-app-name">{app.label}</div>
          <div className="media-app-desc">{appearanceDescription(app.type)}</div>
          <div className="media-app-meta">
            {rewardTags(app).map((t, i) => (
              <span key={i} className={`media-app-reward-tag ${t.cls}`}>{t.text}</span>
            ))}
            {app.expiresAt && (
              <span className="media-app-deadline"><Clock size={11} /> {daysLeftLabel(app.expiresAt)}</span>
            )}
          </div>
          {!app.available && app.lockReason && (
            <div className="media-app-lock">{app.lockReason}</div>
          )}
          {needsTone && open && (
            <div className="media-app-picker">
              <div className="media-tone-row">
                {GUEST_TONES.map(({ key, labelKey, Icon: TIcon }) => (
                  <button
                    type="button"
                    key={key}
                    className={`media-tone-btn${tone === key ? " sel" : ""}`}
                    onClick={() => setTone(key)}
                  >
                    <TIcon size={11} /> {t(labelKey)}
                  </button>
                ))}
              </div>
              <TargetPicker fighterId={fighterId} selectedId={targetId} onSelect={setTargetId} />
            </div>
          )}
        </div>
        <div className="media-app-action">
          <button
            type="button"
            className="media-do-btn"
            disabled={busy || !app.available || (needsTone && open && !canSubmit)}
            title={app.available ? undefined : app.lockReason}
            onClick={act}
          >
            {busy ? t("media.appearances.busyBtn") : (needsTone && open ? t("media.appearances.confirmBtn") : app.actionLabel || t("media.appearances.takeBtn"))}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppearancesTab({ fighter, onMessage, onRefreshFighter }) {
  const fighterId = fighter?._id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!fighterId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await api.getAppearances(fighterId);
      setData(res);
    } catch (e) {
      if (!silent) setError(e.message || t("media.appearances.error"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fighterId]);

  useEffect(() => { load(); }, [load]);

  const take = useCallback(async (instanceId, body) => {
    if (!fighterId || busyId) return;
    setBusyId(instanceId);
    try {
      const res = await api.takeAppearance(fighterId, instanceId, body);
      const bits = [];
      if (res.fameDelta) bits.push(`+${res.fameDelta} fame`);
      if (res.cashDelta) bits.push(`+$${res.cashDelta}`);
      onMessage?.(`Appearance done — ${bits.join(" · ") || "complete"}`);
      // Optimistically remove the row, then resync.
      setData((prev) => prev
        ? { ...prev, appearances: (prev.appearances || []).filter((a) => a.instanceId !== instanceId) }
        : prev);
      if (onRefreshFighter && fighterId) await onRefreshFighter(fighterId);
      await load({ silent: true });
    } catch (e) {
      onMessage?.(e.message || t("media.appearances.takeError"));
    } finally {
      setBusyId(null);
    }
  }, [fighterId, busyId, onMessage, onRefreshFighter, load]);

  if (loading) return <div className="media-pane"><div className="media-state">{t("media.appearances.loading")}</div></div>;
  if (error) {
    return (
      <div className="media-pane">
        <div className="media-state media-state--error">
          {error}
          <button type="button" className="media-mini-btn" onClick={() => load()}>{t("common.retry")}</button>
        </div>
      </div>
    );
  }

  const appearances = data?.appearances || [];

  return (
    <div className="media-pane">
      <div className="media-app-header">
        <div className="media-slbl media-slbl--inline">
          {t("media.appearances.thisWeek", { refreshesIn: refreshesInLabel(data?.refreshesAt) })}
        </div>
        <span className="media-app-count">{t("media.appearances.countAvailable", { n: appearances.length })}</span>
      </div>

      {appearances.length === 0 ? (
        <div className="media-state">{t("media.appearances.empty")}</div>
      ) : (
        <div className="media-app-grid">
          {appearances.map((app) => (
            <AppearanceCard
              key={app.instanceId}
              app={app}
              fighterId={fighterId}
              busy={busyId === app.instanceId}
              onTake={take}
            />
          ))}
        </div>
      )}
    </div>
  );
}
