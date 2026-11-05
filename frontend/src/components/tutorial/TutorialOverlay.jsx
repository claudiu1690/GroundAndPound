import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { tutorialBus } from "../../utils/tutorialBus";
import { TUTORIAL_STEPS, normaliseStep } from "../../constants/tutorialSteps";
import { TutorialTooltip } from "./TutorialTooltip";
import {
    foreignModalOpen,
    isVisible,
    measureEl,
    resolveEl,
    resolveFocalEl,
    sameRect,
    isInSafeView,
} from "./tutDom";
import { adaptInput } from "../../utils/layout";
import { t } from "../../lib/i18n";
import "./tutorial.css";

/** Padding (px) around the focal element's highlight ring. */
const HOLE_PAD = 8;
/** How long to wait for an absent focal element before skipping (resume safety). */
const SKIP_ABSENT_MS = 3500;
/** Polling interval (ms) for re-measuring focal/anchor element rects. */
const MEASURE_INTERVAL_MS = 120;

/**
 * TutorialOverlay — the debut-flow orchestrator.
 *
 * Reads the current step from `initialStep` (an unknown or legacy id starts at the debut),
 * walks its phases, renders the highlight ring + tooltip(s) for the active phase, and advances
 * (server-validated) when the player completes each phase's action. The last step does not
 * advance on the server: the first fight's resolve completes the tutorial and pays the signing
 * bonus, and the refreshed fighter unmounts this overlay. See constants/tutorialSteps.js.
 *
 * Nothing is blocked: there is no scrim, so the player can go anywhere at any
 * time. A phase with a `tab` belongs to that screen; on any other screen the
 * tutorial pauses (no tooltip, no ring) and shows a small bar to go back or end it.
 */
export function TutorialOverlay({ fighterId, initialStep, onComplete, activeTab, onNavigate }) {
    const [stepId, setStepId] = useState(() => normaliseStep(initialStep));
    const [phaseIndex, setPhaseIndex] = useState(0);
    const [tooltipIndex, setTooltipIndex] = useState(0);
    const [tooltipsDone, setTooltipsDone] = useState(false);
    const [holeRect, setHoleRect] = useState(null);
    const [anchorRect, setAnchorRect] = useState(null);
    // True when the tooltip points at a button in the phone's bottom nav, whose
    // labels are shorter than the sidebar's (Train, not My Camp).
    const [anchorInBottomNav, setAnchorInBottomNav] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    // Anchor sits in the desktop sidebar (profile panel, menu items): tips go beside it.
    const [anchorInSidebar, setAnchorInSidebar] = useState(false);
    const advancingRef = useRef(false);

    const step = TUTORIAL_STEPS[stepId] || null;
    const phase = step?.phases?.[phaseIndex] || null;
    const tooltips = phase?.tooltips || [];
    // The screen(s) this phase lives on. Off them the tutorial waits, and nothing
    // (skip timers, scrolling, the ring) runs against a screen it doesn't belong to.
    const phaseTabs = phase?.tab ? [].concat(phase.tab) : null;
    const paused = !!(phaseTabs && activeTab && !phaseTabs.includes(activeTab));
    const currentTooltip = phase && !tooltipsDone && !paused ? tooltips[tooltipIndex] : null;

    // The cut-out follows, in priority order: the current tooltip's own `focus`
    // (lets a multi-tooltip step walk the cut-out element by element), then
    // `focusAfterTooltips` once tooltips are done, then the phase's `focus`.
    const effectiveFocus = phase && !paused
        ? (currentTooltip?.focus
            || (tooltipsDone && phase.focusAfterTooltips ? phase.focusAfterTooltips : phase.focus))
        : null;

    // ── Step advancement (server-validated) ──────────────────
    const advanceStep = useCallback(async () => {
        const st = TUTORIAL_STEPS[stepId];
        if (st?.completeLocally) {
            // Last step: nothing to tell the server. The first resolve marks the tutorial
            // complete; until then the overlay just goes quiet.
            setStepId("complete");
            return;
        }
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

    // One advance per phase. A nav tap can complete a phase twice in one go (the click
    // itself, then doneOnTab once the tab renders), which used to skip the next phase.
    const advancedRef = useRef(null);
    // Complete phase `done` (the current one, or a later one of this step the player
    // already finished out of order) and move to the phase after it, or the next step.
    const advancePast = useCallback((done) => {
        if (advancingRef.current) return;
        const st = TUTORIAL_STEPS[stepId];
        if (!st) return;
        const key = `${stepId}:${phaseIndex}`;
        if (advancedRef.current === key) return;
        advancedRef.current = key;
        if (done < st.phases.length - 1) {
            setPhaseIndex(done + 1);
            setTooltipIndex(0);
            setTooltipsDone(false);
        } else {
            advanceStep();
        }
    }, [stepId, phaseIndex, advanceStep]);
    const advancePhase = useCallback(() => advancePast(phaseIndex), [advancePast, phaseIndex]);

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

    // ── doneOnTab: a "go to X" phase is done once the player is on X ──
    // Without a scrim the player may already be there, or get there another way.
    const prevTabRef = useRef(activeTab);
    useEffect(() => {
        const moved = prevTabRef.current !== activeTab;
        prevTabRef.current = activeTab;
        if (!phase?.doneOnTab || !activeTab) return;
        if ([].concat(phase.doneOnTab).includes(activeTab)) {
            advancePhase();
        } else if (moved) {
            // Went somewhere else after dismissing the tip: bring its last card back,
            // or all that is left is a ring on a nav button (on a phone, on More).
            setTooltipIndex(Math.max(0, (phase.tooltips?.length || 1) - 1));
            setTooltipsDone(false);
        }
    }, [phase, activeTab, advancePhase]);

    // ── event advancement ────────────────────────────────────
    // Listens for this phase's event AND those of the step's later phases: with no scrim
    // the player can act ahead (hit Continue on the fight result during its first tips),
    // and that must jump the tutorial forward, not leave it waiting on a beat that is gone.
    useEffect(() => {
        const phases = TUTORIAL_STEPS[stepId]?.phases || [];
        const offs = [];
        for (let j = phaseIndex; j < phases.length; j++) {
            const adv = phases[j].advance;
            if (adv?.type === "event") offs.push(tutorialBus.on(adv.name, () => advancePast(j)));
        }
        return () => offs.forEach((off) => off());
    }, [stepId, phaseIndex, advancePast]);

    // ── skipIfAbsent (mid-step refresh resume safety) ────────
    useEffect(() => {
        if (!phase || !phase.skipIfAbsent || paused || modalOpen) return undefined;
        const timer = setTimeout(() => {
            if (!resolveEl(phase.focus)) advancePhase();
        }, SKIP_ABSENT_MS);
        return () => clearTimeout(timer);
    }, [phase, phaseIndex, stepId, paused, modalOpen, advancePhase]);

    // ── Scroll the focal element into view ───────────────────
    // Bring it into view whenever the focus changes, and again whenever the element
    // it resolves to changes (on a phone the More button, then the tab inside the
    // drawer it opens, which can sit below the drawer's fold). Once per element, so
    // the player can still scroll away freely.
    useEffect(() => {
        if (!effectiveFocus || stepId === "complete") return undefined;
        let timer;
        let scrolledEl = null;
        const attempt = () => {
            const el = resolveFocalEl(effectiveFocus);
            if (el && el !== scrolledEl && isVisible(el)) {
                scrolledEl = el;
                if (!isInSafeView(el)) {
                    el.scrollIntoView({ block: "center", inline: "center" });
                } else {
                    // On screen but maybe clipped by a scroll box (the sidebar menu
                    // on a short screen); "nearest" is a no-op when fully shown.
                    el.scrollIntoView({ block: "nearest", inline: "nearest" });
                }
            }
            timer = setTimeout(attempt, 150);
        };
        attempt();
        return () => clearTimeout(timer);
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
            // The More fallback does not count: the tooltip then names a tab inside the drawer.
            const anchorEl = anchorId ? resolveFocalEl(anchorId) : null;
            setAnchorInBottomNav(!!anchorEl?.closest(".m-bottom-nav") && anchorEl.dataset.tut !== "nav-more");
            setAnchorInSidebar(!!anchorEl?.closest(".sidebar"));
            // Uses the phase focus even while paused (null focus): any pop-up then hides the bar.
            setModalOpen(foreignModalOpen(effectiveFocus));
            timer = setTimeout(tick, MEASURE_INTERVAL_MS);
        };
        tick();
        return () => clearTimeout(timer);
    }, [effectiveFocus, currentTooltip, stepId]);

    // ── End tutorial ─────────────────────────────────────────
    // Marks the tutorial complete on the server (it pays nothing; the signing bonus arrives
    // with the first fight's result) and hands over to the app, which refreshes the fighter
    // and unmounts this overlay. If the call fails the tutorial stays up so it can be retried.
    const endingRef = useRef(false);
    const handleSkipTutorial = useCallback(async () => {
        if (endingRef.current) return;
        endingRef.current = true;
        const before = stepId;
        setStepId("complete");
        try {
            await api.completeTutorial(fighterId);
        } catch (e) {
            console.warn("[tutorial] complete failed:", e?.message);
            setStepId(before);
            endingRef.current = false;
            return;
        }
        if (onComplete) await onComplete();
        endingRef.current = false;
    }, [fighterId, onComplete, stepId]);

    // ── Render ───────────────────────────────────────────────
    // We portal to document.body so the overlay sits OUTSIDE any transformed
    // ancestor. `.app` has a `transform: scale()` for UI scaling on wide monitors,
    // and any `position: fixed` descendant of a transformed element is positioned
    // relative to that element's coordinate space — which would shift the ring
    // and tooltip by the zoom factor. Portaling to body restores true viewport
    // positioning so the cut-out lines up with the focal element exactly.
    if (stepId === "complete") return null;

    const isLastTooltip = tooltipIndex >= tooltips.length - 1;
    let buttonLabel = t("tutorial.overlay.gotIt");
    if (isLastTooltip) {
        buttonLabel = phase?.advance?.type === "tooltipButton"
            ? (phase.advance.label || "Continue")
            : t("tutorial.overlay.letsGo");
    }

    const body = adaptInput((anchorInBottomNav && currentTooltip?.bodyBottomNav) || currentTooltip?.body || "");

    // A pop-up the player opened is on top: stay out of its way until it closes.
    if (modalOpen) return createPortal(<div className="tut-overlay" />, document.body);

    return createPortal(
        <div className="tut-overlay">
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
            {/* An optional beat (skipIfAbsent) shows nothing until its target exists: on a
                loss there is no interview, and its tip used to flash up for 3.5 s anyway. */}
            {currentTooltip && !(phase?.skipIfAbsent && !holeRect) && (
                <TutorialTooltip
                    anchorRect={anchorRect}
                    title={currentTooltip.title}
                    body={body}
                    buttonLabel={buttonLabel}
                    onButton={handleTooltipButton}
                    onSkip={handleSkipTutorial}
                    preferSide={anchorInSidebar}
                    index={tooltipIndex}
                    total={tooltips.length}
                />
            )}
            {paused && (
                <div className="tut-paused" role="status">
                    <span className="tut-paused-text">{t("tutorial.paused.text")}</span>
                    <button type="button" className="tut-paused-btn" onClick={() => onNavigate?.(phaseTabs[0])}>
                        {t("tutorial.paused.continue")}
                    </button>
                    <button type="button" className="tut-paused-end" onClick={handleSkipTutorial}>
                        {t("tutorial.tooltip.skipTutorial")}
                    </button>
                </div>
            )}
        </div>,
        document.body
    );
}

export default TutorialOverlay;
