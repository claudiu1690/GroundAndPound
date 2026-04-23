const Fighter = require("../models/fighterModel");
const {
    BANNER_PIECES,
    BANNER_KINDS,
    MAX_BADGE_SLOTS,
    DEFAULT_BANNER,
} = require("../consts/bannerCatalog");
const { tierRank } = require("../consts/notorietyConfig");

const PIECES_BY_ID = Object.fromEntries(BANNER_PIECES.map((p) => [p.id, p]));

const PROMO_TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];
function promoTierRank(tier) {
    const idx = PROMO_TIER_ORDER.indexOf(tier);
    return idx < 0 ? 0 : idx;
}

/**
 * Returns true if `fighter` meets every condition on `piece.unlockAt`.
 * Unknown keys are ignored (forward-compatible).
 */
function isUnlocked(fighter, piece) {
    const u = piece?.unlockAt || {};
    if (u.always) return true;

    if (u.notorietyTier) {
        const req = tierRank(u.notorietyTier);
        const have = tierRank(fighter?.notoriety?.peakTier || "UNKNOWN");
        if (have < req) return false;
    }
    if (u.promotionTier) {
        if (promoTierRank(fighter?.promotionTier || "Amateur") < promoTierRank(u.promotionTier)) return false;
    }
    if (u.milestone) {
        if (!fighter?.notoriety?.milestones?.[u.milestone]) return false;
    }
    if (u.badge) {
        if (!(fighter?.badges || []).includes(u.badge)) return false;
    }
    if (u.totalWins != null) {
        if ((fighter?.record?.wins || 0) < u.totalWins) return false;
    }
    if (u.koWins != null) {
        if ((fighter?.record?.koWins || 0) < u.koWins) return false;
    }
    if (u.beltsWon) {
        if (!(fighter?.badges || []).includes("Champion")) return false;
    }
    return true;
}

/**
 * Produce catalog payload for the editor: every piece plus whether it's currently unlocked
 * and a human-readable unlock hint. Also returns current banner + defaults.
 */
function buildCatalogFor(fighter) {
    const pieces = BANNER_PIECES.map((p) => ({
        id: p.id,
        kind: p.kind,
        label: p.label,
        visual: p.visual,
        unlocked: isUnlocked(fighter, p),
        unlockHint: describeUnlock(p),
    }));
    return {
        pieces,
        kinds: BANNER_KINDS,
        maxBadgeSlots: MAX_BADGE_SLOTS,
        current: normaliseBannerFromFighter(fighter),
        defaults: DEFAULT_BANNER,
    };
}

/** Pretty one-liner describing an unlock condition for the UI. */
function describeUnlock(piece) {
    const u = piece?.unlockAt || {};
    if (u.always) return "Unlocked";
    const parts = [];
    if (u.notorietyTier) parts.push(`Fame: ${u.notorietyTier.replace(/_/g, " ").toLowerCase()}`);
    if (u.promotionTier) parts.push(`Tier: ${u.promotionTier}`);
    if (u.milestone)     parts.push(`Milestone: ${u.milestone}`);
    if (u.badge)         parts.push(`Badge: ${u.badge}`);
    if (u.totalWins)     parts.push(`${u.totalWins}+ wins`);
    if (u.koWins)        parts.push(`${u.koWins}+ KO wins`);
    if (u.beltsWon)      parts.push("Win a belt");
    return parts.length ? parts.join(" · ") : "Unlocked";
}

/** Returns an in-memory normalised banner (fills in defaults if missing). */
function normaliseBannerFromFighter(fighter) {
    const b = fighter?.banner || {};
    return {
        backgroundId: b.backgroundId || DEFAULT_BANNER.backgroundId,
        frameId:      b.frameId      || DEFAULT_BANNER.frameId,
        accentColor:  b.accentColor  || DEFAULT_BANNER.accentColor,
        badgeSlots:   Array.isArray(b.badgeSlots) ? b.badgeSlots.slice(0, MAX_BADGE_SLOTS) : [],
    };
}

/**
 * Validate + save a new banner config. Any locked or mistyped piece throws.
 * @param {string} fighterId
 * @param {{ backgroundId?, frameId?, accentColor?, badgeSlots? }} config
 */
async function saveBanner(fighterId, config) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const current = normaliseBannerFromFighter(fighter);
    const next = {
        backgroundId: config?.backgroundId || current.backgroundId,
        frameId:      config?.frameId      || current.frameId,
        accentColor:  config?.accentColor  || current.accentColor,
        badgeSlots:   Array.isArray(config?.badgeSlots) ? config.badgeSlots.slice(0, MAX_BADGE_SLOTS) : current.badgeSlots,
    };

    validatePiece(fighter, next.backgroundId, "background");
    validatePiece(fighter, next.frameId,      "frame");
    validatePiece(fighter, next.accentColor,  "accent");

    // Dedup and validate badges; drop empty/null entries.
    const seen = new Set();
    const cleanedBadges = [];
    for (const id of next.badgeSlots) {
        if (!id) continue;
        if (seen.has(id)) continue;
        validatePiece(fighter, id, "badge");
        seen.add(id);
        cleanedBadges.push(id);
        if (cleanedBadges.length >= MAX_BADGE_SLOTS) break;
    }
    next.badgeSlots = cleanedBadges;

    fighter.banner = next;
    await fighter.save();
    return fighter.banner;
}

function validatePiece(fighter, id, expectedKind) {
    const piece = PIECES_BY_ID[id];
    if (!piece) throw new Error(`Unknown banner piece: ${id}`);
    if (piece.kind !== expectedKind) throw new Error(`Piece ${id} is a ${piece.kind}, not a ${expectedKind}`);
    if (!isUnlocked(fighter, piece)) throw new Error(`Piece ${id} is not unlocked yet`);
}

module.exports = {
    buildCatalogFor,
    saveBanner,
    isUnlocked,
    normaliseBannerFromFighter,
    PIECES_BY_ID,
};
