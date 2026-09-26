/**
 * Shared Athlete Page grid tile (offer-board-contract.md §5).
 *
 * Ported from the old Fight Night `hn-tile`, mechanically renamed to
 * `ap-tile`. `span` was dropped: the Athlete Page grids (`ap-cols`, `ap-grid`)
 * size their own columns via CSS, no per-tile span classes needed.
 *
 * Props:
 *   index   , desktop entrance-stagger index, feeds `animation-delay` in home.css
 *   head    , node rendered in the tile-head eyebrow row (optional)
 *   children, tile body
 *   link    , { label, onClick, gold? } renders the bottom ap-link row (optional)
 *   dataTut , data-tut passthrough
 */
export function HomeTile({ index, head, children, link, dataTut, className = "" }) {
  return (
    <article
      className={`ap-tile ap-anim ${className}`.trim()}
      data-tut={dataTut}
      style={index != null ? { "--i": index } : undefined}
    >
      {head ? <div className="ap-tile-head">{head}</div> : null}
      {children}
      {link ? (
        <button type="button" className={`ap-link${link.gold ? " is-gold" : ""}`} onClick={link.onClick}>
          {link.label}
        </button>
      ) : null}
    </article>
  );
}
