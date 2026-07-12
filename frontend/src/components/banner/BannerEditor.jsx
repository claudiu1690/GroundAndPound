import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { BannerPreview } from "./BannerPreview";
import { MAX_BADGE_SLOTS } from "./bannerCatalog";
import { t } from "../../lib/i18n";

const KIND_TABS = [
    { key: "background", labelKey: "banner.editor.tabs.background" },
    { key: "frame",      labelKey: "banner.editor.tabs.frame" },
    { key: "accent",     labelKey: "banner.editor.tabs.accent" },
    // "Badges" tab hidden — badge-pinning logic remains; will return as achievements.
];

/**
 * Full-screen modal banner editor.
 * Left column: tabbed palette of pieces (locked items shown with hint).
 * Right column: live preview + save/cancel.
 */
export function BannerEditor({ fighter, open, onClose, onSaved, onMessage }) {
    const [catalog, setCatalog]   = useState(null);
    const [config, setConfig]     = useState(null);
    const [activeKind, setActive] = useState("background");
    const [loading, setLoading]   = useState(false);
    const [saving, setSaving]     = useState(false);
    const [dirty, setDirty]       = useState(false);

    const fighterId = fighter?._id;

    // Load catalog when opened.
    const load = useCallback(async () => {
        if (!fighterId) return;
        setLoading(true);
        try {
            const data = await api.getBannerCatalog(fighterId);
            setCatalog(data);
            setConfig(data.current);
            setDirty(false);
        } catch (e) {
            onMessage?.(e.message || t("common.error"));
        }
        setLoading(false);
    }, [fighterId, onMessage]);

    useEffect(() => { if (open) load(); }, [open, load]);

    // Close on Escape.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Group pieces by kind.
    const grouped = useMemo(() => {
        const g = { background: [], frame: [], accent: [], badge: [] };
        (catalog?.pieces || []).forEach((p) => { g[p.kind]?.push(p); });
        return g;
    }, [catalog]);

    const setPiece = useCallback((piece) => {
        if (!piece || !config) return;
        if (!piece.unlocked) return; // locked — ignore
        if (piece.kind === "background")  setConfig({ ...config, backgroundId: piece.id });
        else if (piece.kind === "frame")  setConfig({ ...config, frameId:      piece.id });
        else if (piece.kind === "accent") setConfig({ ...config, accentColor:  piece.id });
        else if (piece.kind === "badge")  toggleBadge(piece.id);
        setDirty(true);
    }, [config]);

    const toggleBadge = useCallback((id) => {
        setConfig((prev) => {
            if (!prev) return prev;
            const current = prev.badgeSlots || [];
            if (current.includes(id)) {
                return { ...prev, badgeSlots: current.filter((b) => b !== id) };
            }
            if (current.length >= MAX_BADGE_SLOTS) return prev; // silently cap
            return { ...prev, badgeSlots: [...current, id] };
        });
    }, []);

    const resetToDefault = useCallback(() => {
        if (!catalog) return;
        setConfig(catalog.defaults);
        setDirty(true);
    }, [catalog]);

    const save = useCallback(async () => {
        if (!fighterId || !config) return;
        setSaving(true);
        try {
            const res = await api.saveBanner(fighterId, config);
            setDirty(false);
            onMessage?.("Banner saved.");
            onSaved?.(res.banner);
            onClose?.();
        } catch (e) {
            onMessage?.(e.message || t("common.error"));
        }
        setSaving(false);
    }, [fighterId, config, onClose, onSaved, onMessage]);

    if (!open) return null;

    const fighterForPreview = fighter ? { ...fighter, banner: config || fighter.banner } : null;

    return createPortal(
        <div className="banner-editor-root" role="dialog" aria-modal="true" aria-label={t("banner.editor.ariaLabel")}>
            <div className="banner-editor-backdrop" onClick={onClose} />
            <div className="banner-editor-shell">
                <header className="banner-editor-header">
                    <h2>{t("banner.editor.title")}</h2>
                    <button type="button" className="banner-editor-close" onClick={onClose} aria-label={t("banner.editor.closeAriaLabel")}>✕</button>
                </header>

                <div className="banner-editor-body">
                    {/* ── Preview column ── */}
                    <section className="banner-editor-preview-col">
                        <div className="banner-editor-preview-wrap">
                            {fighterForPreview
                                ? <BannerPreview fighter={fighterForPreview} banner={config} size="full" />
                                : <div className="banner-editor-loading">{t("banner.editor.loading")}</div>}
                        </div>

                        <div className="banner-editor-actions">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={resetToDefault}
                                disabled={loading || saving}
                            >
                                {t("banner.editor.resetToDefault")}
                            </button>
                            <div className="banner-editor-action-right">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={onClose}
                                    disabled={saving}
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={save}
                                    disabled={saving || loading || !dirty}
                                >
                                    {saving ? t("banner.editor.saving") : t("banner.editor.saveBtn")}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* ── Palette column ── */}
                    <section className="banner-editor-palette-col">
                        <nav className="banner-editor-tabs">
                            {KIND_TABS.map((tab) => (
                                <button
                                    type="button"
                                    key={tab.key}
                                    className={`banner-editor-tab ${activeKind === tab.key ? "active" : ""}`}
                                    onClick={() => setActive(tab.key)}
                                >
                                    {t(tab.labelKey)}
                                </button>
                            ))}
                        </nav>

                        {loading && <div className="banner-editor-loading">{t("banner.editor.loadingCatalog")}</div>}

                        {!loading && activeKind === "badge" && (
                            <div className="banner-editor-hint">
                                {t("banner.editor.badgeHint", { max: MAX_BADGE_SLOTS })}
                                {config?.badgeSlots?.length
                                    ? " " + t("banner.editor.badgeCount", { count: config.badgeSlots.length, max: MAX_BADGE_SLOTS })
                                    : ""}
                            </div>
                        )}

                        {!loading && (
                            <div className="banner-editor-grid">
                                {(grouped[activeKind] || []).map((p) => (
                                    <PieceButton
                                        key={p.id}
                                        piece={p}
                                        selected={isSelected(p, config)}
                                        onClick={() => setPiece(p)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    , document.body);
}

function isSelected(piece, config) {
    if (!config) return false;
    if (piece.kind === "background") return config.backgroundId === piece.id;
    if (piece.kind === "frame")      return config.frameId === piece.id;
    if (piece.kind === "accent")     return config.accentColor === piece.id;
    if (piece.kind === "badge")      return (config.badgeSlots || []).includes(piece.id);
    return false;
}

function PieceButton({ piece, selected, onClick }) {
    const locked = !piece.unlocked;
    const classes = ["banner-piece", `banner-piece-${piece.kind}`];
    if (selected) classes.push("selected");
    if (locked)   classes.push("locked");

    const visual = piece.visual || {};
    const styleByKind = (() => {
        if (piece.kind === "background") return { background: visual.css };
        if (piece.kind === "frame")      return { background: "#1c1c1f" }; // layout — glyph rendered inside
        if (piece.kind === "accent")     return { background: visual.color };
        return {};
    })();

    return (
        <button
            type="button"
            className={classes.join(" ")}
            onClick={onClick}
            disabled={locked}
            title={locked ? `🔒 ${piece.unlockHint}` : piece.label}
        >
            <div className="banner-piece-swatch" style={styleByKind}>
                {piece.kind === "frame" && !locked && (
                    <span className="banner-piece-glyph">{visual.glyph}</span>
                )}
                {/* Badge icon render removed — badges still earned/stored; will return as achievements. */}
                {locked && <span className="banner-piece-lock">🔒</span>}
            </div>
            <div className="banner-piece-label">{piece.label}</div>
            {locked && <div className="banner-piece-hint">{piece.unlockHint}</div>}
        </button>
    );
}
