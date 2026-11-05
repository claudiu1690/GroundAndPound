/**
 * Ground & Pound: Fight replay highlights, the player's corner for ONE fight.
 *
 * PURE. Freezes, at resolve time, the moves and camp sessions the player brought and how often
 * each fired, so the replay's corner strip, its "What fired" finish card and the report's
 * "Your corner" block all read the same numbers (spec §7.5) and a Career Feed reopen never
 * depends on the live catalog or the fighter's current equipment.
 *
 * Shape: LoadoutSnapshot, documented in utils/fightBreakdownView.js (the single JSDoc home).
 * Never throws; bad input yields empty arrays.
 */

const { SPECIAL_MOVES_BY_ID } = require("../consts/specialMovesCatalog");
const { CAMP_SESSIONS } = require("../consts/campConfig");

function isPlainObject(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function strOrNull(v) {
    return typeof v === "string" && v.length > 0 ? v : null;
}

function countOf(v) {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * @param {object} args
 * @param {Array<object>} [args.moveBonuses]     resolveFight's result.moveBonuses (triggered snapshot)
 * @param {Array<object>} [args.sessionBonuses]  resolveFight's result.sessionBonuses
 * @param {Array<string>} [args.equippedOrder]   fighter.specialMovesEquipped (display order)
 * @param {Object<string,string>} [args.ownedRarities] moveId -> rarity, fallback for legacy
 *                                                snapshots whose entries carry no `rarity`
 * @returns {import("./fightBreakdownView").LoadoutSnapshot}
 */
function buildLoadoutSnapshot(args) {
    const { moveBonuses, sessionBonuses, equippedOrder, ownedRarities } = isPlainObject(args) ? args : {};
    const out = { moves: [], camp: [] };
    try {
        const rarities = isPlainObject(ownedRarities) ? ownedRarities : {};
        const order = Array.isArray(equippedOrder) ? equippedOrder.map(String) : [];

        const seen = new Set();
        const rows = [];
        for (const entry of Array.isArray(moveBonuses) ? moveBonuses : []) {
            if (!isPlainObject(entry)) continue;
            const ids = Array.isArray(entry.moveIds) && entry.moveIds.length ? entry.moveIds : [entry.moveId];
            for (const rawId of ids) {
                if (typeof rawId !== "string" || !rawId) continue;
                if (rawId.startsWith("persona:")) continue; // persona lanes are not cards
                const def = SPECIAL_MOVES_BY_ID[rawId];
                if (!def) {
                    console.warn(`[fightLoadoutSnapshot] unknown moveId ${rawId}; skipping`);
                    continue;
                }
                if (seen.has(rawId)) continue;
                seen.add(rawId);
                rows.push({
                    moveId: rawId,
                    name: def.name || rawId,
                    rarity: strOrNull(entry.rarity) ?? strOrNull(rarities[rawId]) ?? null,
                    // Catalog type: legacy frozen entries have no effectType (B.6).
                    effectType: strOrNull(def.effectType) ?? strOrNull(entry.effectType),
                    bonusType: strOrNull(entry.bonusType) ?? strOrNull(def.bonusType),
                    triggerCondition: strOrNull(entry.triggerCondition) ?? strOrNull(def.triggerCondition),
                    art: strOrNull(def.art),
                    triggered: !!entry.triggered,
                    // A merged entry fires as one, so every id in it carries the same count.
                    firedCount: countOf(entry.triggerCount),
                });
            }
        }
        // Equipped order first; ids not in the equipped list keep their input order, last.
        const rank = (id) => {
            const i = order.indexOf(id);
            return i === -1 ? Number.MAX_SAFE_INTEGER : i;
        };
        out.moves = rows
            .map((r, i) => ({ r, i }))
            .sort((a, b) => rank(a.r.moveId) - rank(b.r.moveId) || a.i - b.i)
            .map((x) => x.r);

        for (const b of Array.isArray(sessionBonuses) ? sessionBonuses : []) {
            if (!isPlainObject(b)) continue;
            const sessionType = strOrNull(b.sessionType);
            out.camp.push({
                sessionType,
                label: strOrNull(b.label) ?? (sessionType && CAMP_SESSIONS[sessionType]?.label) ?? sessionType,
                matchStatus: strOrNull(b.matchStatus),
                triggered: !!b.triggered,
                firedCount: countOf(b.triggerCount),
            });
        }
    } catch (e) {
        console.error("[fightLoadoutSnapshot] build failed:", e.message);
        return { moves: [], camp: [] };
    }
    return out;
}

module.exports = { buildLoadoutSnapshot };
