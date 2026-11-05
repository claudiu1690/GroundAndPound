/**
 * DOM helpers shared by the debut tutorial (TutorialOverlay) and the section tips
 * (TipsOverlay): finding the data-tut element a ring or tooltip points at, measuring it, and
 * stepping aside while a foreign pop-up is open.
 */

/** True when an element is actually laid out / visible (not display:none). */
export function isVisible(el) {
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
export function resolveEl(idOrArr) {
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
export function resolveFocalEl(idOrArr) {
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
export function foreignModalOpen(focusIdOrArr) {
    const modals = [...document.querySelectorAll('[aria-modal="true"]')]
        .filter((m) => !m.closest(".tut-overlay, .tut-complete-root") && m.getClientRects().length > 0);
    if (modals.length === 0) return false;
    const focal = focusIdOrArr ? resolveFocalEl(focusIdOrArr) : null;
    return modals.some((m) => !(focal && m.contains(focal)));
}

/**
 * True when an element is fully on screen and not hidden behind the phone's fixed
 * bottom nav (a target at y 740 on an 812 px phone is "in the viewport" but under the bar).
 * Elements inside the bottom nav itself are judged against the plain viewport.
 */
export function isInSafeView(el) {
    const r = el.getBoundingClientRect();
    let bottomLimit = window.innerHeight;
    const nav = document.querySelector(".m-bottom-nav");
    if (nav && !nav.contains(el) && isVisible(nav)) {
        const navTop = nav.getBoundingClientRect().top;
        if (navTop > 0 && navTop < bottomLimit) bottomLimit = navTop;
    }
    return r.top >= 0 && r.left >= 0 && r.bottom <= bottomLimit && r.right <= window.innerWidth;
}

/** Viewport rect of a data-tut element, or null if absent / not laid out. */
export function measureEl(idOrArr) {
    const el = resolveFocalEl(idOrArr);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
}

export function sameRect(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return Math.abs(a.top - b.top) < 0.5
        && Math.abs(a.left - b.left) < 0.5
        && Math.abs(a.width - b.width) < 0.5
        && Math.abs(a.height - b.height) < 0.5;
}
