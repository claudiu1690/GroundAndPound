import { useCallback, useEffect, useState } from "react";
import { Video, Lock, Coins, Star, Clock } from "lucide-react";
import { api } from "../../../api";
import { PersonaNudgeChip } from "../PersonaNudgeChip";
import { PersonaPreviewPill } from "../PersonaPreviewPill";
import { usePersonaPreview } from "../../../hooks/usePersonaPreview";
import { emitPersonaMoments } from "../personaMoments";
import { t } from "@/lib/i18n";

// Local label/description maps — backend sends bare enum keys.
// Names and descs are now resolved via i18n at render time.
const FOCUS = [
  { key: "FIGHTER",    nameKey: "media.documentary.focusOptions.FIGHTER",    descKey: "media.documentary.focusDescs.FIGHTER" },
  { key: "UNDERDOG",   nameKey: "media.documentary.focusOptions.UNDERDOG",   descKey: "media.documentary.focusDescs.UNDERDOG" },
  { key: "TECHNICIAN", nameKey: "media.documentary.focusOptions.TECHNICIAN", descKey: "media.documentary.focusDescs.TECHNICIAN" },
];
const TONE = [
  { key: "INSPIRATIONAL", nameKey: "media.documentary.toneOptions.INSPIRATIONAL", descKey: "media.documentary.toneDescs.INSPIRATIONAL" },
  { key: "RAW",           nameKey: "media.documentary.toneOptions.RAW",           descKey: "media.documentary.toneDescs.RAW" },
  { key: "CONTROVERSIAL", nameKey: "media.documentary.toneOptions.CONTROVERSIAL", descKey: "media.documentary.toneDescs.CONTROVERSIAL" },
];
const TIMING = [
  { key: "NOW",          nameKey: "media.documentary.timingOptions.NOW",          descKey: "media.documentary.timingDescs.NOW" },
  { key: "BEFORE_TITLE", nameKey: "media.documentary.timingOptions.BEFORE_TITLE", descKey: "media.documentary.timingDescs.BEFORE_TITLE" },
  { key: "AFTER_TITLE",  nameKey: "media.documentary.timingOptions.AFTER_TITLE",  descKey: "media.documentary.timingDescs.AFTER_TITLE" },
];

// Backend DOCUMENTARY_PENDING_MAX_FIGHTS — a pending doc falls back to base after this many fights.
const PENDING_MAX_FIGHTS = 10;

/** Resolve a backend enum key to its localised name, falling back to the raw key. */
function docLabel(key) {
  const all = [...FOCUS, ...TONE, ...TIMING];
  const entry = all.find((o) => o.key === key);
  return entry ? t(entry.nameKey) : (key || "");
}

// Focus/tone options are hardcoded locally (the backend doesn't echo them in
// a catalog array the way podcast segments/appearances are), but it does send
// the per-option nudge maps on the hub payload: `documentary.focusNudges` /
// `documentary.toneNudges`, each `{ [key]: {dx,dy,quadrant} }`. Timing has no
// nudge — the backend doesn't send one. `nudges` is an optional
// key->{dx,dy,quadrant} map; when absent, options render exactly as before
// (no chip, no crash).
function StepColumn({ num, titleKey, options, value, onPick, readOnly, nudges }) {
  return (
    <div className={`media-doc-step${value ? " act" : ""}`}>
      <div className="media-doc-step-num">{t("media.documentary.stepLabel", { n: num })}</div>
      <div className="media-doc-step-title">{t(titleKey)}</div>
      <div className="media-doc-opts">
        {options.map((o) => (
          <div
            key={o.key}
            className={`media-doc-opt${value === o.key ? " sel" : ""}`}
            onClick={() => { if (!readOnly) onPick(o.key); }}
          >
            <div className="media-doc-opt-name">{t(o.nameKey)}</div>
            <div className="media-doc-opt-desc">{t(o.descKey)}</div>
            {nudges?.[o.key] && (
              <div className="media-doc-opt-nudge"><PersonaNudgeChip nudge={nudges[o.key]} /></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocumentaryTab({ fighter, hub, onMessage, onRefreshFighter, onAfterAction }) {
  const fighterId = fighter?._id;
  const doc = hub?.documentary || {};
  const status = doc.status || "locked";

  const [wizard, setWizard] = useState(false);
  const [focus, setFocus] = useState(null);
  const [tone, setTone] = useState(null);
  const [timing, setTiming] = useState(null);
  const [busy, setBusy] = useState(false);

  // Persona preview — the preview endpoint only takes {focus,tone} for the
  // documentary (timing doesn't affect persona resolution per the contract),
  // so fire once both are picked.
  const { preview: personaPreview, loading: personaPreviewLoading, run: runPersonaPreview, clear: clearPersonaPreview } = usePersonaPreview(fighterId);
  useEffect(() => {
    if (!wizard || !focus || !tone) { clearPersonaPreview(); return; }
    runPersonaPreview({ documentary: { focus, tone } });
  }, [wizard, focus, tone, runPersonaPreview, clearPersonaPreview]);

  const submit = useCallback(async () => {
    if (!fighterId || !focus || !tone || !timing) return;
    setBusy(true);
    try {
      const res = await api.recordDocumentary(fighterId, { focus, tone, timing });
      emitPersonaMoments(res.personaNudge);
      const r = res.reward || {};
      const bits = [];
      if (r.fame) bits.push(`+${r.fame} fame`);
      if (r.cash) bits.push(`+$${r.cash}`);
      onMessage?.(`Documentary recorded — ${bits.join(" · ") || "done"}${r.deferred ? " (reward deferred)" : ""}`);
      clearPersonaPreview();
      if (onRefreshFighter && fighterId) await onRefreshFighter(fighterId);
      await onAfterAction?.();
      setWizard(false);
    } catch (e) {
      onMessage?.(e.message || t("media.documentary.recordError"));
    } finally {
      setBusy(false);
    }
  }, [fighterId, focus, tone, timing, onMessage, onRefreshFighter, onAfterAction, clearPersonaPreview]);

  // ── LOCKED ──
  if (status === "locked") {
    const prog = doc.progress || { current: 0, needed: doc.unlockThreshold || 0, percent: 0 };
    return (
      <div className="media-pane">
        <div className="media-doc-locked">
          <div className="media-doc-icon"><Video size={24} /></div>
          <div className="media-doc-info">
            <div className="media-doc-title">{t("media.documentary.lockedTitle")}</div>
            <div className="media-doc-desc">
              {t("media.documentary.lockedDesc", { tier: (doc.unlockTier || "Star").replace("_", " ").toLowerCase() })}
            </div>
            <div className="media-doc-progress">
              <div className="media-doc-prog-track">
                <div className="media-doc-prog-fill" style={{ width: `${prog.percent ?? 0}%` }} />
              </div>
              <div className="media-doc-prog-lbl">
                <span>{(prog.current ?? 0).toLocaleString()}</span> / {(prog.needed ?? 0).toLocaleString()} fame to unlock
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="media-slbl media-slbl--muted">{t("media.documentary.previewLabel")}</div>
          <div className="media-doc-steps">
            <StepColumn num={1} titleKey="media.documentary.focus" options={FOCUS} value={FOCUS[0].key} readOnly nudges={doc.focusNudges} />
            <StepColumn num={2} titleKey="media.documentary.tone" options={TONE} value={TONE[1].key} readOnly nudges={doc.toneNudges} />
            <StepColumn num={3} titleKey="media.documentary.releaseTiming" options={TIMING} value={TIMING[2].key} readOnly />
          </div>
        </div>
      </div>
    );
  }

  // ── RECORDED (memorial) ──
  if (status === "recorded") {
    const choices = doc.choices || {};
    const reward = doc.reward || {};
    const pending = doc.pending;
    return (
      <div className="media-pane">
        <div className="media-doc-memorial">
          <div className="media-doc-icon"><Video size={24} /></div>
          <div className="media-doc-info">
            <div className="media-doc-title">{t("media.documentary.recordedTitle")}</div>
            <div className="media-doc-memorial-choices">
              {docLabel(choices.focus)} · {docLabel(choices.tone)} · {docLabel(choices.timing)}
            </div>
            <div className="media-doc-memorial-reward">
              {reward.fame ? <span className="media-reward-chip gold"><Star size={11} /> +{reward.fame} fame</span> : null}
              {reward.cash ? <span className="media-reward-chip green"><Coins size={11} /> +${reward.cash}</span> : null}
              {reward.boosterGranted ? <span className="media-reward-chip">{t("media.documentary.boosterGranted")}</span> : null}
            </div>
            {doc.recordedAt && (
              <div className="media-doc-memorial-date">
                Recorded {new Date(doc.recordedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        {(reward.deferred || pending) && (() => {
          const remaining = pending
            ? Math.max(0, PENDING_MAX_FIGHTS - (pending.fightsSince || 0))
            : null;
          return (
            <div className="media-doc-pending">
              <Clock size={14} />
              <span>
                {t("media.documentary.pendingLabel", { timing: pending?.timing ? docLabel(pending.timing) : "later" })}
                {remaining != null && ` · ${remaining === 1 ? t("media.documentary.pendingFightsRemaining", { n: remaining }) : t("media.documentary.pendingFightsRemainingPlural", { n: remaining })}`}
              </span>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── AVAILABLE ──
  if (!wizard) {
    return (
      <div className="media-pane">
        <div className="media-doc-locked media-doc-locked--ready">
          <div className="media-doc-icon"><Video size={24} /></div>
          <div className="media-doc-info">
            <div className="media-doc-title">{t("media.documentary.availableTitle")}</div>
            <div className="media-doc-desc">
              {t("media.documentary.availableDesc")}
            </div>
            <button type="button" className="media-record-btn" onClick={() => setWizard(true)}>
              {t("media.documentary.beginBtn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── WIZARD ──
  const ready = focus && tone && timing;
  return (
    <div className="media-pane">
      <div className="media-slbl">{t("media.documentary.wizardLabel")}</div>
      <div className="media-doc-steps">
        <StepColumn num={1} titleKey="media.documentary.focus" options={FOCUS} value={focus} onPick={setFocus} nudges={doc.focusNudges} />
        <StepColumn num={2} titleKey="media.documentary.tone" options={TONE} value={tone} onPick={setTone} nudges={doc.toneNudges} />
        <StepColumn num={3} titleKey="media.documentary.releaseTiming" options={TIMING} value={timing} onPick={setTiming} />
      </div>

      <PersonaPreviewPill
        loading={personaPreviewLoading}
        preview={personaPreview}
        subjectKey="media.persona.preview.subjects.documentary"
      />

      <div className="media-record-row">
        <button type="button" className="media-mini-btn" onClick={() => setWizard(false)} disabled={busy}>{t("common.cancel")}</button>
        <button type="button" className="media-record-btn" disabled={!ready || busy} onClick={submit}>
          {busy ? t("media.documentary.recordingBusy") : t("media.documentary.confirmRecord")}
        </button>
        {!ready && <span className="media-record-hint">{t("media.documentary.pickHint")}</span>}
      </div>
    </div>
  );
}
