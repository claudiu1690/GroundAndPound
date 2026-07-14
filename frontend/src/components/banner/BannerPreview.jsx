import { memo } from "react";
import { PIECES_BY_ID, DEFAULT_BANNER } from "./bannerCatalog";

/**
 * Fight-poster nameplate — renders a fighter's banner as designed typography
 * over an authored background composition, instead of the old "gray card with
 * tags" look.
 *
 * Config axes (same fighter.banner shape as before):
 *   backgroundId — a layered CSS composition + optional texture overlay
 *   frameId      — the nameplate LAYOUT (stacked / lower third / marquee /
 *                  broadcast / championship), reusing the legacy field name
 *   accentColor  — colors the nickname script + accents
 *
 * Used inline on the profile sidebar and in the banner editor preview.
 */

/** Small shared bits so each layout stays declarative. */
function bannerData(fighter) {
    const record = fighter.record || {};
    return {
        first: fighter.firstName || "",
        last: fighter.lastName || "",
        nickname: fighter.nickname || null,
        tier: fighter.promotionTier || "Amateur",
        weightClass: fighter.weightClass || null,
        ovr: fighter.overallRating ?? "—",
        rec: `${record.wins ?? 0}–${record.losses ?? 0}${(record.draws ?? 0) > 0 ? `–${record.draws}` : ""}`,
    };
}

function Nickname({ nickname, accent, className = "" }) {
    if (!nickname) return null;
    return (
        <span className={`bp2-nick ${className}`} style={{ color: accent }}>
            “{nickname}”
        </span>
    );
}

export const BannerPreview = memo(function BannerPreview({
    fighter,
    banner,             // optional: override (editor live preview)
    size = "full",      // "full" | "compact"
    onClick,
    title,
}) {
    if (!fighter) return null;

    const cfg = banner || fighter.banner || DEFAULT_BANNER;
    const comp   = PIECES_BY_ID[cfg.backgroundId] || PIECES_BY_ID[DEFAULT_BANNER.backgroundId];
    const layout = PIECES_BY_ID[cfg.frameId]?.kind === "frame" ? PIECES_BY_ID[cfg.frameId] : PIECES_BY_ID[DEFAULT_BANNER.frameId];
    const accent = (PIECES_BY_ID[cfg.accentColor] || PIECES_BY_ID[DEFAULT_BANNER.accentColor])?.color || "#ef4444";
    // Badge decorations hidden — badgeSlots still saved; will return as achievements.

    const d = bannerData(fighter);
    const layoutKey = (layout?.id || "LAYOUT_STACKED").replace(/^(LAYOUT_|FRAME_)/, "").toLowerCase();
    // Long names get a lower type ceiling so they fit before ellipsis kicks in.
    const longName = (layoutKey === "stacked" || layoutKey === "broadcast" || layoutKey === "warpath" ? d.last : `${d.first} ${d.last}`).length > 11;
    const lastCls = `bp2-last${longName ? " bp2-last--long" : ""}`;

    const classes = ["banner-preview", "bp2", `bp2--${layoutKey}`, `banner-size-${size}`];
    if (onClick) classes.push("banner-clickable");

    return (
        <div
            className={classes.join(" ")}
            style={{ background: comp?.css || "#141416" }}
            onClick={onClick}
            title={title}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {comp?.texture && <i className={`bp2-tex bp2-tex--${comp.texture}`} aria-hidden="true" />}

            {layoutKey === "stacked" && (
                <div className="bp2-in bp2-row">
                    <div className="bp2-nameblock">
                        <span className="bp2-first">{d.first}</span>
                        <span className={lastCls}>{d.last}</span>
                    </div>
                    <Nickname nickname={d.nickname} accent={accent} className="bp2-nick--tilt" />
                    <div className="bp2-right">
                        <span className="bp2-tierline">{d.tier}{d.weightClass ? ` · ${d.weightClass}` : ""}</span>
                        <span className="bp2-rec">{d.rec} <small>OVR {d.ovr}</small></span>
                    </div>
                </div>
            )}

            {layoutKey === "inline" && (
                <div className="bp2-in bp2-row">
                    <div className="bp2-inlineblock">
                        <span className={`${lastCls} bp2-last--inline`}>{d.first} {d.last}</span>
                        <Nickname nickname={d.nickname} accent={accent} />
                    </div>
                    <div className="bp2-right">
                        <span className="bp2-tierline">{d.tier}{d.weightClass ? ` · ${d.weightClass}` : ""}</span>
                        <span className="bp2-rec">{d.rec} <small>OVR {d.ovr}</small></span>
                    </div>
                </div>
            )}

            {(layoutKey === "marquee" || layoutKey === "champ") && (
                <div className="bp2-in bp2-center">
                    <span className="bp2-topline">{d.tier}{d.weightClass ? ` · ${d.weightClass}` : ""}</span>
                    <span className={`${lastCls} bp2-last--marquee`}>{d.first} {d.last}</span>
                    <span className="bp2-botline">
                        {d.nickname ? <Nickname nickname={d.nickname} accent={accent} /> : null}
                        <span>{d.rec} · OVR {d.ovr}</span>
                    </span>
                </div>
            )}

            {layoutKey === "broadcast" && (
                <div className="bp2-in bp2-row bp2-broadcast">
                    <i className="bp2-sidebar" style={{ background: accent }} aria-hidden="true" />
                    <div className="bp2-nameblock">
                        <span className="bp2-first">{d.first}</span>
                        <span className={lastCls}>{d.last}</span>
                    </div>
                    <div className="bp2-right">
                        <Nickname nickname={d.nickname} accent={accent} />
                        <span className="bp2-tierline">{d.tier}{d.weightClass ? ` · ${d.weightClass}` : ""}</span>
                        <span className="bp2-rec">{d.rec} <small>OVR {d.ovr}</small></span>
                    </div>
                </div>
            )}

            {layoutKey === "warpath" && (
                <div className="bp2-in bp2-row bp2-warpath">
                    <span className="bp2-warpath-glyph" style={{ color: accent }} aria-hidden="true">⚔</span>
                    <div className="bp2-nameblock">
                        <span className="bp2-first">{d.first}</span>
                        <span className={lastCls}>{d.last}</span>
                    </div>
                    <Nickname nickname={d.nickname} accent={accent} className="bp2-nick--tilt" />
                    <div className="bp2-right">
                        <span className="bp2-tierline">{d.tier}{d.weightClass ? ` · ${d.weightClass}` : ""}</span>
                        <span className="bp2-rec" style={{ color: accent }}>{d.rec} <small>OVR {d.ovr}</small></span>
                    </div>
                    <i className="bp2-warpath-edge" style={{ background: accent }} aria-hidden="true" />
                </div>
            )}

            {layoutKey === "spotlight" && (
                <div className="bp2-in bp2-center bp2-spotlight">
                    <i className="bp2-spotlight-glow" style={{ background: `radial-gradient(circle, ${accent}55, transparent 70%)` }} aria-hidden="true" />
                    <span className="bp2-spotlight-ring" aria-hidden="true">◎</span>
                    <span className="bp2-topline">{d.tier}{d.weightClass ? ` · ${d.weightClass}` : ""}</span>
                    <span className={`${lastCls} bp2-last--marquee`}>{d.first} {d.last}</span>
                    <span className="bp2-botline">
                        {d.nickname ? <Nickname nickname={d.nickname} accent={accent} /> : null}
                        <span>{d.rec} · OVR {d.ovr}</span>
                    </span>
                </div>
            )}
        </div>
    );
});
