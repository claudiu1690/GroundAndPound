import { memo } from "react";
import { PIECES_BY_ID, DEFAULT_BANNER } from "./bannerCatalog";

/**
 * Renders a fighter's banner with name / nickname / record / tier / pinned badges.
 * Used inline on the profile sidebar and in the banner editor preview.
 */
export const BannerPreview = memo(function BannerPreview({
    fighter,
    banner,             // optional: override (editor live preview)
    size = "full",      // "full" | "compact"
    onClick,
    title,
}) {
    if (!fighter) return null;

    const cfg = banner || fighter.banner || DEFAULT_BANNER;
    const bg     = PIECES_BY_ID[cfg.backgroundId] || PIECES_BY_ID[DEFAULT_BANNER.backgroundId];
    const frame  = PIECES_BY_ID[cfg.frameId]      || PIECES_BY_ID[DEFAULT_BANNER.frameId];
    const accent = PIECES_BY_ID[cfg.accentColor]  || PIECES_BY_ID[DEFAULT_BANNER.accentColor];
    const badges = (cfg.badgeSlots || [])
        .map((id) => PIECES_BY_ID[id])
        .filter(Boolean);

    const record = fighter.record || {};
    const nickname = fighter.nickname;
    const tier = fighter.promotionTier || "Amateur";
    const ovr = fighter.overallRating ?? "—";

    const style = {
        background: bg?.css || "#2c2c2e",
        border: frame?.border || "1px solid rgba(255,255,255,0.15)",
        boxShadow: frame?.boxShadow || "none",
    };
    const accentStyle = { color: accent?.color || "#ef4444" };

    const classes = ["banner-preview", `banner-size-${size}`];
    if (onClick) classes.push("banner-clickable");

    return (
        <div
            className={classes.join(" ")}
            style={style}
            onClick={onClick}
            title={title}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            <div className="banner-inner">
                <div className="banner-main">
                    <div className="banner-name" style={accentStyle}>
                        {fighter.firstName} {fighter.lastName}
                    </div>
                    {nickname && (
                        <div className="banner-nickname">"{nickname}"</div>
                    )}
                    <div className="banner-meta">
                        <span className="banner-tag banner-tag-ovr" style={accentStyle}>OVR {ovr}</span>
                        <span className="banner-tag">{tier}</span>
                        <span className="banner-tag">{record.wins ?? 0}-{record.losses ?? 0}-{record.draws ?? 0}</span>
                    </div>
                </div>
                {badges.length > 0 && (
                    <div className="banner-badges">
                        {badges.map((b) => (
                            <span key={b.id} className="banner-badge" title={b.label}>
                                {b.icon}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});
