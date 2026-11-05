import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../api";
import {
  beaconShortfall,
  isEnergyShortfall,
  shortfallFromError,
  wholeEnergy,
} from "../components/shop/energyOfferModel";

const CLOSED = { open: false, source: null, need: 0, have: 0 };

/**
 * State for the out-of-energy offer dialog (one instance, owned by App).
 *
 * `open({ source, need, have })` is for screens that already know energy is short;
 * `openFromError(err, source, fallback)` is for a server refusal and returns false when the
 * error is not an energy shortfall, so the caller can fall through to its normal error path.
 * Opening fires the `energy_offer_shown` beacon (fire-and-forget; a failed beacon is ignored).
 *
 * `suppressed` keeps the offer quiet while the debut flow runs (a new player is never pitched
 * inside onboarding). While it is true `open` never shows the dialog; it calls `onSuppressed`
 * with the shortfall so the caller can tell the player in the normal message bar instead of
 * leaving a dead button, and `openFromError` returns false so callers fall through to their
 * usual error path.
 */
export function useEnergyOffer({ fighterId, suppressed = false, onSuppressed } = {}) {
  const [state, setState] = useState(CLOSED);
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;
  const onSuppressedRef = useRef(onSuppressed);
  onSuppressedRef.current = onSuppressed;

  const open = useCallback(({ source, need, have } = {}) => {
    if (suppressedRef.current) {
      onSuppressedRef.current?.({ need: wholeEnergy(need), have: wholeEnergy(have) });
      return;
    }
    const next = { open: true, source, need: wholeEnergy(need), have: wholeEnergy(have) };
    setState(next);
    const meta = beaconShortfall(need, have);
    if (fighterId && source && meta) {
      api.trackClientEvent(fighterId, "energy_offer_shown", { source, ...meta }).catch(() => {});
    }
  }, [fighterId]);

  const openFromError = useCallback((err, source, fallback) => {
    if (suppressedRef.current || !isEnergyShortfall(err)) return false;
    open({ source, ...shortfallFromError(err, fallback) });
    return true;
  }, [open]);

  const close = useCallback(() => setState(CLOSED), []);

  return useMemo(() => ({ state, open, openFromError, close }), [state, open, openFromError, close]);
}
