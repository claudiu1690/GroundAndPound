import { useState, useEffect, useRef, memo, useCallback } from "react";
import { api } from "../api";

/** Shallow compare quest payload for memo — avoids re-rendering unchanged cards after refetch. */
function questPropsEqual(prev, next) {
  if (prev.questId !== next.questId) return false;
  if (prev.title !== next.title) return false;
  if (prev.status !== next.status) return false;
  if (prev.completedAt !== next.completedAt) return false;
  if (prev.description !== next.description) return false;
  if (prev.reward !== next.reward) return false;
  if (prev.requiresQuest !== next.requiresQuest) return false;
  const pc = prev.conditions;
  const nc = next.conditions;
  if (!pc || !nc || pc.length !== nc.length) return false;
  for (let i = 0; i < pc.length; i++) {
    if (pc[i].label !== nc[i].label) return false;
    if (pc[i].current !== nc[i].current) return false;
    if (pc[i].target !== nc[i].target) return false;
    if (pc[i].done !== nc[i].done) return false;
  }
  return true;
}

const QuestItem = memo(
  function QuestItem({ q }) {
    const isPrereqLocked = q.status === "locked";
    const isMembershipLocked = q.status === "membership_locked";
    const isDone = q.status === "completed";
    const dimmed = isPrereqLocked || isMembershipLocked;
    const hideConditions = !isDone && dimmed;
    return (
      <div
        className={`quest-item${isDone ? " quest-item-completed" : ""}`}
        style={dimmed ? { opacity: 0.5 } : undefined}
      >
        <div className="quest-header">
          <span className="quest-title">{q.title}</span>
          {isDone && <span className="quest-badge quest-badge-done">✓ Done</span>}
          {isMembershipLocked && (
            <span className="quest-badge" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
              ⊗ Membership
            </span>
          )}
          {isPrereqLocked && (
            <span className="quest-badge" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
              🔒 Locked
            </span>
          )}
          {!isDone && !dimmed && <span className="quest-badge quest-badge-active">Active</span>}
        </div>
        <p className="quest-description">{q.description}</p>
        {isMembershipLocked && (
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
            Pay monthly membership at this gym to progress these quests.
          </p>
        )}
        {isPrereqLocked && q.requiresQuest && (
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
            Requires: complete the previous quest first.
          </p>
        )}
        {!hideConditions && (
          <div className="quest-conditions">
            {q.conditions.map((c) => (
              <div key={c.label} className="quest-condition">
                <span className="quest-condition-label">{c.label}</span>
                <div className="quest-condition-bar-wrap">
                  <div
                    className="quest-condition-bar"
                    style={{ width: `${Math.min(100, (c.current / c.target) * 100)}%` }}
                  />
                </div>
                <span className={`quest-condition-count ${c.done ? "quest-condition-done" : ""}`}>
                  {c.current} / {c.target}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="quest-reward">Reward: {q.reward}</p>
        {q.completedAt && (
          <p className="quest-completed-at">Completed {new Date(q.completedAt).toLocaleDateString()}</p>
        )}
      </div>
    );
  },
  (a, b) => questPropsEqual(a.q, b.q)
);

export const GymQuests = memo(function GymQuests({ fighter, gymId, refreshKey = 0 }) {
  const [quests, setQuests] = useState([]);
  /** True until the first fetch for the current fighter+gym finishes (not used for post-train refresh). */
  const [initialLoading, setInitialLoading] = useState(true);

  const idsRef = useRef({ fighterId: null, gymId: null });
  idsRef.current = { fighterId: fighter?._id, gymId };

  const prevGymIdRef = useRef(undefined);

  const fetchQuests = useCallback(async () => {
    const { fighterId, gymId: gid } = idsRef.current;
    if (!fighterId || !gid) return [];
    const data = await api.getGymQuests(fighterId, gid);
    return Array.isArray(data) ? data : [];
  }, []);

  /** Gym or fighter changed: show loading only when there is nothing to show yet (avoids flicker on train refresh). */
  useEffect(() => {
    if (!fighter?._id || !gymId) return;
    const gymChanged = prevGymIdRef.current !== undefined && prevGymIdRef.current !== gymId;
    prevGymIdRef.current = gymId;

    let cancelled = false;
    if (gymChanged) setQuests([]);

    const run = async () => {
      setInitialLoading(true);
      try {
        const next = await fetchQuests();
        if (!cancelled) setQuests(next);
      } catch (_) {
        if (!cancelled) setQuests([]);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fighter?._id, gymId, fetchQuests]);

  /** Post-train / pay: silent merge — no loading overlay, no unmounting the grid. */
  useEffect(() => {
    if (refreshKey === 0) return;
    let cancelled = false;
    const run = async () => {
      try {
        const next = await fetchQuests();
        if (!cancelled) setQuests(next);
      } catch (_) {}
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, fetchQuests]);

  if (!fighter || !gymId) return null;

  return (
    <section className="panel gym-quests">
      <h2 className="panel-title">Gym Quests</h2>
      <div className="panel-body">
        {initialLoading && <p className="panel-hint">Loading quests…</p>}
        {!initialLoading && quests.length === 0 && (
          <p className="panel-hint">No quests available at this gym yet. Train here to unlock progress.</p>
        )}
        <div className="quests-grid">
          {quests.map((q) => (
            <QuestItem key={q.questId} q={q} />
          ))}
        </div>
      </div>
    </section>
  );
});
