import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { t } from "@/lib/i18n";

/**
 * Flavor text shown on the DONE state, with 3 variants per tone so the press
 * conference doesn't read identically every fight. Placeholders:
 *   {opp}    → the opponent just fought
 *   {target} → the call-out target (CALLOUT tone only)
 *
 * Variants are picked deterministically from the fight ID, so refreshing or
 * re-rendering the page shows the same line — but a different fight rolls a
 * different one.
 */
const INTERVIEW_VARIANTS = {
    HUMBLE: [
        {
            headline: "You took the humble route.",
            quote: `"Respect to {opp}. Hell of a fight. I'll be back stronger next time."`,
        },
        {
            headline: "You gave respect at the mic.",
            quote: `"That was a war. {opp} brought it tonight. I'd run it back any day."`,
        },
        {
            headline: "Class act on the post-fight mic.",
            quote: `"All credit to {opp}. Tough as nails. The division's better with them in it."`,
        },
    ],
    CONFIDENT: [
        {
            headline: "You owned the moment.",
            quote: `"Like I told you all — I'm built for this. Bring me whoever's next."`,
        },
        {
            headline: "You walked into the cameras tall.",
            quote: `"Y'all saw it. I do this. Line them up, I'll knock them down."`,
        },
        {
            headline: "You let the division hear you.",
            quote: `"This is my house now. Anyone in the top five — pull up. The throne's coming."`,
        },
    ],
    CALLOUT: [
        {
            headline: "You called out {target}.",
            quote: `"{target}, you're next. I'm coming for you. Stop ducking."`,
        },
        {
            headline: "You put {target} on notice.",
            quote: `"You watching, {target}? Quit dancing around me. Sign the contract."`,
        },
        {
            headline: "You aimed straight at {target}.",
            quote: `"Everyone's been waiting for this fight. {target} — me and you. Make it happen."`,
        },
    ],
    SKIPPED: [
        {
            headline: "You waved off the press.",
            quote: `You walked past the mics without a word. Let the work speak.`,
        },
        {
            headline: "You skipped the cameras.",
            quote: `No statement, no soundbite — just a towel over your shoulder and out the back door.`,
        },
        {
            headline: "You declined the post-fight interview.",
            quote: `You shook the cornerman's hand, ignored the mic, and headed for the locker room.`,
        },
    ],
};

/**
 * Deterministic 0..n-1 index from a string. Same fight ID → same variant index,
 * different fights → effectively-random pick. Tiny FNV-1a-ish hash.
 */
function pickVariant(seed, n) {
    if (!seed || !n) return 0;
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h % n;
}

/** Mechanical consequence text — unchanged across variants (it's flag rules, not flavor). */
function consequenceFor(choice, opponentName, targetName) {
    if (choice === "HUMBLE") {
        return opponentName
            ? `Respect flag placed on ${opponentName} — if you face them again within 6 fights and win, that purse pays +15% cash.`
            : `Respect flag placed. Win the rematch within 6 fights for +15% cash.`;
    }
    if (choice === "CONFIDENT") {
        return `Pure fame. No flags, no strings attached.`;
    }
    if (choice === "CALLOUT") {
        return targetName
            ? `Beef flag placed on ${targetName} — beat them within 4 fights for +30% fame on the win. Avoid them and you lose 150 fame.`
            : `Beef flag placed. Beat them within 4 fights for +30% fame.`;
    }
    if (choice === "SKIPPED") {
        return `No fame, no flags. Save it for next time.`;
    }
    return null;
}

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
    initialResult,       // if the interview is already resolved (e.g. after a re-render),
                         // start in DONE state with this payload instead of the tone picker.
    onResolved,          // (result) => void
    onSkipped,           // () => void
    onMessage,           // (msg) => void — show toast-style feedback
}) {
    const [mode, setMode] = useState(initialResult ? "DONE" : "PICK_TONE"); // PICK_TONE | PICK_TARGET | DONE
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(initialResult || null);

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
        const variant = pickVariant(fightId, INTERVIEW_VARIANTS[choice]?.length || 1);
        const v = INTERVIEW_VARIANTS[choice]?.[variant] || {};

        // Substitute names into the variant strings ({opp} → opponent, {target} → callout target).
        const fill = (s) => s
            ? s.replace(/\{opp\}/g, opponentName || "your opponent")
               .replace(/\{target\}/g, targetName || "them")
            : null;

        const headline    = fill(v.headline) || "Interview on the books.";
        const quote       = fill(v.quote);
        const consequence = consequenceFor(choice, opponentName, targetName);

        return (
            <section className="interview-section pfi-done" data-tut="post-fight-interview">
                <header className="pfi-done-header">
                    <div className="pfi-done-headline">{headline}</div>
                    {result.fameDelta > 0 && (
                        <span className="pfi-done-delta">+{result.fameDelta} fame</span>
                    )}
                </header>
                {quote && <blockquote className="pfi-done-quote">{quote}</blockquote>}
                {consequence && <p className="pfi-done-consequence">{consequence}</p>}
            </section>
        );
    }

    if (mode === "PICK_TARGET") {
        return (
            <section className="interview-section" data-tut="post-fight-interview">
                <header className="pfi-header">
                    <h3 className="pfi-title">{t("fights.interview.pickTargetTitle")}</h3>
                    <button
                        type="button"
                        className="pfi-back"
                        onClick={() => { setSelectedTarget(null); setMode("PICK_TONE"); }}
                    >
                        {t("fights.interview.back")}
                    </button>
                </header>

                <p className="pfi-hint">
                    {t("fights.interview.pickTargetHint")}
                </p>

                {candidatesLoading && (
                    <div className="pfi-empty">{t("fights.interview.loadingRoster")}</div>
                )}
                {!candidatesLoading && candidates.length === 0 && (
                    <div className="pfi-empty">
                        {t("fights.interview.emptyCandidates")}
                    </div>
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
                        {submitting ? t("fights.interview.goingOnAir") : selectedTarget ? t("fights.interview.trashTalkBtn", { name: selectedTarget.name }) : t("fights.interview.selectFighter")}
                    </button>
                </div>
            </section>
        );
    }

    // PICK_TONE (default)
    return (
        <section className="interview-section" data-tut="post-fight-interview">
            <header className="interview-header">
                <h3 className="interview-title">{t("fights.interview.pickToneTitle")}</h3>
                <button type="button" className="interview-skip" onClick={skip} disabled={submitting}>
                    {t("fights.interview.skipInterview")}
                </button>
            </header>
            <p className="interview-sub">
                {opponentName ? t("fights.interview.subWithOpponent", { name: opponentName }) : t("fights.interview.subNoOpponent")}
            </p>

            <div className="interview-grid">
                <button
                    type="button"
                    className="interview-card interview-card--humble"
                    onClick={() => submit("HUMBLE")}
                    disabled={submitting}
                >
                    <div className="interview-name">{t("fights.interview.humbleName")}</div>
                    <div className="interview-desc">{t("fights.interview.humbleDesc")}</div>
                    <div className="interview-fame">{t("fights.interview.humbleFame")}</div>
                    <div className="interview-consequence">
                        {t("fights.interview.humbleConsequence")}
                    </div>
                </button>

                <button
                    type="button"
                    className="interview-card interview-card--confident"
                    onClick={() => submit("CONFIDENT")}
                    disabled={submitting}
                >
                    <div className="interview-name">{t("fights.interview.confidentName")}</div>
                    <div className="interview-desc">{t("fights.interview.confidentDesc")}</div>
                    <div className="interview-fame">{t("fights.interview.confidentFame")}</div>
                    <div className="interview-consequence interview-consequence--muted">
                        {t("fights.interview.confidentConsequence")}
                    </div>
                </button>

                <button
                    type="button"
                    className="interview-card interview-card--trash"
                    onClick={() => setMode("PICK_TARGET")}
                    disabled={submitting}
                >
                    <div className="interview-name">{t("fights.interview.trashTalkName")}</div>
                    <div className="interview-desc">{t("fights.interview.trashTalkDesc")}</div>
                    <div className="interview-fame">{t("fights.interview.trashTalkFame")}</div>
                    <div className="interview-consequence">
                        {t("fights.interview.trashTalkConsequence")}
                    </div>
                </button>
            </div>
        </section>
    );
}
