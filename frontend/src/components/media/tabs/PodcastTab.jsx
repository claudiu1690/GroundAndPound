import { useCallback, useMemo, useState } from "react";
import { Mic, Lock, Disc3, CalendarDays, Flame, Heart } from "lucide-react";
import { api } from "../../../api";
import { segmentMeta, formatListeners, daysAgo } from "../mediaFormat";
import { TargetPicker } from "../TargetPicker";
import { t } from "@/lib/i18n";

/** Build the reward label string straight from the catalog row. */
function rewardLabel(seg) {
  const parts = [];
  if (seg.fame) parts.push(`+${seg.fame} fame`);
  if (seg.cash) parts.push(`+$${seg.cash}`);
  if (parts.length === 0) return "+fame";
  return parts.join(" ");
}

function rewardColor(seg) {
  if (seg.cash && !seg.fame) return "var(--c-green, #3A9A4A)";
  return segmentMeta(seg.flag).color;
}

function SegmentCard({ seg, selected, disabled, onToggle, children }) {
  const meta = segmentMeta(seg.flag);
  const { Icon } = meta;
  const locked = !seg.available;
  return (
    <div
      className={`media-seg-card${selected ? " selected" : ""}${locked ? " locked" : ""}`}
      onClick={() => { if (!locked && !disabled) onToggle(); }}
      title={locked ? seg.lockReason || "Locked" : undefined}
    >
      <div className="media-seg-stripe" style={{ background: meta.color }} />
      <div className="media-seg-body">
        <div className="media-seg-top">
          <div className="media-seg-name">{seg.name}</div>
          <span className="media-seg-reward" style={{ color: rewardColor(seg) }}>{rewardLabel(seg)}</span>
        </div>
        {seg.description && <div className="media-seg-desc">{seg.description}</div>}
        {locked ? (
          <span className="media-seg-tag lock"><Lock size={10} /> {seg.lockReason || "Locked"}</span>
        ) : (
          <span className={`media-seg-tag ${meta.tagClass}`}><Icon size={10} /> {meta.tagLabel}</span>
        )}
        {children}
      </div>
    </div>
  );
}

const GUEST_TONES = [
  { key: "TRASH", labelKey: "media.podcast.toneBeef", Icon: Flame },
  { key: "RESPECT", labelKey: "media.podcast.toneRespect", Icon: Heart },
];

export function PodcastTab({ fighter, hub, onMessage, onRefreshFighter, onNavigate, onAfterAction }) {
  const fighterId = fighter?._id;
  const podcast = hub?.podcast || {};
  const segments = podcast.segments || [];
  const canRecord = !!podcast.canRecord;

  const [selected, setSelected] = useState([]); // segment keys
  // Per-segment target/tone choices: { [segKey]: { opponentId, tone } }
  const [targets, setTargets] = useState({});
  const [busy, setBusy] = useState(false);

  const toggle = useCallback((key, available) => {
    if (!available) return;
    setSelected((prev) => {
      if (prev.includes(key)) {
        setTargets((t) => { const n = { ...t }; delete n[key]; return n; });
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 2) return prev;
      return [...prev, key];
    });
  }, []);

  const setTarget = useCallback((key, patch) => {
    setTargets((t) => ({ ...t, [key]: { ...(t[key] || {}), ...patch } }));
  }, []);

  // Which selected segments still need a target.
  const needsTarget = useMemo(
    () => segments.filter((s) => selected.includes(s.key) && s.needsTarget),
    [segments, selected]
  );
  const allTargetsSet = needsTarget.every((s) => {
    const t = targets[s.key];
    if (!t?.opponentId) return false;
    // GUEST also requires a tone (TRASH/RESPECT) — backend rejects without it.
    if (s.key === "GUEST" && t.tone !== "TRASH" && t.tone !== "RESPECT") return false;
    return true;
  });
  // Both targeting segments can't aim at the same fighter (backend rejects it too).
  const duplicateTarget = useMemo(() => {
    const ids = needsTarget.map((s) => targets[s.key]?.opponentId).filter(Boolean);
    return ids.length === 2 && String(ids[0]) === String(ids[1]);
  }, [needsTarget, targets]);
  const readyToRecord = canRecord && selected.length === 2 && allTargetsSet && !duplicateTarget && !busy;

  const record = useCallback(async () => {
    if (!fighterId || !readyToRecord) return;
    setBusy(true);
    try {
      const body = { segments: [...selected], targets: {} };
      for (const s of needsTarget) {
        const t = targets[s.key];
        body.targets[s.key] = { opponentId: t.opponentId };
        if (t.tone) body.targets[s.key].tone = t.tone;
      }
      const res = await api.recordPodcast(fighterId, body);
      const ep = res.episode || {};
      const reward = [];
      if (ep.fameEarned) reward.push(`+${ep.fameEarned} fame`);
      if (ep.cashEarned) reward.push(`+$${ep.cashEarned}`);
      onMessage?.(`${ep.title || `Episode ${ep.episodeNumber}`} recorded — ${reward.join(" · ") || "aired"}`);
      setSelected([]);
      setTargets({});
      if (onRefreshFighter && fighterId) await onRefreshFighter(fighterId);
      await onAfterAction?.();
    } catch (e) {
      onMessage?.(e.message || t("media.podcast.recordError"));
    } finally {
      setBusy(false);
    }
  }, [fighterId, readyToRecord, selected, needsTarget, targets, onMessage, onRefreshFighter, onAfterAction]);

  const listeners = podcast.listenersFormatted
    ?? formatListeners(hub?.listeners ?? hub?.listenersFormatted ?? 0);
  const epNum = podcast.nextEpisodeNumber ?? (podcast.episodeCount ?? 0) + 1;
  const last = podcast.lastEpisode;

  let recordHint;
  if (!canRecord) recordHint = t("media.podcast.hintAlreadyRecorded");
  else if (selected.length < 2) recordHint = t("media.podcast.hintSegmentCount", { n: selected.length, energy: podcast.energyCost ?? 0 });
  else if (!allTargetsSet) recordHint = t("media.podcast.hintNeedTarget");
  else if (duplicateTarget) recordHint = t("media.podcast.hintDuplicateTarget");
  else recordHint = t("media.podcast.hintReady", { energy: podcast.energyCost ?? 0 });

  return (
    <div className="media-pane">
      {/* Header */}
      <div className="media-pod-header">
        <div className="media-pod-avatar"><Mic size={24} /></div>
        <div className="media-pod-info">
          <div className="media-pod-name">{podcast.podcastName || t("media.podcast.podcastNameFallback")}</div>
          <div className="media-pod-meta">
            <span className="media-pod-listeners"><span>{listeners}</span> {t("media.podcast.listenersLabel")}</span>
            <span className="media-pod-sep">·</span>
            <span>{t("media.podcast.episodeLabel", { n: epNum })} · {canRecord ? t("media.podcast.readyToRecord") : t("media.podcast.recordedToday")}</span>
          </div>
        </div>
        {canRecord
          ? <span className="media-pod-ready">{t("media.podcast.readyToday")}</span>
          : <span className="media-pod-used">{t("media.podcast.used")}</span>}
      </div>

      {/* Segments */}
      <div>
        <div className="media-slbl">{t("media.podcast.pickSegments")}</div>
        <div className="media-segments-grid">
          {segments.map((seg) => {
            const isSel = selected.includes(seg.key);
            const isGuest = seg.key === "GUEST";
            return (
              <SegmentCard
                key={seg.key}
                seg={seg}
                selected={isSel}
                disabled={busy}
                onToggle={() => toggle(seg.key, seg.available)}
              >
                {isSel && seg.needsTarget && (
                  <div className="media-seg-target" onClick={(e) => e.stopPropagation()}>
                    {isGuest && (
                      <div className="media-tone-row">
                        {GUEST_TONES.map(({ key, labelKey, Icon }) => (
                          <button
                            type="button"
                            key={key}
                            className={`media-tone-btn${targets[seg.key]?.tone === key ? " sel" : ""}`}
                            onClick={() => setTarget(seg.key, { tone: key })}
                          >
                            <Icon size={11} /> {t(labelKey)}
                          </button>
                        ))}
                      </div>
                    )}
                    <TargetPicker
                      fighterId={fighterId}
                      selectedId={targets[seg.key]?.opponentId}
                      onSelect={(opponentId) => setTarget(seg.key, { opponentId })}
                    />
                  </div>
                )}
              </SegmentCard>
            );
          })}
        </div>
      </div>

      {/* Record row */}
      <div className="media-record-row">
        <button type="button" className="media-record-btn" disabled={!readyToRecord} onClick={record}>
          <Disc3 size={14} /> {busy ? t("media.podcast.recording") : t("media.podcast.recordBtn", { n: epNum })}
        </button>
        <span className="media-record-hint">{recordHint}</span>
      </div>

      {/* Last episode */}
      {last && (
        <div className="media-last-ep">
          <div className="media-last-ep-lbl">{t("media.podcast.lastEpisodeLabel")}</div>
          <div className="media-last-ep-row">
            <div className="media-last-ep-main">
              <div className="media-last-ep-title">{t("media.podcast.lastEpTitleFmt", { n: last.episodeNumber, title: last.title })}</div>
              <div className="media-last-ep-sub">
                {(last.segments || []).join(" · ")}
                {last.listenersAtTime != null && ` · ${formatListeners(last.listenersAtTime)} listeners`}
              </div>
            </div>
            <div className="media-last-ep-right">
              <div className="media-last-ep-reward">
                {last.fameEarned ? `+${last.fameEarned} fame` : ""}
                {last.cashEarned ? ` +$${last.cashEarned}` : ""}
              </div>
              <div className="media-last-ep-time">
                {(() => {
                  const d = daysAgo(last.recordedAt);
                  if (d === 0) return t("media.podcast.todayLabel");
                  return d === 1
                    ? t("media.podcast.daysAgoLabel", { n: d })
                    : t("media.podcast.daysAgoLabelPlural", { n: d });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
