/**
 * Frontend mirror of the backend banner catalog (for rendering without a network round-trip).
 * The editor loads the authoritative catalog from /fighters/:id/banner/catalog, but the
 * BannerPreview component reads from this local map whenever it renders a fighter's banner
 * inline (e.g. on the profile sidebar).
 *
 * Keep in sync with consts/bannerCatalog.js.
 *
 * Piece kinds (poster-nameplate model):
 *   background — a layered CSS composition (`css`) + optional `texture` overlay
 *                ("halftone" | "grain")
 *   frame      — a nameplate LAYOUT id (stored in the legacy frameId slot);
 *                `glyph` is only used for the editor swatch
 *   accent     — hex color for the nickname / slash-side text
 */

const PIECES = [
    // Styles (background compositions)
    { id: "BG_SLATE",     kind: "background", label: "Slate",         css: "linear-gradient(115deg, #232327 0%, #141416 62%)", texture: "grain" },
    { id: "BG_CRIMSON",   kind: "background", label: "Red Slash",     css: "linear-gradient(115deg, transparent 0 58%, rgba(200,16,46,0.92) 58.3% 66%, transparent 66.3%), linear-gradient(115deg, transparent 0 67%, rgba(200,16,46,0.30) 67.3% 71%, transparent 71.3%), linear-gradient(115deg, #1a1416 0%, #141416 65%)", texture: "halftone" },
    { id: "BG_NAVY",      kind: "background", label: "Blue Steel",    css: "linear-gradient(115deg, transparent 0 58%, rgba(59,130,246,0.85) 58.3% 66%, transparent 66.3%), linear-gradient(115deg, transparent 0 67%, rgba(59,130,246,0.28) 67.3% 71%, transparent 71.3%), linear-gradient(115deg, #10141c 0%, #121316 65%)", texture: "halftone" },
    { id: "BG_CARBON",    kind: "background", label: "Carbon",        css: "radial-gradient(90% 130% at 18% 0%, rgba(255,255,255,0.09), transparent 55%), repeating-linear-gradient(45deg, #151517 0 6px, #1c1c1f 6px 12px)", texture: null },
    { id: "BG_EMERALD",   kind: "background", label: "Jade Slash",    css: "linear-gradient(115deg, transparent 0 58%, rgba(34,197,94,0.8) 58.3% 66%, transparent 66.3%), linear-gradient(115deg, transparent 0 67%, rgba(34,197,94,0.25) 67.3% 71%, transparent 71.3%), linear-gradient(115deg, #0f1712 0%, #121412 65%)", texture: "halftone" },
    { id: "BG_GOLD_MESH", kind: "background", label: "Gold Standard", css: "linear-gradient(100deg, transparent 0 60%, rgba(212,168,32,0.16) 60% 100%), linear-gradient(115deg, #1e1808 0%, #141416 68%)", texture: "grain" },
    { id: "BG_NEON",      kind: "background", label: "Neon City",     css: "linear-gradient(115deg, transparent 0 60%, rgba(236,72,153,0.5) 60.3% 65%, transparent 65.3%), linear-gradient(115deg, transparent 0 66%, rgba(126,34,206,0.4) 66.3% 69%, transparent 69.3%), linear-gradient(135deg, #170b28 0%, #0f0a18 60%)", texture: "halftone" },
    { id: "BG_HOLO",      kind: "background", label: "Holographic",   css: "linear-gradient(135deg, rgba(192,132,252,0.35) 0%, rgba(56,189,248,0.3) 25%, rgba(251,191,36,0.28) 50%, rgba(244,114,182,0.33) 75%, rgba(192,132,252,0.35) 100%), linear-gradient(135deg, #17181c 0%, #101114 100%)", texture: "grain" },

    // Layouts (nameplate typesetting)
    { id: "LAYOUT_STACKED",   kind: "frame", label: "Stacked",      glyph: "≡" },
    { id: "LAYOUT_INLINE",    kind: "frame", label: "Lower Third",  glyph: "—" },
    { id: "LAYOUT_MARQUEE",   kind: "frame", label: "Marquee",      glyph: "◈" },
    { id: "LAYOUT_BROADCAST", kind: "frame", label: "Broadcast",    glyph: "▮" },
    { id: "LAYOUT_CHAMP",     kind: "frame", label: "Championship", glyph: "★" },

    // Accents
    { id: "ACC_RED",    kind: "accent", label: "Blood Red",  color: "#ef4444" },
    { id: "ACC_WHITE",  kind: "accent", label: "Bone White", color: "#f5f5f7" },
    { id: "ACC_BLUE",   kind: "accent", label: "Ice Blue",   color: "#38bdf8" },
    { id: "ACC_GOLD",   kind: "accent", label: "Gold",       color: "#fbbf24" },
    { id: "ACC_GREEN",  kind: "accent", label: "Jade",       color: "#22c55e" },
    { id: "ACC_PURPLE", kind: "accent", label: "Royal",      color: "#c084fc" },
    { id: "ACC_PINK",   kind: "accent", label: "Hot Pink",   color: "#f472b6" },

    // Badges
    { id: "BADGE_FIRST_WIN",  kind: "badge", label: "First Win",        icon: "1️⃣" },
    { id: "BADGE_WINS_10",    kind: "badge", label: "10 Wins",          icon: "🔟" },
    { id: "BADGE_WINS_25",    kind: "badge", label: "25 Wins",          icon: "🏅" },
    { id: "BADGE_WINS_50",    kind: "badge", label: "50 Wins",          icon: "🎖" },
    { id: "BADGE_KO_10",      kind: "badge", label: "10 KOs",           icon: "💥" },
    { id: "BADGE_KO_5",       kind: "badge", label: "Knockout Artist",  icon: "🥊" },
    { id: "BADGE_CHAMPION",   kind: "badge", label: "Champion",         icon: "🏆" },
    { id: "BADGE_RESILIENCE", kind: "badge", label: "Resilience",       icon: "💪" },
    { id: "BADGE_LEGEND",     kind: "badge", label: "Legend",           icon: "⭐" },
    { id: "BADGE_STAR",       kind: "badge", label: "Star",             icon: "✨" },
    { id: "BADGE_CONTENDER",  kind: "badge", label: "Contender",        icon: "🎯" },
    { id: "BADGE_CALLOUT",    kind: "badge", label: "Callout Win",      icon: "📣" },
    { id: "BADGE_DOCUMENTARY", kind: "badge", label: "Legacy",           icon: "🎬" },
];

export const PIECES_BY_ID = Object.fromEntries(PIECES.map((p) => [p.id, p]));
export const BANNER_PIECES = PIECES;

/**
 * The fighter's banner composition as a row/strip background. The veil is
 * DIRECTIONAL: darker on the left where row text lives, nearly clear on the
 * right where the compositions put their slash — so the banner stays vibrant
 * without costing readability. Used to skin ladder rows on the PvE rankings
 * and PvP surfaces.
 *
 * veil: "self" (light — your own row pops) | "other" (heavy — other players'
 * rows read as identity hints, never louder than yours).
 */
export function bannerRowBackground(banner, { veil = "self" } = {}) {
    const comp = PIECES_BY_ID[banner?.backgroundId] || PIECES_BY_ID[DEFAULT_BANNER.backgroundId];
    const v = veil === "other"
        ? "linear-gradient(90deg, rgba(13, 14, 16, 0.88) 0%, rgba(13, 14, 16, 0.78) 45%, rgba(13, 14, 16, 0.6) 100%)"
        : "linear-gradient(90deg, rgba(10, 11, 13, 0.6) 0%, rgba(10, 11, 13, 0.28) 45%, rgba(10, 11, 13, 0.08) 100%)";
    return `${v}, ${comp?.css || "#141416"}`;
}

/** The fighter's chosen accent hex (identity color) — null without a banner. */
export function bannerAccentColor(banner) {
    if (!banner?.accentColor) return null;
    return PIECES_BY_ID[banner.accentColor]?.color || null;
}

export const DEFAULT_BANNER = {
    backgroundId: "BG_SLATE",
    frameId: "LAYOUT_STACKED",
    accentColor: "ACC_RED",
    badgeSlots: [],
};

export const MAX_BADGE_SLOTS = 3;
