import { memo } from "react";

/**
 * Division badge (contract §6.3). Lights the v1.1 placeholder pill from the
 * season/ladder `division` string. Five bands: Champion's Circle, Diamond,
 * Gold, Silver, Bronze. Unknown / missing → renders nothing (graceful blank).
 *
 * Props: division (String|null), size ("sm" | "md"), title (optional tooltip)
 */

/** Map a division label to a tone class (case/whitespace tolerant). */
function divisionTone(division) {
    if (!division) return null;
    const d = String(division).toLowerCase();
    if (d.includes("champion")) return "champion";
    if (d.includes("diamond")) return "diamond";
    if (d.includes("gold")) return "gold";
    if (d.includes("silver")) return "silver";
    if (d.includes("bronze")) return "bronze";
    return "default";
}

export const PvpSeasonBadge = memo(function PvpSeasonBadge({ division, size = "md", title }) {
    const tone = divisionTone(division);
    if (!tone) return null;
    return (
        <span
            className={`pvp-division-badge pvp-division-badge--${tone} pvp-division-badge--${size}`}
            title={title || `Division: ${division}`}
        >
            {division}
        </span>
    );
});

export default PvpSeasonBadge;
