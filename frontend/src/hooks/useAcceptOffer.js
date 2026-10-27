import { useCallback, useEffect, useRef, useState } from "react";

/** Codes that mean "the board moved under you", the caller should reload. */
const STALE_CODES = new Set([
  "OFFER_NOT_ON_BOARD",
  "FIGHT_ALREADY_BOOKED",
  "TITLE_SHOT_LOCKED",
  "OFFER_BOARD_STALE",
]);

/**
 * Shared accept-offer flow for Home (NextFightCard/BookingsList) and the
 * Fight Hub (FightOffers.jsx), one place owns the non-blocking-injury
 * confirmation and the accepting-id in-flight guard so both surfaces behave
 * identically (offer-board-contract.md §5, "Accept from Home: exact
 * sequence").
 *
 * @param {{ fighter: object, onAcceptOffer: (opponentId:string) => Promise<{ok:true}|{ok:false,code?:string,message?:string}>,
 *           onStale?: () => void, onSuccess?: () => void }} args
 */
export function useAcceptOffer({ fighter, onAcceptOffer, onStale, onSuccess }) {
  const [acceptingId, setAcceptingId] = useState(null);
  const [pendingFight, setPendingFight] = useState(null); // { opponentId } | null
  // Home unmounts on a successful accept (activeTab flips to "fights"), so any
  // state write after the await must be guarded.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const runAccept = useCallback(
    async (opponentId) => {
      setAcceptingId(opponentId);
      try {
        const res = await onAcceptOffer(opponentId);
        if (!mountedRef.current) return;
        if (!res || res.ok === false) {
          setAcceptingId(null);
          if (res && STALE_CODES.has(res.code)) onStale?.();
          return;
        }
        // Success. Home unmounts (App flips to the fights tab) and the Fight
        // Hub swaps to the camp view once the fighter reloads. If we are still
        // mounted in between, clear the in-flight id and let the caller reload
        // the board: the server's atomic claim makes a second accept harmless,
        // and the reloaded board comes back frozen with every slot unacceptable.
        if (mountedRef.current) {
          setAcceptingId(null);
          onSuccess?.();
        }
      } catch (_) {
        if (mountedRef.current) setAcceptingId(null);
      }
    },
    [onAcceptOffer, onStale, onSuccess]
  );

  const requestAccept = useCallback(
    (opponentId) => {
      const nonBlocking = (fighter?.injuries ?? []).filter((inj) => inj && !inj.cannotFight);
      if (nonBlocking.length > 0) {
        setPendingFight({ opponentId });
        return;
      }
      runAccept(opponentId);
    },
    [fighter, runAccept]
  );

  const injuryModal = {
    open: !!pendingFight,
    injuries: (fighter?.injuries ?? []).filter((inj) => inj && !inj.cannotFight),
    onCancel: () => setPendingFight(null),
    onConfirm: () => {
      const p = pendingFight;
      setPendingFight(null);
      if (p) runAccept(p.opponentId);
    },
  };

  return { requestAccept, acceptingId, injuryModal };
}
