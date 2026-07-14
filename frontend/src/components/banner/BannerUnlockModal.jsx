import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { t } from "@/lib/i18n";
import { PIECES_BY_ID } from "./bannerCatalog";
import { prettifyBadgeId } from "../career/badgeCatalog";

/**
 * Lightweight swatch for a single piece — NOT the full BannerPreview (which
 * needs a fighter). Reads render fields straight from the local mirror.
 */
function PieceSwatch({ id, kind }) {
    const piece = PIECES_BY_ID[id];
    if (kind === "background") {
        return <div className="banner-unlock-swatch" style={{ background: piece?.css || "#141416" }} />;
    }
    if (kind === "accent") {
        return (
            <div className="banner-unlock-swatch banner-unlock-swatch--accent">
                <i style={{ background: piece?.color || "#888" }} />
            </div>
        );
    }
    // frame
    return (
        <div className="banner-unlock-swatch banner-unlock-swatch--frame">
            <span aria-hidden="true">{piece?.glyph || "◆"}</span>
        </div>
    );
}

/**
 * Celebration modal listing the banner pieces unlocked by the last fight
 * resolve. Queued *after* the belt-won and tier-up overlays (see App.jsx's
 * overlayQueue) so it never buries the bigger moments.
 *
 * @param {Array<{id, kind, label, unlockBadgeId}>|null} pieces
 * @param {() => void} onClose        dismiss (button / × / backdrop / Esc)
 * @param {() => void} onCustomize    dismiss + deep-link into the banner editor
 */
export function BannerUnlockModal({ pieces, onClose, onCustomize }) {
    const hasPieces = Array.isArray(pieces) && pieces.length > 0;

    useEffect(() => {
        if (!hasPieces) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [hasPieces, onClose]);

    if (!hasPieces) return null;

    return createPortal(
        <div className="banner-unlock-overlay" role="dialog" aria-modal="true" aria-label={t("banner.unlock.ariaLabel")}>
            <div className="banner-unlock-backdrop" onClick={onClose} />
            <div className="banner-unlock-modal">
                <div className="banner-unlock-top">
                    <button
                        type="button"
                        className="banner-unlock-close"
                        onClick={onClose}
                        aria-label={t("banner.unlock.closeAriaLabel")}
                    >
                        ✕
                    </button>
                    <span className="banner-unlock-eyebrow">
                        <Sparkles size={12} aria-hidden="true" /> {t("banner.unlock.eyebrow")}
                    </span>
                    <div className="banner-unlock-title">{t("banner.unlock.title")}</div>
                    <div className="banner-unlock-sub">
                        {pieces.length === 1
                            ? t("banner.unlock.subtitleSingular")
                            : t("banner.unlock.subtitlePlural", { n: pieces.length })}
                    </div>
                </div>

                <div className="banner-unlock-body">
                    {pieces.map((p) => (
                        <div className="banner-unlock-piece" key={p.id}>
                            <PieceSwatch id={p.id} kind={p.kind} />
                            <div className="banner-unlock-info">
                                <div className="banner-unlock-kind">{t(`banner.unlock.kind.${p.kind}`) || p.kind}</div>
                                <div className="banner-unlock-name">{p.label}</div>
                                {p.unlockBadgeId && (
                                    <div className="banner-unlock-from">
                                        {t("banner.unlock.earnedPrefix")}{" "}
                                        <b>{p.badgeName || prettifyBadgeId(p.unlockBadgeId)}</b>
                                        {p.badgeDescription ? ` — ${p.badgeDescription}` : ""}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="banner-unlock-foot">
                    <button type="button" className="banner-unlock-btn" onClick={onClose}>
                        {t("banner.unlock.later")}
                    </button>
                    <button type="button" className="banner-unlock-btn banner-unlock-btn--primary" onClick={onCustomize}>
                        {t("banner.unlock.customize")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
