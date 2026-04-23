/**
 * Frontend mirror of the backend banner catalog (for rendering without a network round-trip).
 * The editor loads the authoritative catalog from /fighters/:id/banner/catalog, but the
 * BannerPreview component reads from this local map whenever it renders a fighter's banner
 * inline (e.g. on the profile sidebar).
 *
 * Keep in sync with consts/bannerCatalog.js.
 */

const PIECES = [
    // Backgrounds
    { id: "BG_SLATE",     kind: "background", label: "Slate",         css: "linear-gradient(135deg, #2c2c2e 0%, #3a3a3c 100%)" },
    { id: "BG_CRIMSON",   kind: "background", label: "Crimson",       css: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)" },
    { id: "BG_NAVY",      kind: "background", label: "Deep Blue",     css: "linear-gradient(135deg, #0c1a3a 0%, #1e3a8a 100%)" },
    { id: "BG_CARBON",    kind: "background", label: "Carbon Fiber",  css: "repeating-linear-gradient(45deg, #1a1a1c 0 6px, #2c2c2e 6px 12px)" },
    { id: "BG_EMERALD",   kind: "background", label: "Emerald",       css: "linear-gradient(135deg, #052e1a 0%, #10b981 100%)" },
    { id: "BG_GOLD_MESH", kind: "background", label: "Gold Mesh",     css: "repeating-linear-gradient(90deg, #7c5a0b 0 2px, #d4a012 2px 4px, #7c5a0b 4px 6px)" },
    { id: "BG_NEON",      kind: "background", label: "Neon City",     css: "linear-gradient(135deg, #1a0b2e 0%, #7e22ce 50%, #ec4899 100%)" },
    { id: "BG_HOLO",      kind: "background", label: "Holographic",   css: "linear-gradient(135deg, #c084fc 0%, #38bdf8 25%, #fbbf24 50%, #f472b6 75%, #c084fc 100%)" },

    // Frames
    { id: "FRAME_NONE",   kind: "frame", label: "No Frame",      border: "1px solid rgba(255,255,255,0.15)" },
    { id: "FRAME_ROPE",   kind: "frame", label: "Cage Rope",     border: "3px double #b8860b" },
    { id: "FRAME_CHROME", kind: "frame", label: "Chrome",        border: "3px solid #cbd5e1", boxShadow: "inset 0 0 0 1px #64748b" },
    { id: "FRAME_GOLD",   kind: "frame", label: "Gold Trim",     border: "3px solid #d4a012", boxShadow: "inset 0 0 0 1px #7c5a0b, 0 0 8px rgba(212,160,18,0.3)" },
    { id: "FRAME_CHAMP",  kind: "frame", label: "Championship",  border: "4px double #fbbf24", boxShadow: "inset 0 0 0 2px #7c5a0b, 0 0 12px rgba(251,191,36,0.4)" },

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

export const DEFAULT_BANNER = {
    backgroundId: "BG_SLATE",
    frameId: "FRAME_NONE",
    accentColor: "ACC_RED",
    badgeSlots: [],
};

export const MAX_BADGE_SLOTS = 3;
