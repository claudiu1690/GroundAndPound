import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Toast state machine for post-training notifications.
 *
 * Lifecycle:
 *   addToast(vm)  → prepend (newest on top), cap at 4 (drop oldest if exceeding),
 *                   schedule a 3s auto-dismiss.
 *   beginDismiss  → mark `dismissing:true` (CSS exit transition), then after the
 *                   exit duration call remove(). Both the ✕ button and the auto
 *                   timer funnel through here so they share the exit animation.
 *   remove        → filter the toast out and clear its timers.
 *
 * All timers are tracked in refs and torn down on unmount — no setState after
 * unmount.
 */

const MAX_TOASTS = 4;
const AUTO_DISMISS_MS = 3000;
const EXIT_MS = 250; // keep in sync with the CSS exit transition

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  // Monotonic id counter — survives rapid clicks (Date.now() alone collides).
  const idRef = useRef(0);
  // id → auto-dismiss timeout handle
  const autoTimers = useRef(new Map());
  // id → exit timeout handle
  const exitTimers = useRef(new Map());

  const clearAutoTimer = useCallback((id) => {
    const t = autoTimers.current.get(id);
    if (t) {
      clearTimeout(t);
      autoTimers.current.delete(id);
    }
  }, []);

  const clearExitTimer = useCallback((id) => {
    const t = exitTimers.current.get(id);
    if (t) {
      clearTimeout(t);
      exitTimers.current.delete(id);
    }
  }, []);

  const remove = useCallback((id) => {
    clearAutoTimer(id);
    clearExitTimer(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, [clearAutoTimer, clearExitTimer]);

  const beginDismiss = useCallback((id) => {
    // Once dismissing, the auto timer is no longer needed.
    clearAutoTimer(id);
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t))
    );
    if (!exitTimers.current.has(id)) {
      const handle = setTimeout(() => remove(id), EXIT_MS);
      exitTimers.current.set(id, handle);
    }
  }, [clearAutoTimer, remove]);

  const addToast = useCallback((vm) => {
    const id = ++idRef.current;
    const toast = { ...vm, id, dismissing: false };

    setToasts((prev) => {
      const next = [toast, ...prev];
      // Cap at MAX_TOASTS: drop the oldest (last) immediately, no animation.
      while (next.length > MAX_TOASTS) {
        const dropped = next.pop();
        if (dropped) {
          clearAutoTimer(dropped.id);
          clearExitTimer(dropped.id);
        }
      }
      return next;
    });

    const handle = setTimeout(() => beginDismiss(id), AUTO_DISMISS_MS);
    autoTimers.current.set(id, handle);

    return id;
  }, [beginDismiss, clearAutoTimer, clearExitTimer]);

  // Tear down every outstanding timer on unmount.
  useEffect(() => {
    const autos = autoTimers.current;
    const exits = exitTimers.current;
    return () => {
      autos.forEach((t) => clearTimeout(t));
      autos.clear();
      exits.forEach((t) => clearTimeout(t));
      exits.clear();
    };
  }, []);

  return { toasts, addToast, beginDismiss };
}
