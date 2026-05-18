import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { tutorialBus } from "../../utils/tutorialBus";
import { TUTORIAL_STEPS } from "../../constants/tutorialSteps";
import { TutorialTooltip } from "./TutorialTooltip";
import { TutorialCompleteModal } from "./TutorialCompleteModal";
import "./tutorial.css";

/** Padding (px) around the focal element when cutting the scrim hole. */
const HOLE_PAD = 8;
/** How long to wait for an absent focal element before skipping (resume safety). */
const SKIP_ABSENT_MS = 3500;
/** Polling interval (ms) for re-measuring focal/anchor element rects. */
const MEASURE_INTERVAL_MS = 120;

/** First DOM element matching any of the given data-tut id(s). */
function resolveEl(idOrArr) {
    if (!idOrArr) return null;
    const ids = Array.isArray(idOrArr) ? idOrArr : [idOrArr];
    for (const id of ids) {
        const el = document.querySelector(`[data-tut="${id}"]`);
        if (el) return el;
    }
    return null;
}

/** Viewport rect of a data-tut element, or null if absent / not laid out. */
function measureEl(idOrArr) {
    const el = resolveEl(idOrArr);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
}

function sameRect(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return Math.abs(a.top - b.top) < 0.5
        && Math.abs(a.left - b.left) < 0.5
        && Math.abs(a.width - b.width) < 0.5
        && Math.abs(a.height - b.height) < 0.5;
}

/**
 * Scrim — the grey overlay. Renders four panels around the focal element so the
 * hole region passes pointer events through to the (interactive) focal element,
 * while every panel blocks interaction with the rest of the UI. With no focal
 * element it renders a single full-viewport panel.
 */
function Scrim({ holeRect }) {
    if (!holeRect) {
        return <div className="tut-scrim-panel tut-scrim-full" />;
    }
    const t = Math.max(0, holeRect.top - HOLE_PAD);
    const l = Math.max(0, holeRect.left - HOLE_PAD);
    const r = holeRect.right + HOLE_PAD;
    const b = holeRect.bottom + HOLE_PAD;
    return (
        <>
            <div className="tut-scrim-panel" style={{ top: 0, left: 0, right: 0, height: t }} />
            <div className="tut-scrim-panel" style={{ top: b, left: 0, right: 0, bottom: 0 }} />
            <div className="tut-scrim-panel" style={{ top: t, left: 0, width: l, height: b - t }} />
            <div className="tut-scrim-panel" style={{ top: t, left: r, right: 0, height: b - t }} />
        </>
    );
}

/**
 * TutorialOverlay — the onboarding orchestrator.
 *
 * Reads the current step from `initialStep`, walks its phases, renders the
 * scrim + tooltip(s) for the active phase, and advances (server-validated)
 * when the player completes each phase's action. See constants/tutorialSteps.js.
 */
export function TutorialOverlay({ fighterId, initialStep, lastFightOutcome, onComplete }) {
    const [stepId, setStepId] = useState(initialStep || "gym_intro");
    const [phaseIndex, setPhaseIndex] = useState(0);
    const [tooltipIndex, setTooltipIndex] = useState(0);
    const [tooltipsDone, setTooltipsDone] = useState(false);
    const [holeRect, setHoleRect] = useState(null);
    const [anchorRect, setAnchorRect] = useState(null);
    const advancingRef = useRef(false);

    const step = TUTORIAL_STEPS[stepId] || null;
    const phase = step?.phases?.[phaseIndex] || null;
    const tooltips = phase?.tooltips || [];
    const currentTooltip = phase && !tooltipsDone ? tooltips[tooltipIndex] : null;

    // The cut-out follows, in priority order: the current tooltip's own `focus`
    // (lets a multi-tooltip step walk the cut-out element by element), then
    // `focusAfterTooltips` once tooltips are done, then the phase's `focus`.
    const effectiveFocus = phase
        ? (currentTooltip?.focus
            || (tooltipsDone && phase.focusAfterTooltips ? phase.focusAfterTooltips : phase.focus))
        : null;

    // ── Step advancement (server-validated) ──────────────────
    const advanceStep = useCallback(async () => {
        const st = TUTORIAL_STEPS[stepId];
        const nextId = st?.next;
        if (!nextId || advancingRef.current) return;
        advancingRef.current = true;
        try {
            await api.advanceTutorial(fighterId, nextId);
        } catch (e) {
            // Already-completed / out-of-order: proceed locally so the player
            // is never trapped — the server state is reconciled on next login.
            console.warn("[tutorial] advance failed:", e?.message);
        }
        setStepId(nextId);
        setPhaseIndex(0);
        setTooltipIndex(0);
        setTooltipsDone(false);
        advancingRef.current = false;
    }, [stepId, fighterId]);

    const advancePhase = useCallback(() => {
        if (advancingRef.current) return;
        const st = TUTORIAL_STEPS[stepId];
        if (!st) return;
        if (phaseIndex < st.phases.length - 1) {
            setPhaseIndex((i) => i + 1);
            setTooltipIndex(0);
            setTooltipsDone(false);
        } else {
            advanceStep();
        }
    }, [stepId, phaseIndex, advanceStep]);

    // ── Tooltip button ───────────────────────────────────────
    const handleTooltipButton = useCallback(() => {
        const isLast = tooltipIndex >= tooltips.length - 1;
        if (!isLast) {
            setTooltipIndex((i) => i + 1);
            return;
        }
        if (phase?.advance?.type === "tooltipButton") {
            advancePhase();
        } else {
            // clickFocus / event — dismiss the tooltip and wait for the action.
            setTooltipsDone(true);
        }
    }, [tooltipIndex, tooltips.length, phase, advancePhase]);

    // ── clickFocus advancement ───────────────────────────────
    useEffect(() => {
        if (!phase || phase.advance?.type !== "clickFocus") return undefined;
        const onClick = (e) => {
            // Only arm once the player has reached the final tooltip.
            if (!tooltipsDone && tooltipIndex < tooltips.length - 1) return;
            const focusEl = resolveEl(effectiveFocus);
            if (focusEl && focusEl.contains(e.target)) advancePhase();
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, [phase, tooltipsDone, tooltipIndex, tooltips.length, effectiveFocus, advancePhase]);

    // ── event advancement ────────────────────────────────────
    useEffect(() => {
        if (!phase || phase.advance?.type !== "event") return undefined;
        return tutorialBus.on(phase.advance.name, () => advancePhase());
    }, [phase, advancePhase]);

    // ── skipIfAbsent (mid-step refresh resume safety) ────────
    useEffect(() => {
        if (!phase || !phase.skipIfAbsent) return undefined;
        const timer = setTimeout(() => {
            if (!resolveEl(phase.focus)) advancePhase();
        }, SKIP_ABSENT_MS);
        return () => clearTimeout(timer);
    }, [phase, phaseIndex, stepId, advancePhase]);

    // ── Scroll the focal element into view ───────────────────
    // The scrim blocks manual scrolling, so a focal element below the fold
    // (e.g. the Events / Hospital nav tabs) would be unreachable. Bring it
    // into view whenever the focus changes — retrying until it mounts.
    useEffect(() => {
        if (!effectiveFocus || stepId === "complete") return undefined;
        let cancelled = false;
        let tries = 0;
        const attempt = () => {
            if (cancelled) return;
            const el = resolveEl(effectiveFocus);
            if (el) {
                const r = el.getBoundingClientRect();
                const visible = r.top >= 0 && r.left >= 0
                    && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
                if (!visible) {
                    el.scrollIntoView({ block: "center", inline: "center" });
                }
                return;
            }
            if (tries++ < 20) setTimeout(attempt, 150);
        };
        attempt();
        return () => { cancelled = true; };
    }, [effectiveFocus, stepId]);

    // ── Continuous measurement of focal + anchor rects ───────
    useEffect(() => {
        if (stepId === "complete") return undefined;
        let timer;
        const tick = () => {
            const hole = measureEl(effectiveFocus);
            setHoleRect((prev) => (sameRect(prev, hole) ? prev : hole));
            const anchorId = currentTooltip ? (currentTooltip.anchor || effectiveFocus) : null;
            const anchor = anchorId ? measureEl(anchorId) : null;
            setAnchorRect((prev) => (sameRect(prev, anchor) ? prev : anchor));
            timer = setTimeout(tick, MEASURE_INTERVAL_MS);
        };
        tick();
        return () => clearTimeout(timer);
    }, [effectiveFocus, currentTooltip, stepId]);

    // ── Completion ───────────────────────────────────────────
    const handleComplete = useCallback(async () => {
        try {
            await api.completeTutorial(fighterId);
        } catch (e) {
            console.warn("[tutorial] complete failed:", e?.message);
        }
        if (onComplete) await onComplete();
    }, [fighterId, onComplete]);

    // ── Render ───────────────────────────────────────────────
    if (stepId === "complete") {
        return <TutorialCompleteModal onConfirm={handleComplete} />;
    }

    const isLastTooltip = tooltipIndex >= tooltips.length - 1;
    let buttonLabel = "Got it";
    if (isLastTooltip) {
        buttonLabel = phase?.advance?.type === "tooltipButton"
            ? (phase.advance.label || "Continue")
            : "Let's go";
    }

    let body = currentTooltip?.body || "";
    if (currentTooltip?.variantSuffix) {
        body += currentTooltip.variantSuffix[lastFightOutcome] || ".";
    }

    return (
        <div className="tut-overlay">
            <Scrim holeRect={holeRect} />
            {holeRect && (
                <div
                    className="tut-glow"
                    style={{
                        top: holeRect.top - HOLE_PAD,
                        left: holeRect.left - HOLE_PAD,
                        width: holeRect.width + HOLE_PAD * 2,
                        height: holeRect.height + HOLE_PAD * 2,
                    }}
                />
            )}
            {currentTooltip && (
                <TutorialTooltip
                    anchorRect={anchorRect}
                    title={currentTooltip.title}
                    body={body}
                    buttonLabel={buttonLabel}
                    onButton={handleTooltipButton}
                    index={tooltipIndex}
                    total={tooltips.length}
                />
            )}
        </div>
    );
}

export default TutorialOverlay;
