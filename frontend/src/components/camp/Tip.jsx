import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Only one tap-revealed tooltip stays open at a time (mirrors the approved
// mock's document-level click delegate) — tracked via a tiny module-level
// pointer rather than context, since Tip instances are cheap and short-lived.
let closeOtherTip = null;

/** Gap kept between the bubble and the viewport edge when it has to be nudged. */
const EDGE_GAP = 8;
/** Vertical gap between the trigger and the bubble. */
const OFFSET = 9;

/**
 * Inline dotted-underline tooltip. Hover reveals it on desktop, a tap toggles it on touch.
 *
 * ⚠️ THE BUBBLE IS PORTALED TO document.body AND POSITIONED `fixed`. It has to be.
 * An absolutely-positioned bubble is clipped by ANY ancestor with a non-visible overflow,
 * and this screen has a chain of them:
 *   1. `.yc-drill-card` had `overflow: hidden` (for the rounded family stripe) — clipped the
 *      bubble 30px off the top and 69px off the left, so it looked like it slid under the card.
 *   2. `main` has `overflow: hidden auto` — the app's scroll container. It clips horizontally
 *      at the sidebar boundary (x=330), so a bubble on a left-edge pill was cut off there.
 *   3. `.page-layout` carries a transform (the tab-enter animation), which creates a stacking
 *      context and traps any z-index the bubble sets.
 * Fixing these one at a time is whack-a-mole; a portal escapes all three at once, and it
 * cannot be re-broken by someone adding `overflow: hidden` to a future wrapper.
 *
 * The portal root carries `your-camp` because ~296 rules are scoped `.your-camp .yc-*` and a
 * portal renders outside that subtree — the same trap the Trainer Market modal hit.
 */
export const Tip = memo(function Tip({ text, title = null, children, className = "" }) {
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const bubbleRef = useRef(null);

  /**
   * Place the bubble above the trigger, centred, then clamp into the viewport.
   *
   * Runs ONCE per open. It deliberately does NOT depend on its own output: an earlier
   * attempt recomputed a shift inside an effect whose dependency changed with that shift,
   * and sub-pixel rects meant it never settled — React hit its update-depth limit and tore
   * the whole camp screen down. Measure, place, stop.
   */
  const place = useCallback(() => {
    const trigger = ref.current;
    const bubble = bubbleRef.current;
    if (!trigger) return;
    const t = trigger.getBoundingClientRect();
    // Fall back to the CSS width before the bubble has laid out (first open).
    const bw = bubble ? bubble.offsetWidth : 200;
    const bh = bubble ? bubble.offsetHeight : 0;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    let left = t.left + t.width / 2 - bw / 2;
    left = Math.max(EDGE_GAP, Math.min(left, vw - bw - EDGE_GAP));

    // Above by default; flip below when there isn't room (the camp bar's tips used to open
    // upward into the sticky header).
    let top = t.top - bh - OFFSET;
    if (top < EDGE_GAP) top = t.bottom + OFFSET;
    if (bh && top + bh > vh - EDGE_GAP) top = Math.max(EDGE_GAP, vh - bh - EDGE_GAP);

    setPos({ top: Math.round(top), left: Math.round(left) });
  }, []);

  // Two passes: the first places it using the CSS width, the second corrects once the real
  // box exists. `pos === null` gates the second so it can't loop.
  useLayoutEffect(() => {
    if (!active) { setPos(null); return; }
    place();
  }, [active, place]);

  useLayoutEffect(() => {
    if (!active || !pos || !bubbleRef.current) return;
    const b = bubbleRef.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const wanted = Math.max(EDGE_GAP, Math.min(pos.left, vw - b.width - EDGE_GAP));
    if (Math.abs(wanted - pos.left) >= 1) setPos((p) => ({ ...p, left: Math.round(wanted) }));
    // Intentionally keyed on `active` only — re-running on every `pos` change is the loop
    // that killed the previous attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    function handleDocClick(e) {
      const inside = ref.current && ref.current.contains(e.target);
      if (inside) {
        setActive((prev) => {
          const next = !prev;
          if (next) {
            if (closeOtherTip && closeOtherTip !== setActive) closeOtherTip(false);
            closeOtherTip = setActive;
          }
          return next;
        });
      } else {
        setActive(false);
      }
    }
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);

  // A fixed bubble doesn't travel with the page, so close it rather than let it detach.
  useEffect(() => {
    if (!active) return undefined;
    const close = () => setActive(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [active]);

  const open = () => setActive(true);
  const close = () => setActive(false);

  return (
    <span
      ref={ref}
      className={`yc-tip${active ? " yc-tip-active" : ""}${className ? ` ${className}` : ""}`}
      onPointerEnter={open}
      onPointerLeave={close}
    >
      {children}
      {active && pos && createPortal(
        <span className="your-camp yc-tt-layer">
          <span ref={bubbleRef} className="yc-tt is-open" role="tooltip" style={{ top: pos.top, left: pos.left }}>
            {title ? <span className="yc-tt-title">{title}</span> : null}
            {text}
          </span>
        </span>,
        document.body
      )}
    </span>
  );
});
