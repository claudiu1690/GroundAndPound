/**
 * Shared Fight Night grid tile (home-contract.md §3).
 *
 * The card surface itself is never clickable — only the explicit `link` row
 * (and any interactive children a tile renders, like the Proving Ground's
 * defense-report alert) fire navigation. This is deliberate: on a phone the
 * undercard/grid scroll with a thumb, and a whole-tile onClick would fire on
 * scroll-drag release (home-contract.md §8).
 *
 * Props:
 *   tone     — "plain" | "hot" | "gold" | "quiet" (mockup's is-hot/is-gold/is-quiet)
 *   span     — 3 | 4 | 5 | 6 | 7 | 8 (grid-column span, desktop 12-col grid)
 *   index    — desktop entrance-stagger index (mockup's `--i`, e.g. tile 1..15);
 *              feeds `animation-delay:calc(1.7s + var(--i,0) * .07s)` in home.css
 *   head     — node rendered in the tile-head eyebrow row (optional)
 *   children — tile body
 *   link     — { label, onClick, gold? } renders the bottom hn-link row (optional)
 *   dataTut  — data-tut passthrough (identity tile keeps "dashboard-identity")
 */
export function HomeTile({ tone = "plain", span, index, head, children, link, dataTut, className = "" }) {
  const toneClass = tone === "hot" ? "is-hot" : tone === "gold" ? "is-gold" : tone === "quiet" ? "is-quiet" : "";
  const spanClass = span ? `hn-s${span}` : "";
  return (
    <article
      className={`hn-tile ${toneClass} ${spanClass} hn-anim ${className}`.trim()}
      data-tut={dataTut}
      style={index != null ? { "--i": index } : undefined}
    >
      {head ? <div className="hn-tile-head">{head}</div> : null}
      {children}
      {link ? (
        <button type="button" className={`hn-link${link.gold ? " is-gold" : ""}`} onClick={link.onClick}>
          {link.label}
        </button>
      ) : null}
    </article>
  );
}
