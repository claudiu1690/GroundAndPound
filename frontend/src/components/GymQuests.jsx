import { useState, useEffect, useCallback, memo } from "react";
import { api } from "../api";

export const GymQuests = memo(function GymQuests({ fighter, gymId }) {
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!fighter?._id || !gymId) return;
    setLoading(true);
    try {
      const data = await api.getGymQuests(fighter._id, gymId);
      setQuests(Array.isArray(data) ? data : []);
    } catch (_) {}
    setLoading(false);
  }, [fighter?._id, gymId]);

  useEffect(() => { load(); }, [load]);

  if (!fighter || !gymId) return null;

  return (
    <section className="panel gym-quests">
      <h2 className="panel-title">Gym Quests</h2>
      <div className="panel-body">
        {loading && <p className="panel-hint">Loading quests…</p>}
        {!loading && quests.length === 0 && (
          <p className="panel-hint">No quests available at this gym yet. Train here to unlock progress.</p>
        )}
        <div className="quests-grid">
          {quests.map((q) => {
            const isLocked = q.status === "locked";
            const isDone = q.status === "completed";
            return (
              <div
                key={q.questId}
                className={`quest-item${isDone ? " quest-item-completed" : ""}`}
                style={isLocked ? { opacity: 0.5 } : undefined}
              >
                <div className="quest-header">
                  <span className="quest-title">{q.title}</span>
                  {isDone && <span className="quest-badge quest-badge-done">✓ Done</span>}
                  {isLocked && <span className="quest-badge" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>🔒 Locked</span>}
                  {!isDone && !isLocked && <span className="quest-badge quest-badge-active">Active</span>}
                </div>
                <p className="quest-description">{q.description}</p>
                {isLocked && q.requiresQuest && (
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                    Requires: complete the previous quest first.
                  </p>
                )}
                {!isLocked && (
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
          })}
        </div>
      </div>
    </section>
  );
});
