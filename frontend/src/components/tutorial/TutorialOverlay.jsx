import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { tutorialBus } from "../../utils/tutorialBus";
import { TUTORIAL_STEPS } from "../../constants/tutorialSteps";
import { TutorialTooltip } from "./TutorialTooltip";
import { TutorialCompleteModal } from "./TutorialCompleteModal";
import { t } from "../../lib/i18n";
import "./tutorial.css";

/** Padding (px) around the focal element's highlight ring. */
const HOLE_PAD = 8;
/** How long to wait for an absent focal element before skipping (resume safety). */
const SKIP_ABSENT_MS = 3500;
/** Polling interval (ms) for re-measuring focal/anchor element rects. */
const MEASURE_INTERVAL_MS = 120;

/** True when an element is actually laid out / visible (not display:none). */
function isVisible(el) {
    // offsetParent is null for display:none elements (and fixed elements, which
    // we never tag with data-tut). getClientRects() catches the fixed-position
    // edge case. Either signal being truthy means the element occupies layout.
    return el.offsetParent !== null || el.getClientRects().length > 0;
}

/**
 * First *visible* DOM element matching any of the given data-tut id(s).
 *
 * The mobile shell renders FighterProfile + the nav menu in BOTH the desktop
 * sidebar and the mobile drawer, so on mobile the same data-tut id exists twice
 * (the desktop copy is display:none but still in the DOM, earlier in document
 * order). Plain querySelector would match the hidden copy first, so we prefer a
 * visible match and only fall back to the first match if none are visible.
 */
function resolveEl(idOrArr) {
    if (!idOrArr) return null;
    const ids = Array.isArray(idOrArr) ? idOrArr : [idOrArr];
    let fallback = null;
    for (const id of ids) {
        const matches = document.querySelectorAll(`[data-tut="${id}"]`);
        for (const el of matches) {
            if (isVisible(el)) return el;
            if (!fallback) fallback = el;
        }
    }
    return fallback;
}

/**
 * The element the cut-out should reveal. Same as resolveEl, except a nav tab that
 * is not on screen (portrait phones keep Events / Hospital inside the closed
 * "More" drawer) falls back to the bottom nav's More button, so the player can
 * open the drawer and the cut-out moves to the tab once it renders. clickFocus
 * still matches the real tab only, so tapping More does not advance the phase.
 */
function resolveFocalEl(idOrArr) {
    const el = resolveEl(idOrArr);
    if (el && isVisible(el)) return el;
    const ids = Array.isArray(idOrArr) ? idOrArr : [idOrArr];
    if (ids.some((id) => typeof id === "string" && id.startsWith("nav-"))) {
        const more = resolveEl("nav-more");
        if (more && isVisible(more)) return more;
    }
    return el;
}

/**
 * True while a pop-up the player opened (Roadmap, What's New, a reward, the
 * out-of-energy offer) is up and is not what the current tip is about. The tip,
 * ring and paused bar then step aside so they never sit on the pop-up's controls.
 * A pop-up holding the focal element (the Fighter Report, the camp summary, the
 * phone drawer) is the lesson itself and keeps the tutorial showing.
 */
function foreignModalOpen(focusIdOrArr) {
    const modals = [...document.querySelectorAll('[aria-modal="true"]')]
        .filter((m) => !m.closest(".tut-overlay, .tut-complete-root") && m.getClientRects().length > 0);
    if (modals.length === 0) return false;
    const focal = focusIdOrArr ? resolveFocalEl(focusIdOrArr) : null;
    return modals.some((m) => !(focal && m.contains(focal)));
}

/** Viewport rect of a data-tut element, or null if absent / not laid out. */
function measureEl(idOrArr) {
    const el = resolveFocalEl(idOrArr);
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
 * TutorialOverlay — the onboarding orchestrator.
 *
 * Reads the current step from `initialStep`, walks its phases, renders the
 * highlight ring + tooltip(s) for the active phase, and advances (server-validated)
 * when the player completes each phase's action. See constants/tutorialSteps.js.
 *
 * Nothing is blocked: there is no scrim, so the player can go anywhere at any
 * time. A phase with a `tab` belongs to that screen; on any other screen the
 * tutorial pauses (no tooltip, no ring) and shows a small bar to go back or end it.
 */
export function TutorialOverlay({ fighterId, initialStep, lastFightOutcome, onComplete, activeTab, onNavigate }) {
    const [stepId, setStepId] = useState(initialStep || "gym_intro");
    const [phaseIndex, setPhaseIndex] = useState(0);
    const [tooltipIndex, setTooltipIndex] = useState(0);
    const [tooltipsDone, setTooltipsDone] = useState(false);
    const [holeRect, setHoleRect] = useState(null);
    const [anchorRect, setAnchorRect] = useState(null);
    // True when the tooltip points at a button in the phone's bottom nav, whose
    // labels are shorter than the sidebar's (Train, not My Camp).
    const [anchorInBottomNav, setAnchorInBottomNav] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
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
    const advancePhase = useCallback(() => {
        if (advancingRef.current) return;
        const st = TUTORIAL_STEPS[stepId];
        if (!st) return;
        const key = `${stepId}:${phaseIndex}`;
        if (advancedRef.current === key) return;
        advancedRef.current = key;
        if (phaseIndex < st.phases.length - 1) {
            setPhaseIndex(phaseIndex + 1);
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

    // ── doneOnTab: a "go to X" phase is done once the player is on X ──
    // Without a scrim the player may already be there, or get there another way.
    useEffect(() => {
        if (!phase?.doneOnTab || !activeTab) return;
        if ([].concat(phase.doneOnTab).includes(activeTab)) advancePhase();
    }, [phase, activeTab, advancePhase]);

    // ── event advancement ────────────────────────────────────
    useEffect(() => {
        if (!phase || phase.advance?.type !== "event") return undefined;
        return tutorialBus.on(phase.advance.name, () => advancePhase());
    }, [phase, advancePhase]);

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
                const r = el.getBoundingClientRect();
                const visible = r.top >= 0 && r.left >= 0
                    && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
                if (!visible) {
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
            // Uses the phase focus even while paused (null focus): any pop-up then hides the bar.
            setModalOpen(foreignModalOpen(effectiveFocus));
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

    // ── Skip — jump straight to the completion (reward) modal ──
    // Doesn't call the API yet; the player still has to click "Claim" on the
    // completion modal which triggers handleComplete. That keeps the 500-iron
    // reward as an explicit acknowledgement, not a silent grant.
    const handleSkipTutorial = useCallback(() => {
        setStepId("complete");
        setPhaseIndex(0);
        setTooltipIndex(0);
        setTooltipsDone(false);
    }, []);

    // ── Render ───────────────────────────────────────────────
    // We portal to document.body so the overlay sits OUTSIDE any transformed
    // ancestor. `.app` has a `transform: scale()` for UI scaling on wide monitors,
    // and any `position: fixed` descendant of a transformed element is positioned
    // relative to that element's coordinate space — which would shift the ring
    // and tooltip by the zoom factor. Portaling to body restores true viewport
    // positioning so the cut-out lines up with the focal element exactly.
    if (stepId === "complete") {
        return createPortal(<TutorialCompleteModal onConfirm={handleComplete} />, document.body);
    }

    const isLastTooltip = tooltipIndex >= tooltips.length - 1;
    let buttonLabel = t("tutorial.overlay.gotIt");
    if (isLastTooltip) {
        buttonLabel = phase?.advance?.type === "tooltipButton"
            ? (phase.advance.label || "Continue")
            : t("tutorial.overlay.letsGo");
    }

    let body = (anchorInBottomNav && currentTooltip?.bodyBottomNav) || currentTooltip?.body || "";
    if (currentTooltip?.variantSuffix) {
        body += currentTooltip.variantSuffix[lastFightOutcome] || ".";
    }

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
