import { memo, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { moveArtUrl } from "./moveArtUrl";
import { RARITY_COLORS } from "../../constants/specialMovesCatalog";

/**
 * Probes whether an art asset actually exists (no art has shipped yet — see
 * moveArt.js) without ever surfacing a broken-image icon. Returns
 * true/false/null(checking). A missing asset is an expected, silent state,
 * not an error — this hook never sets an "error" state on 404.
 */
function useMoveArtExists(url) {
    const [exists, setExists] = useState(false);
    useEffect(() => {
        if (!url) { setExists(false); return undefined; }
        let alive = true;
        const img = new Image();
        img.onload = () => { if (alive) setExists(true); };
        img.onerror = () => { if (alive) setExists(false); };
        img.src = url;
        return () => { alive = false; };
    }, [url]);
    return exists;
}

/**
 * Rarity-framed move art tile. Rarity is ALWAYS a CSS frame + glow around
 * the art (via the `--rarity-color` custom property), never part of the
 * image itself. Falls back to a styled placeholder keyed off the `art` slug
 * when no asset is present — never a broken-image glyph.
 *
 * size: "thumb" (equipped-slot tile), "sm" (grid icon), "tall" (detail /
 * drop-reveal portrait card, 2:3).
 */
export const MoveArt = memo(function MoveArt({ art, rarity, size = "sm", showDot = false, className = "" }) {
    const url = moveArtUrl(art);
    const exists = useMoveArtExists(url);
    const color = RARITY_COLORS[rarity] || RARITY_COLORS.COMMON;

    return (
        <div
            className={`move-art move-art--${size} ${className}`}
            style={{ "--rarity-color": color }}
        >
            {exists ? (
                <div className="move-art-img" style={{ backgroundImage: `url("${url}")` }} />
            ) : (
                <div className="move-art-placeholder">
                    <Sparkles size={size === "tall" ? 34 : size === "thumb" ? 16 : 18} />
                </div>
            )}
            {showDot && <span className="move-rarity-dot" aria-hidden="true" />}
        </div>
    );
});
