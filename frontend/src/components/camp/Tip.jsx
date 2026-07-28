import { memo, useEffect, useRef, useState } from "react";

// Only one tap-revealed tooltip stays open at a time (mirrors the approved
// mock's document-level click delegate) — tracked via a tiny module-level
// pointer rather than context, since Tip instances are cheap and short-lived.
let closeOtherTip = null;

/**
 * Inline dotted-underline tooltip. Hover reveals it on desktop (pure CSS);
 * a tap toggles it on touch devices, since they have no hover — the mock's
 * "tap-to-reveal" requirement. Renders as a <span> so it drops inline with
 * surrounding text/labels without affecting layout.
 *
 * KNOWN LIMITATION: the bubble is centred on its trigger with no viewport
 * clamping, so a trigger near a screen edge pushes part of it off-screen
 * (measured at 390px wide: a drill card's energy chip overflows the right edge
 * by 32px, a left-most stat pill by 42px). Fixing it needs real measurement —
 * a CSS-var nudge is not enough, since the reveal itself is CSS-only on hover.
 */
export const Tip = memo(function Tip({ text, title = null, children, className = "" }) {
  const [active, setActive] = useState(false);
  const ref = useRef(null);

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

  return (
    <span
      ref={ref}
      className={`yc-tip${active ? " yc-tip-active" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
      {/* Real element, not ::after — a pseudo-element inherited the label's
          UPPERCASE/letter-spacing/condensed font, which is exactly the
          "unstyled all caps" bug. A child span styles independently and can
          carry a title row (owner pick 04-V1). */}
      <span className="yc-tt" role="tooltip" aria-hidden={!active}>
        {title ? <span className="yc-tt-title">{title}</span> : null}
        {text}
      </span>
    </span>
  );
});
