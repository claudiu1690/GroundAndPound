import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";

/**
 * Post-fight interview step. Renders between FightSummary and the Continue button.
 * Three tones: Humble / Confident / Call Out. Call Out opens a target picker.
 * Skippable. Emits onResolved({ interview, fameDelta }) on success.
 */
export function PostFightInterview({
    fighterId,
    fightId,
    opponentId,          // just-fought opponent (excluded from callout list)
    opponentName,
    onResolved,          // (result) => void
    onSkipped,           // () => void
    onMessage,           // (msg) => void — show toast-style feedback
}) {
    const [mode, setMode] = useState("PICK_TONE"); // PICK_TONE | PICK_TARGET | DONE
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    // Callout roster
    const [candidates, setCandidates] = useState([]);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState(null);

    const loadCandidates = useCallback(async () => {
        if (!fighterId) return;
        setCandidatesLoading(true);
        try {
            const data = await api.getCalloutCandidates(fighterId, opponentId || undefined);
            setCandidates(Array.isArray(data?.candidates) ? data.candidates : []);
        } catch (e) {
            onMessage?.(e.message || "Could not load callout candidates");
            setCandidates([]);
        }
        setCandidatesLoading(false);
    }, [fighterId, opponentId, onMessage]);

    // When switching to the target-picker, fetch candidates once.
    useEffect(() => {
        if (mode === "PICK_TARGET" && candidates.length === 0 && !candidatesLoading) {
            loadCandidates();
        }
    }, [mode, candidates.length, candidatesLoading, loadCandidates]);

    const submit = useCallback(async (choice, targetOpponentId) => {
        if (!fightId || submitting) return;
        setSubmitting(true);
        try {
            const body = { fighterId, choice };
            if (targetOpponentId) body.targetOpponentId = targetOpponentId;
            const res = await api.postInterview(fightId, body);
            setResult(res);
            setMode("DONE");
            onResolved?.(res);
            if (res.fameDelta > 0) {
                onMessage?.(`Interview: ${res.fameReason} (+${res.fameDelta} fame)`);
            } else if (choice === "SKIPPED") {
                onMessage?.("Interview skipped.");
            }
        } catch (e) {
            onMessage?.(e.message || "Interview failed");
        }
        setSubmitting(false);
    }, [fighterId, fightId, submitting, onResolved, onMessage]);

    const skip = useCallback(() => {
        submit("SKIPPED");
        onSkipped?.();
    }, [submit, onSkipped]);

    // ── Views ─────────────────────────────────────────────────────
    if (mode === "DONE" && result) {
        const choice = result.interview?.choice;
        const targetName = result.targetOpponent?.name;
        const text = choice === "SKIPPED"
            ? "You skipped the media."
            : choice === "CALLOUT" && targetName
                ? `You called out ${targetName}.`
                : choice === "HUMBLE"
                    ? "You took the humble route."
                    : choice === "CONFIDENT"
                        ? "You owned the moment."
                        : "Interview on the books.";
        return (
            <section className="pfi-wrap pfi-done">
                <div className="pfi-done-line">🎙 {text}</div>
                {result.fameDelta > 0 && (
                    <div className="pfi-done-delta">+{result.fameDelta} fame</div>
                )}
            </section>
        );
    }

    if (mode === "PICK_TARGET") {
        return (
            <section className="pfi-wrap">
                <header className="pfi-header">
                    <h3 className="pfi-title">Who are you calling out?</h3>
                    <button
                        type="button"
                        className="pfi-back"
                        onClick={() => { setSelectedTarget(null); setMode("PICK_TONE"); }}
                    >
                        ← Back
                    </button>
                </header>

                {candidatesLoading && (
                    <div className="pfi-empty">Loading roster…</div>
                )}
                {!candidatesLoading && candidates.length === 0 && (
                    <div className="pfi-empty">No valid callout targets right now.</div>
                )}

                {!candidatesLoading && candidates.length > 0 && (
                    <div className="pfi-candidates">
                        {candidates.map((c) => {
                            const isSelected = selectedTarget?.id === c.id;
                            return (
                                <button
                                    type="button"
                                    key={c.id}
                                    className={`pfi-candidate ${isSelected ? "pfi-candidate-selected" : ""}`}
                                    onClick={() => setSelectedTarget(c)}
                                >
                                    <div className="pfi-candidate-head">
                                        <span className="pfi-candidate-name">
                                            {c.name}{c.nickname ? ` "${c.nickname}"` : ""}
                                        </span>
                                        {c.isStretch && <span className="pfi-stretch-badge">Tier up</span>}
                                    </div>
                                    <div className="pfi-candidate-meta">
                                        <span>{c.style}</span>
                                        <span>OVR {c.overallRating}</span>
                                        <span>{c.record?.wins ?? 0}-{c.record?.losses ?? 0}-{c.record?.draws ?? 0}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="pfi-actions">
                    <button
                        type="button"
                        className="btn btn-primary pfi-cta"
                        disabled={!selectedTarget || submitting}
                        onClick={() => submit("CALLOUT", selectedTarget.id)}
                    >
                        {submitting ? "Calling out…" : selectedTarget ? `Call out ${selectedTarget.name}` : "Select a fighter"}
                    </button>
                </div>
            </section>
        );
    }

    // PICK_TONE (default)
    return (
        <section className="pfi-wrap">
            <header className="pfi-header">
                <h3 className="pfi-title">Post-Fight Interview</h3>
                <button type="button" className="pfi-skip" onClick={skip} disabled={submitting}>
                    Skip interview →
                </button>
            </header>
            <p className="pfi-prompt">
                {opponentName ? `You've just fought ${opponentName}. ` : ""}Press mic's up. What do you say?
            </p>

            <div className="pfi-tones">
                <button
                    type="button"
                    className="pfi-tone pfi-tone-humble"
                    onClick={() => submit("HUMBLE")}
                    disabled={submitting}
                >
                    <div className="pfi-tone-icon">🙇</div>
                    <div className="pfi-tone-label">Humble</div>
                    <div className="pfi-tone-desc">Pay respect. Take the high road.</div>
                    <div className="pfi-tone-reward">+75 fame</div>
                </button>

                <button
                    type="button"
                    className="pfi-tone pfi-tone-confident"
                    onClick={() => submit("CONFIDENT")}
                    disabled={submitting}
                >
                    <div className="pfi-tone-icon">🔥</div>
                    <div className="pfi-tone-label">Confident</div>
                    <div className="pfi-tone-desc">Take credit. Let the division hear you.</div>
                    <div className="pfi-tone-reward">+150 fame</div>
                </button>

                <button
                    type="button"
                    className="pfi-tone pfi-tone-callout"
                    onClick={() => setMode("PICK_TARGET")}
                    disabled={submitting}
                >
                    <div className="pfi-tone-icon">📣</div>
                    <div className="pfi-tone-label">Call Out</div>
                    <div className="pfi-tone-desc">Name a rival. Put them on notice.</div>
                    <div className="pfi-tone-reward">+200 fame · Beef flag</div>
                </button>
            </div>
        </section>
    );
}
