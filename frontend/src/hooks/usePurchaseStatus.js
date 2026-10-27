import { useEffect, useState } from "react";
import { api } from "../api";

export const PURCHASE_POLL_INTERVAL_MS = 2000;
export const PURCHASE_POLL_MAX_ATTEMPTS = 15; // 15 x 2s = 30s, then we stop asking

/**
 * Follows one Stripe Checkout Session after the player is sent back to the game.
 *
 * Polls GET /fighters/:id/shop/purchases/:sessionId (PurchaseStatusResponse in
 * controllers/paymentController.js). The redirect usually beats the webhook by a second or
 * two, so "not there yet" is the normal first answer, not a failure.
 *
 * phase:
 *   idle      no sessionId, nothing to follow
 *   pending   asking, or the order exists but is not delivered yet (created | paid)
 *   fulfilled drinks delivered; `drinks` is the amount that landed
 *   failed    the payment expired / failed / was refunded / disputed, or the id was rejected
 *   timeout   30 s passed without a final answer; the webhook may still land later
 *
 * 404 and network errors are treated as "still pending" until the attempt budget runs out.
 * A 400 (malformed session id) cannot ever succeed, so it ends as `failed` straight away.
 *
 * Attempts run back to back on a timer chain (never overlapping) and the chain is cleared on
 * unmount or when the sessionId changes.
 */
export function usePurchaseStatus(fighterId, sessionId) {
  // Start in "pending" when there is something to follow so the first paint already shows the
  // order banner instead of flashing an empty frame before the effect runs.
  const [state, setState] = useState(() => ({
    phase: fighterId && sessionId ? "pending" : "idle",
    drinks: 0,
  }));

  useEffect(() => {
    if (!fighterId || !sessionId) {
      setState({ phase: "idle", drinks: 0 });
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let attempts = 0;
    setState({ phase: "pending", drinks: 0 });

    const finish = (next) => {
      if (!cancelled) setState(next);
    };

    const poll = async () => {
      attempts += 1;
      try {
        const res = await api.getPurchaseStatus(fighterId, sessionId);
        if (cancelled) return;
        if (res.status === "fulfilled") {
          finish({ phase: "fulfilled", drinks: res.drinks ?? 0 });
          return;
        }
        if (res.status === "failed" || res.status === "refunded" || res.status === "disputed") {
          finish({ phase: "failed", drinks: 0 });
          return;
        }
        // created | paid: keep waiting
      } catch (e) {
        if (cancelled) return;
        if (e && e.status === 400) {
          finish({ phase: "failed", drinks: 0 });
          return;
        }
        // 404 purchase_not_found and network blips: still pending until the budget is spent.
      }
      if (attempts >= PURCHASE_POLL_MAX_ATTEMPTS) {
        finish({ phase: "timeout", drinks: 0 });
        return;
      }
      timer = setTimeout(poll, PURCHASE_POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fighterId, sessionId]);

  return state;
}
