/**
 * Badge Service — evaluation + profile building for the Career Page badge system.
 *
 * Design rules:
 *  - evaluateBadges MUTATES the fighter (pushes to fighter.badgesEarned) but NEVER
 *    saves. The host flow (fightService / gymRankService / mediaHubService) owns the
 *    fighter.save(). This avoids double-saves and version conflicts.
 *  - Re-evaluation is idempotent: a Set of already-earned ids guards every award, so
 *    calling this multiple times in one request (e.g. interview + fight resolve) is safe.
 *  - The activity-log write is wrapped so a feed failure can never block awarding.
 */

const { BADGES, BADGE_CATEGORIES, getBadge } = require("../consts/badgeCatalog");
const { resolvePvpBadge, PVP_BADGE_DEFS } = require("../consts/pvpBadges");

let _activityLogService = null;
function activityLog() {
    // Lazy require to keep the dependency graph acyclic (activityLogService only
    // depends on the ActivityLog model, so this is purely defensive).
    if (!_activityLogService) _activityLogService = require("./activityLogService");
    return _activityLogService;
}

function earnedIdSet(fighter) {
    const set = new Set();
    for (const e of (fighter && fighter.badgesEarned) || []) {
        if (e && e.badgeId) set.add(e.badgeId);
    }
    return set;
}

/**
 * Evaluate all catalog badges against the fighter + fight/event ctx.
 * Pushes any newly-earned badge to fighter.badgesEarned (mutation only — no save).
 *
 * @param {import("mongoose").Document|Object} fighter
 * @param {Object} [ctx] one-shot fight/event facts
 * `name` is the catalog display name. It ships with the id so a toast never has to
 * re-derive one from the slug — `boxer_rank4` prettifies to "Boxer Rank4" while the
 * badge is really called "Champion Boxer", which is how the same award ended up
 * announced under two different names inside one action (camp claim-perk).
 *
 * @returns {{ newlyEarned: Array<{ badgeId: string, name: string, context: (string|null) }> }}
 */
function evaluateBadges(fighter, ctx = {}, opts = {}) {
    const result = { newlyEarned: [] };
    if (!fighter) return result;
    const silent = !!opts.silent; // skip feed writes (used by lazy profile self-heal)

    if (!Array.isArray(fighter.badgesEarned)) fighter.badgesEarned = [];
    const earned = earnedIdSet(fighter);

    for (const def of BADGES) {
        if (earned.has(def.id)) continue;
        let pass = false;
        try {
            pass = !!def.condition(fighter, ctx);
        } catch (_) {
            pass = false;
        }
        if (!pass) continue;

        let context = null;
        if (typeof def.contextFmt === "function") {
            try {
                context = def.contextFmt(fighter, ctx) ?? null;
            } catch (_) {
                context = null;
            }
        }

        // Silent self-heals (profile load / backfill) are pre-acknowledged; genuine
        // gameplay unlocks are "unseen" so the UI can highlight + celebrate them.
        const entry = { badgeId: def.id, earnedAt: new Date(), context, seen: silent };
        fighter.badgesEarned.push(entry);
        earned.add(def.id);
        result.newlyEarned.push({ badgeId: def.id, name: def.name, context });

        // Feed write must never block awarding (and is skipped for silent self-heals).
        if (!silent) try {
            activityLog().log(
                fighter._id,
                "BADGE_EARNED",
                `Badge Earned — ${def.name}`,
                { badgeId: def.id, context }
            );
        } catch (_) {
            /* swallow — awarding already succeeded */
        }
    }

    if (result.newlyEarned.length > 0 && typeof fighter.markModified === "function") {
        fighter.markModified("badgesEarned");
    }

    return result;
}

/**
 * Build the server-computed badge profile for the Career Page.
 * progress is only included when the badge is LOCKED and a progress fn exists.
 * conditionLabel falls back to the description (used as a tooltip when locked with
 * no progress bar).
 *
 * @param {Object} fighter
 * @returns {{
 *   earnedCount: number,
 *   lockedCount: number,
 *   categories: Array<{ key, label, badges: Array<Object> }>
 * }}
 */
function buildBadgeProfile(fighter) {
    const earnedMap = new Map();
    for (const e of (fighter && fighter.badgesEarned) || []) {
        if (e && e.badgeId) earnedMap.set(e.badgeId, e);
    }

    let earnedCount = 0;
    let lockedCount = 0;

    const categories = BADGE_CATEGORIES.map((cat) => {
        const badges = BADGES.filter((b) => b.category === cat.key).map((def) => {
            const earnedEntry = earnedMap.get(def.id);
            const isEarned = !!earnedEntry;
            // LEGACY (Phase 2): the six gym badges with no Home Camp route. Once the gyms
            // retire they are unobtainable, so a LOCKED one must NOT count toward lockedCount —
            // otherwise every player's completion is permanently six short, which reads as a
            // bug forever. An EARNED legacy badge still counts in earnedCount and still renders
            // (with a "Retired" chip): it was earned and it is kept.
            const isLegacy = !!def.legacy;
            if (isEarned) earnedCount += 1;
            else if (!isLegacy) lockedCount += 1;

            let progress = null;
            if (!isEarned && typeof def.progress === "function") {
                try {
                    progress = def.progress(fighter);
                } catch (_) {
                    progress = null;
                }
            }

            return {
                id: def.id,
                name: def.name,
                description: def.description,
                category: def.category,
                subgroup: def.subgroup || null,
                // Retired route — the UI renders a "Retired" chip and hides it from
                // "what's left to chase" lists.
                legacy: isLegacy,
                earned: isEarned,
                // "new" = earned but not yet acknowledged by the player.
                new: isEarned && earnedEntry.seen === false,
                context: earnedEntry ? (earnedEntry.context ?? null) : null,
                progress,
                conditionLabel: def.description,
            };
        });
        return { key: cat.key, label: cat.label, badges };
    });

    // ── Proving Ground (PVP) badges ──────────────────────────────────────────
    // Render the FIXED achievement catalog like the PvE categories — earned AND
    // locked — so players can see what's left to chase (locked badges show the
    // condition, no progress bar). Then append any EARNED seasonal/unbounded pvp
    // ids (per-season belts and division placements) that aren't in the fixed
    // catalog — those only exist once earned, so they can't be shown "locked".
    const catalogIds = new Set(BADGES.map((b) => b.id));
    const pvpBadges = [];
    const fixedIds = new Set();

    for (const def of Object.values(PVP_BADGE_DEFS)) {
        fixedIds.add(def.id);
        const entry = earnedMap.get(def.id);
        const earned = !!entry;
        if (earned) earnedCount += 1; else lockedCount += 1;
        pvpBadges.push({
            id: def.id,
            name: def.name,
            description: def.description,
            category: "proving_ground",
            subgroup: null,
            earned,
            new: earned ? entry.seen === false : false,
            context: earned ? (entry.context ?? null) : null,
            progress: null,
            conditionLabel: def.description,
            icon: def.icon,
            color: def.color,
        });
    }

    // Earned seasonal / unbounded pvp badges (belts, per-season divisions) — not in
    // the fixed catalog, only present once earned.
    for (const [id, entry] of earnedMap.entries()) {
        if (!id.startsWith("pvp_") || catalogIds.has(id) || fixedIds.has(id)) continue;
        const resolved = resolvePvpBadge(id);
        if (!resolved) continue;
        earnedCount += 1;
        pvpBadges.push({
            id,
            name: resolved.name,
            description: resolved.description,
            category: "proving_ground",
            subgroup: null,
            earned: true,
            new: entry.seen === false,
            context: entry.context ?? null,
            progress: null,
            conditionLabel: resolved.description,
            icon: resolved.icon,
            color: resolved.color,
        });
    }

    if (pvpBadges.length > 0) {
        categories.push({ key: "proving_ground", label: "Proving Ground", badges: pvpBadges });
    }

    return { earnedCount, lockedCount, categories };
}

/**
 * Mark every unseen earned badge as acknowledged. Mutation only — caller saves.
 * @returns {number} how many entries were flipped to seen.
 */
function markBadgesSeen(fighter) {
    let changed = 0;
    for (const e of (fighter && fighter.badgesEarned) || []) {
        if (e && e.seen === false) { e.seen = true; changed += 1; }
    }
    if (changed > 0 && typeof fighter.markModified === "function") {
        fighter.markModified("badgesEarned");
    }
    return changed;
}

module.exports = {
    evaluateBadges,
    buildBadgeProfile,
    markBadgesSeen,
    getBadge,
};
