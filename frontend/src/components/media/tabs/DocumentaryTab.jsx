import { useCallback, useState } from "react";
import { Video, Lock, Coins, Star, Clock } from "lucide-react";
import { api } from "../../../api";

// Local label/description maps — backend sends bare enum keys.
const FOCUS = [
  { key: "FIGHTER",    name: "The Fighter",   desc: "Your fighting journey. Broad fame appeal." },
  { key: "UNDERDOG",   name: "The Underdog",  desc: "Losses and comebacks. More cash payout." },
  { key: "TECHNICIAN", name: "The Technician",desc: "Gym mastery focus. Unlocks special perk." },
];
const TONE = [
  { key: "INSPIRATIONAL", name: "Inspirational", desc: "Casual fans. Broad fame reach." },
  { key: "RAW",           name: "Raw & Honest",  desc: "Hardcore fans. Deeper fame bonus." },
  { key: "CONTROVERSIAL", name: "Controversial", desc: "Big spike. Creates one Beef flag." },
];
const TIMING = [
  { key: "NOW",          name: "Release now",      desc: "Immediate standard reward." },
  { key: "BEFORE_TITLE", name: "Before title shot",desc: "Amplified if you win the belt." },
  { key: "AFTER_TITLE",  name: "After title win",  desc: "Maximum reward. Must win first." },
];

const LABEL = {};
[...FOCUS, ...TONE, ...TIMING].forEach((o) => { LABEL[o.key] = o.name; });

// Backend DOCUMENTARY_PENDING_MAX_FIGHTS — a pending doc falls back to base after this many fights.
const PENDING_MAX_FIGHTS = 10;

function StepColumn({ num, title, options, value, onPick, readOnly }) {
  return (
    <div className={`media-doc-step${value ? " act" : ""}`}>
      <div className="media-doc-step-num">Step {num} of 3</div>
      <div className="media-doc-step-title">{title}</div>
      <div className="media-doc-opts">
        {options.map((o) => (
          <div
            key={o.key}
            className={`media-doc-opt${value === o.key ? " sel" : ""}`}
            onClick={() => { if (!readOnly) onPick(o.key); }}
          >
            <div className="media-doc-opt-name">{o.name}</div>
            <div className="media-doc-opt-desc">{o.desc}</div>
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

  const submit = useCallback(async () => {
    if (!fighterId || !focus || !tone || !timing) return;
    setBusy(true);
    try {
      const res = await api.recordDocumentary(fighterId, { focus, tone, timing });
      const r = res.reward || {};
      const bits = [];
      if (r.fame) bits.push(`+${r.fame} fame`);
      if (r.cash) bits.push(`+$${r.cash}`);
      onMessage?.(`Documentary recorded — ${bits.join(" · ") || "done"}${r.deferred ? " (reward deferred)" : ""}`);
      if (onRefreshFighter && fighterId) await onRefreshFighter(fighterId);
      await onAfterAction?.();
      setWizard(false);
    } catch (e) {
      onMessage?.(e.message || "Could not record the documentary.");
    } finally {
      setBusy(false);
    }
  }, [fighterId, focus, tone, timing, onMessage, onRefreshFighter, onAfterAction]);

  // ── LOCKED ──
  if (status === "locked") {
    const prog = doc.progress || { current: 0, needed: doc.unlockThreshold || 0, percent: 0 };
    return (
      <div className="media-pane">
        <div className="media-doc-locked">
          <div className="media-doc-icon"><Video size={24} /></div>
          <div className="media-doc-info">
            <div className="media-doc-title">Career Documentary — Locked</div>
            <div className="media-doc-desc">
              A production company wants to tell your story. Unlocks at {(doc.unlockTier || "Star")
                .replace("_", " ").toLowerCase()} fame tier. One time only — pick your moment.
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
          <div className="media-slbl media-slbl--muted">Preview — three decisions you'll make when it unlocks</div>
          <div className="media-doc-steps">
            <StepColumn num={1} title="Focus" options={FOCUS} value={FOCUS[0].key} readOnly />
            <StepColumn num={2} title="Tone" options={TONE} value={TONE[1].key} readOnly />
            <StepColumn num={3} title="Release timing" options={TIMING} value={TIMING[2].key} readOnly />
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
            <div className="media-doc-title">Career Documentary — Released</div>
            <div className="media-doc-memorial-choices">
              {LABEL[choices.focus] || choices.focus} · {LABEL[choices.tone] || choices.tone} · {LABEL[choices.timing] || choices.timing}
            </div>
            <div className="media-doc-memorial-reward">
              {reward.fame ? <span className="media-reward-chip gold"><Star size={11} /> +{reward.fame} fame</span> : null}
              {reward.cash ? <span className="media-reward-chip green"><Coins size={11} /> +${reward.cash}</span> : null}
              {reward.boosterGranted ? <span className="media-reward-chip">Booster granted</span> : null}
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
                Reward deferred — releases {pending?.timing ? (LABEL[pending.timing] || pending.timing) : "later"}
                {remaining != null && ` · ${remaining} fight${remaining === 1 ? "" : "s"} remaining`}
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
            <div className="media-doc-title">Career Documentary — Available</div>
            <div className="media-doc-desc">
              A production company is ready to roll. One time only — three decisions shape the final cut.
            </div>
            <button type="button" className="media-record-btn" onClick={() => setWizard(true)}>
              Begin Documentary
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
      <div className="media-slbl">Make your three calls</div>
      <div className="media-doc-steps">
        <StepColumn num={1} title="Focus" options={FOCUS} value={focus} onPick={setFocus} />
        <StepColumn num={2} title="Tone" options={TONE} value={tone} onPick={setTone} />
        <StepColumn num={3} title="Release timing" options={TIMING} value={timing} onPick={setTiming} />
      </div>
      <div className="media-record-row">
        <button type="button" className="media-mini-btn" onClick={() => setWizard(false)} disabled={busy}>Cancel</button>
        <button type="button" className="media-record-btn" disabled={!ready || busy} onClick={submit}>
          {busy ? "Recording…" : "Confirm & Record"}
        </button>
        {!ready && <span className="media-record-hint">Pick one option per step.</span>}
      </div>
    </div>
  );
}
