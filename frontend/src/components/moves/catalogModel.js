/**
 * catalogModel.js is a plain ESM module (no JSX, no i18n) for the Special
 * Moves Catalog view (docs/special-moves-catalog-spec.md) — pure derivations
 * over the CatalogMove[] returned by GET /fighters/:id/moves/catalog. Each
 * entry is the `buildMoveView` shape from `services/specialMovesService.js`
 * plus `minRarity`, `domain`, `domainLabel`, `ladder`, `howToGet` (see that
 * spec for the exact fields) — never re-described here. Node-testable
 * directly (tests/frontend/movesCatalogModel.test.js loads it via
 * pathToFileURL), so it never imports React.
 */
// Explicit extension: this file is loaded directly by Node (the test above,
// via pathToFileURL) as well as bundled by Vite. Vite resolves extensionless
// specifiers; Node's native ESM loader does not.
import { RARITY } from "../../constants/specialMovesCatalog.js";

export const FILTER_ALL = "ALL";
export const TYPE_FILTERS = ["ALL", "PASSIVE", "PROC", "SIGNATURE"];
export const OWNERSHIP_FILTERS = ["ALL", "OWNED", "NOT_OWNED"];

/**
 * [{ value: domain, label: domainLabel }], unique, in first-seen order —
 * feeds the Discipline filter's option list without hand-authoring the
 * Striking/Wrestling/BJJ/Conditioning list a second time.
 */
export function disciplineOptions(moves) {
    const seen = new Set();
    const out = [];
    for (const m of moves || []) {
        if (!m || !m.domain || seen.has(m.domain)) continue;
        seen.add(m.domain);
        out.push({ value: m.domain, label: m.domainLabel || m.domain });
    }
    return out;
}

/**
 * Client-side filtering only (24 items, no pagination). Preserves the
 * server's default order (discipline, then type, then catalog order) —
 * never sorts.
 */
export function filterCatalog(moves, { domain = FILTER_ALL, effectType = FILTER_ALL, ownership = FILTER_ALL } = {}) {
    return (moves || []).filter((m) => {
        if (domain !== FILTER_ALL && m.domain !== domain) return false;
        if (effectType !== FILTER_ALL && m.effectType !== effectType) return false;
        if (ownership === "OWNED" && m.owned !== true) return false;
        if (ownership === "NOT_OWNED" && m.owned !== false) return false;
        return true;
    });
}

/**
 * Groups consecutive runs of the same domain into
 * [{ domain, label, moves }] — mirrors the server's default order, never
 * re-sorts, so a run only breaks when the domain actually changes.
 */
export function groupByDomain(moves) {
    const groups = [];
    for (const m of moves || []) {
        const last = groups[groups.length - 1];
        if (last && last.domain === m.domain) {
            last.moves.push(m);
        } else {
            groups.push({ domain: m.domain, label: m.domainLabel || m.domain, moves: [m] });
        }
    }
    return groups;
}

/** { owned, total } across the full (unfiltered) catalog passed in. */
export function collectedCount(moves) {
    const total = (moves || []).length;
    const owned = (moves || []).filter((m) => m.owned === true).length;
    return { owned, total };
}

/**
 * Always 4 cells in RARITY order, `{ rarity, rung|null }` — so the ladder
 * row never reflows between a 2-rung Signature (Rare + Legendary only) and
 * a 4-rung Passive/Proc. A rarity with no entry in `ladder` (below
 * minRarity, or a Signature's Common/Uncommon) gets `rung: null`.
 */
export function ladderCells(ladder) {
    const byRarity = new Map((ladder || []).map((r) => [r.rarity, r]));
    return RARITY.map((rarity) => ({ rarity, rung: byRarity.get(rarity) || null }));
}

/**
 * Returns a new catalog object with `moves` patched from an equip/unequip
 * response's own `equipped` array (no refetch): every entry gets
 * `isEquipped`/`slotIndex` recomputed. Never mutates the input; entries
 * whose equip state didn't change keep their original object identity so a
 * memoized grid item doesn't re-render. `catalog == null` passes through
 * unchanged.
 */
export function patchCatalogEquipped(catalog, equipped) {
    if (!catalog) return catalog;
    const bySlot = new Map((equipped || []).map((e) => [e.moveId, e.slotIndex]));
    const moves = (catalog.moves || []).map((m) => {
        const hasSlot = bySlot.has(m.moveId);
        const slotIndex = hasSlot ? (bySlot.get(m.moveId) ?? null) : null;
        const isEquipped = hasSlot;
        if (m.isEquipped === isEquipped && m.slotIndex === slotIndex) return m;
        return { ...m, isEquipped, slotIndex };
    });
    return { ...catalog, moves };
}
