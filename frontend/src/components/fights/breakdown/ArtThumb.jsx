import { useState } from "react";
import { moveArtUrl } from "../../moves/moveArtUrl";

/**
 * Painted move art that never shows a broken-image glyph: a missing asset falls back to a plain
 * tile carrying the move's first letter. Frame colour comes from `--rarity-color` on an ancestor.
 */
export function ArtThumb({ art, name, className = "" }) {
  const [failed, setFailed] = useState(false);
  const url = moveArtUrl(art);
  if (!url || failed) {
    return (
      <span className={`art-thumb art-thumb--blank ${className}`} aria-hidden="true">
        {(name || "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={`art-thumb ${className}`}
      src={url}
      alt=""
      loading="eager"
      draggable="false"
      onError={() => setFailed(true)}
    />
  );
}

export default ArtThumb;
