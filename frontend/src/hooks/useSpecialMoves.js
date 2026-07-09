import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/**
 * Loads GET /fighters/:id/moves (equip slots + owned collection). Exposes
 * loading/error/data (all three states per project rules) plus equip/unequip
 * mutators that patch state directly from the endpoint's returned payload —
 * no follow-up refetch, so the slots/collection never flash on click-resolve.
 */
export function useSpecialMoves(fighterId) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    /** Inline error from the most recent equip/unequip attempt (e.g. backend's
     *  'Slot not unlocked yet' / 'Cannot change moves during an active fight
     *  camp' 400 messages) — surfaced next to the control that triggered it. */
    const [actionError, setActionError] = useState("");

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

    const equip = useCallback(async (moveId, slotIndex) => {
        if (!fighterId) return { ok: false };
        setActionError("");
        try {
            const res = await api.equipMove(fighterId, moveId, slotIndex);
            setData(res);
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
            return { ok: true, data: res };
        } catch (e) {
            const msg = e.message || "Could not unequip that move.";
            setActionError(msg);
            return { ok: false, error: msg };
        }
    }, [fighterId]);

    return { data, loading, error, actionError, equip, unequip, refetch: load };
}
