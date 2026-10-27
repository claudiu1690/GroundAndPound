import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { patchCatalogEquipped } from "../components/moves/catalogModel";

/**
 * Loads GET /fighters/:id/moves (equip slots + owned collection). Exposes
 * loading/error/data (all three states per project rules) plus equip/unequip
 * mutators that patch state directly from the endpoint's returned payload —
 * no follow-up refetch, so the slots/collection never flash on click-resolve.
 *
 * Also lazily loads the read-only Special Moves Catalog (GET
 * /fighters/:id/moves/catalog, docs/special-moves-catalog-spec.md) on
 * demand via `ensureCatalog`/`reloadCatalog` — existing consumers of this
 * hook (e.g. EquippedMovesCard on Career) never call those, so they never
 * trigger the catalog fetch.
 */
export function useSpecialMoves(fighterId) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    /** Inline error from the most recent equip/unequip attempt (e.g. backend's
     *  'Slot not unlocked yet' / 'Cannot change moves during an active fight
     *  camp' 400 messages) — surfaced next to the control that triggered it. */
    const [actionError, setActionError] = useState("");

    const [catalog, setCatalog] = useState(null);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState("");
    // "idle" | "loading" | "ready" | "error" — ensureCatalog only fires a
    // fetch from "idle", so a failed load is never silently auto-retried and
    // a ready one is never redundantly refetched.
    const catalogStatusRef = useRef("idle");
    // Bumped on every load attempt; a response is discarded if the counter
    // has moved on by the time it resolves (fighterId changed, or a second
    // load started while the first was still in flight).
    const catalogReqRef = useRef(0);

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!fighterId) return;
        if (!silent) setLoading(true);
        setError("");
        try {
            const res = await api.getMoves(fighterId);
            setData(res);
        } catch (e) {
            if (!silent) setError(e.message || "Could not load special moves.");
        } finally {
            if (!silent) setLoading(false);
        }
    }, [fighterId]);

    useEffect(() => { load(); }, [load]);

    // Reset the catalog whenever the fighter changes, so a stale catalog
    // from a previous fighter never flashes and any in-flight request for
    // the old fighterId is dropped as stale when it resolves.
    useEffect(() => {
        catalogReqRef.current += 1;
        catalogStatusRef.current = "idle";
        setCatalog(null);
        setCatalogError("");
        setCatalogLoading(false);
    }, [fighterId]);

    const loadCatalog = useCallback(async () => {
        if (!fighterId) return;
        const reqId = ++catalogReqRef.current;
        catalogStatusRef.current = "loading";
        setCatalogLoading(true);
        setCatalogError("");
        try {
            const res = await api.getMovesCatalog(fighterId);
            if (catalogReqRef.current !== reqId) return; // stale — a newer load (or fighterId change) won
            setCatalog(res);
            catalogStatusRef.current = "ready";
        } catch (e) {
            if (catalogReqRef.current !== reqId) return; // stale
            setCatalogError(e.message || "Could not load the catalog.");
            catalogStatusRef.current = "error";
        } finally {
            if (catalogReqRef.current === reqId) setCatalogLoading(false);
        }
    }, [fighterId]);

    /** Fetch the catalog the first time it's needed; a no-op once it's
     *  loading/ready/errored — it never auto-retries after a failure, the
     *  caller's own Retry control calls reloadCatalog instead. */
    const ensureCatalog = useCallback(() => {
        if (catalogStatusRef.current === "idle") loadCatalog();
    }, [loadCatalog]);

    /** Always (re)loads regardless of status — backs the catalog's Retry button. */
    const reloadCatalog = useCallback(() => loadCatalog(), [loadCatalog]);

    const equip = useCallback(async (moveId, slotIndex) => {
        if (!fighterId) return { ok: false };
        setActionError("");
        try {
            const res = await api.equipMove(fighterId, moveId, slotIndex);
            setData(res);
            setCatalog((c) => patchCatalogEquipped(c, res.equipped));
            return { ok: true, data: res };
        } catch (e) {
            const msg = e.message || "Could not equip that move.";
            setActionError(msg);
            return { ok: false, error: msg };
        }
    }, [fighterId]);

    const unequip = useCallback(async (slotIndex) => {
        if (!fighterId) return { ok: false };
        setActionError("");
        try {
            const res = await api.unequipMove(fighterId, slotIndex);
            setData(res);
            setCatalog((c) => patchCatalogEquipped(c, res.equipped));
            return { ok: true, data: res };
        } catch (e) {
            const msg = e.message || "Could not unequip that move.";
            setActionError(msg);
            return { ok: false, error: msg };
        }
    }, [fighterId]);

    return {
        data, loading, error, actionError, equip, unequip, refetch: load,
        catalog, catalogLoading, catalogError, ensureCatalog, reloadCatalog,
    };
}
