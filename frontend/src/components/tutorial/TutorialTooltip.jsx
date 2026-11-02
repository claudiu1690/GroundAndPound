import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";

/**
 * A single tutorial tooltip card — a white card floating above the game,
 * anchored to a focal element with a small pointer arrow.
 *
 * Positioning is computed from the anchor's viewport rect: the card prefers to
 * sit below the anchor, flips above when there isn't room, and is clamped to
 * the viewport. When no anchor rect is supplied the card centres on screen.
 */
export function TutorialTooltip({
    anchorRect,
    title,
    body,
    buttonLabel,
    onButton,
    onSkip,             // optional — renders an "End tutorial" link in the footer when provided
    preferSide = false, // anchor sits in the desktop side menu: go beside it, not over its neighbours
    index = 0,
    total = 1,
}) {
    const cardRef = useRef(null);
    const [size, setSize] = useState({ w: 300, h: 160 });

    useLayoutEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (Math.abs(r.width - size.w) > 1 || Math.abs(r.height - size.h) > 1) {
            setSize({ w: r.width, h: r.height });
        }
    });

    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    // Usable height stops above the phone's bottom nav, so a card never covers it:
    // the game stays usable during the tutorial and the nav is how players move on.
    const bottomNav = typeof document !== "undefined" ? document.querySelector(".m-bottom-nav") : null;
    const navH = bottomNav && getComputedStyle(bottomNav).display !== "none" ? bottomNav.getBoundingClientRect().height : 0;
    const vh = (typeof window !== "undefined" ? window.innerHeight : 800) - navH;
    const GAP = 14;
    const MARGIN = 12;

    let style;
    let placement = "center";
    let arrowStyle = null;

    if (anchorRect) {
        const anchorCx = anchorRect.left + anchorRect.width / 2;
        const anchorCy = anchorRect.top + anchorRect.height / 2;
        const clampTop = (t) => Math.max(MARGIN, Math.min(t, vh - size.h - MARGIN));
        let top = anchorRect.bottom + GAP;
        let left = null;
        placement = "below";
        if (preferSide && anchorRect.right + GAP + size.w <= vw - MARGIN) {
            // A side-menu item: above or below would sit on the items next to it.
            placement = "right";
            left = anchorRect.right + GAP;
            top = clampTop(anchorCy - size.h / 2);
        } else if (top + size.h > vh - MARGIN) {
            const aboveTop = anchorRect.top - size.h - GAP;
            if (aboveTop >= MARGIN) {
                top = aboveTop;
                placement = "above";
            } else if (anchorRect.right + GAP + size.w <= vw - MARGIN) {
                // No room above or below (short landscape screens): sit beside the anchor
                // instead of on top of it, e.g. right of the sidebar stats panel.
                placement = "right";
                left = anchorRect.right + GAP;
                top = clampTop(anchorCy - size.h / 2);
            } else if (anchorRect.left - GAP - size.w >= MARGIN) {
                placement = "left";
                left = anchorRect.left - GAP - size.w;
                top = clampTop(anchorCy - size.h / 2);
            } else {
                // Nowhere clear (a target taller than the screen): pin to the top. Panels
                // keep their buttons at the bottom (Accept, Finalise, Begin Fight, Continue),
                // and pinning low used to cover exactly the button the tip asks for.
                placement = "pinned";
                top = MARGIN;
            }
        }
        // Always keep the card (and its button) on screen. An anchor above or
        // below the fold on a short phone screen would otherwise push the card
        // off screen.
        top = clampTop(top);
        if (placement === "left" || placement === "right") {
            arrowStyle = { top: Math.max(16, Math.min(anchorCy - top, size.h - 16)) };
        } else {
            left = Math.max(MARGIN, Math.min(anchorCx - size.w / 2, vw - size.w - MARGIN));
            arrowStyle = { left: Math.max(16, Math.min(anchorCx - left, size.w - 16)) };
        }
        style = { top: Math.round(top), left: Math.round(left) };
    } else {
        style = {
            top: Math.round(vh / 2 - size.h / 2),
            left: Math.round(vw / 2 - size.w / 2),
        };
    }

    return (
        <div ref={cardRef} className={`tut-tooltip tut-tooltip--${placement}`} style={style} role="dialog" aria-modal="true">
            {placement !== "center" && placement !== "pinned" && (
                <span className={`tut-tooltip-arrow tut-tooltip-arrow--${placement}`} style={arrowStyle} />
            )}
            <div className="tut-tooltip-title">{title}</div>
            <div className="tut-tooltip-body">{body}</div>
            <div className="tut-tooltip-footer">
                {total > 1 && (
                    <div className="tut-tooltip-dots" aria-hidden="true">
                        {Array.from({ length: total }, (_, i) => (
                            <span key={i} className={`tut-dot ${i === index ? "tut-dot--on" : ""}`} />
                        ))}
                    </div>
                )}
                {onSkip && (
                    <button type="button" className="tut-tooltip-skip" onClick={onSkip}>
                        {t("tutorial.tooltip.skipTutorial")}
                    </button>
                )}
                <button type="button" className="tut-tooltip-btn" onClick={onButton}>
                    {buttonLabel}
                </button>
            </div>
        </div>
    );
}

export default TutorialTooltip;
