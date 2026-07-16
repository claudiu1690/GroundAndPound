import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

const DEBOUNCE_MS = 350;

/**
 * Debounced POST /media/:fighterId/persona/preview.
 *
 * Call `run(body)` on every selection change (segments picked, tone chosen,
 * documentary focus/tone picked, etc.) — calls are debounced and superseded
 * (a stale in-flight response is dropped if a newer `run` landed first).
 * Call `clear()` when the selection becomes invalid/empty (e.g. nothing
 * picked yet) to hide the pill without waiting on a request.
 *
 * States exposed match the three-state rule: loading (spinner in the pill),
 * error (caller hides the pill — `preview` stays null), success (`preview`
 * holds the response).
 */
export function usePersonaPreview(fighterId) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);
  const seqRef = useRef(0);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    seqRef.current += 1; // invalidate any in-flight response
    setPreview(null);
    setError("");
    setLoading(false);
  }, []);

  const run = useCallback((body) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!fighterId || !body) {
      clear();
      return;
    }
    const mySeq = ++seqRef.current;
    setError("");
    // Stale-while-revalidate: the previous preview stays visible during the
    // debounce AND the fetch — `loading` only flips while a request is truly
    // in flight, so the pill never blanks to a spinner on every click.
    timerRef.current = setTimeout(async () => {
      if (seqRef.current !== mySeq) return; // superseded during debounce
      setLoading(true);
      try {
        const res = await api.previewPersona(fighterId, body);
        if (seqRef.current !== mySeq) return; // superseded
        setPreview(res);
        setLoading(false);
      } catch (e) {
        if (seqRef.current !== mySeq) return; // superseded
        setError(e.message || "Could not preview persona shift.");
        setPreview(null);
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }, [fighterId, clear]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { preview, loading, error, run, clear };
}
