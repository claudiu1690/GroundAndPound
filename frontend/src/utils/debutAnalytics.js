import { api } from "../api";
import { isPhoneLayout } from "./layout";

/**
 * Debut-flow funnel beacons (analytics event `debut_step`, steps 1 to 6).
 *
 *   1 home phase done (player reached the Fight tab)   2 fight accepted
 *   3 Fighter Report closed                            4 Begin Fight pressed
 *   5 reveal started (or result committed when the reveal is off)
 *   6 result screen left
 *
 * Each step is sent once per fighter per browser session. `msSinceStart` is measured from the
 * first time this session saw the debut flow. Fire and forget: a failed beacon is ignored.
 */
const startKey = (fighterId) => `gnp_debut_start:${fighterId}`;
const stepKey = (fighterId, step) => `gnp_debut_step:${fighterId}:${step}`;

function read(key) {
  try { return sessionStorage.getItem(key); } catch (_) { return null; }
}
function write(key, value) {
  try { sessionStorage.setItem(key, value); } catch (_) { /* storage blocked */ }
}

/** Stamp the start of the debut flow once. Returns the stamp (ms since epoch). */
export function markDebutStart(fighterId) {
  if (!fighterId) return Date.now();
  const existing = Number(read(startKey(fighterId)));
  if (Number.isFinite(existing) && existing > 0) return existing;
  const now = Date.now();
  write(startKey(fighterId), String(now));
  return now;
}

/** Send `debut_step` for `step` (1..6) at most once per fighter per session. */
export function trackDebutStep(fighterId, step) {
  if (!fighterId || !(step >= 1 && step <= 6)) return;
  if (read(stepKey(fighterId, step))) return;
  write(stepKey(fighterId, step), "1");
  const started = markDebutStart(fighterId);
  const msSinceStart = Math.max(0, Math.min(2_592_000_000, Date.now() - started));
  api.trackClientEvent(fighterId, "debut_step", {
    step,
    msSinceStart,
    device: isPhoneLayout() ? "phone" : "desktop",
  }).catch(() => {});
}
