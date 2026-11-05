import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

/** Padding (px) around the anchor's highlight ring. */
const HOLE_PAD = 8;
/** How long an anchor may stay absent before its card is skipped. */
const SKIP_ABSENT_MS = 3500;
/** Polling interval (ms) for re-measuring the anchor. */
const MEASURE_INTERVAL_MS = 120;

/**
 * TipsOverlay: renders one section or moment tip card (see hooks/useTips.js) with the same ring
 * and tooltip the debut tutorial uses. Nothing is blocked: no scrim, the page stays usable. It
 * steps aside while a pop-up the player opened is up (including the fight reveal), shows nothing
 * until the anchor is on screen, and skips a card whose anchor never appears.
 *
 * Every card has "Got it" and "Hide tips" (turns all tips off).
 */
export function TipsOverlay({ card, index, total, onShown, onGotIt, onAbsent, onHide }) {
    const [holeRect, setHoleRect] = useState(null);
    const [anchorRect, setAnchorRect] = useState(null);
    const [anchorInBottomNav, setAnchorInBottomNav] = useState(false);
    const [anchorInSidebar, setAnchorInSidebar] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

    const anchorKey = card ? JSON.stringify(card.anchor) : null;
    const anchor = card?.anchor ?? null;

    // Measure the anchor continuously: layout shifts, scrolling and resizes all move it.
    useEffect(() => {
        if (!anchor) {
            setHoleRect(null);
            setAnchorRect(null);
            return undefined;
        }
        let timer;
        const tick = () => {
            const rect = measureEl(anchor);
            setHoleRect((prev) => (sameRect(prev, rect) ? prev : rect));
            setAnchorRect((prev) => (sameRect(prev, rect) ? prev : rect));
            const el = resolveFocalEl(anchor);
            setAnchorInBottomNav(!!el?.closest(".m-bottom-nav"));
            setAnchorInSidebar(!!el?.closest(".sidebar"));
            setModalOpen(foreignModalOpen(anchor));
            timer = setTimeout(tick, MEASURE_INTERVAL_MS);
        };
        tick();
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorKey]);

    // Bring the anchor into view once per element (the player can still scroll away freely).
    useEffect(() => {
        if (!anchor) return undefined;
        let timer;
        let scrolledEl = null;
        const attempt = () => {
            const el = resolveFocalEl(anchor);
            if (el && el !== scrolledEl && isVisible(el)) {
                scrolledEl = el;
                el.scrollIntoView(isInSafeView(el)
                    ? { block: "nearest", inline: "nearest" }
                    : { block: "center", inline: "center" });
            }
            timer = setTimeout(attempt, 150);
        };
        attempt();
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorKey]);

    // The card is on screen: the tip counts as seen.
    const shownRef = useRef(false);
    useEffect(() => { shownRef.current = false; }, [anchorKey, index]);
    useEffect(() => {
        if (card && holeRect && !modalOpen && !shownRef.current) {
            shownRef.current = true;
            onShown?.();
        }
    }, [card, holeRect, modalOpen, onShown]);

    // An anchor that never shows up: move on instead of waiting forever.
    useEffect(() => {
        if (!anchor || modalOpen) return undefined;
        const timer = setTimeout(() => {
            if (!resolveEl(anchor)) onAbsent?.();
        }, SKIP_ABSENT_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorKey, index, modalOpen, onAbsent]);

    if (!card || modalOpen) return null;

    return createPortal(
        <div className="tut-overlay tut-overlay--tips">
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
            {holeRect && (
                <TutorialTooltip
                    anchorRect={anchorRect}
                    title={card.title}
                    body={adaptInput(card.body)}
                    buttonLabel={t("tips.buttons.gotIt")}
                    onButton={onGotIt}
                    onSkip={onHide}
                    skipLabel={t("tips.buttons.hide")}
                    preferSide={anchorInSidebar && !anchorInBottomNav}
                    index={index}
                    total={total}
                />
            )}
        </div>,
        document.body,
    );
}

export default TipsOverlay;
