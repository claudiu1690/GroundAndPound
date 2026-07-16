/**
 * Persona Moment plumbing — presentation glue, no business logic.
 *
 * The four persona-nudging actions (podcast / appearance / documentary /
 * post-fight interview) each return `personaNudge`; the backend attaches
 * `crownedInfo` (first-ever archetype claim, gated by persona.crownedArchetypes)
 * and `signatureInfo` (heat crossed 70) only when the milestone actually fired.
 * Call emitPersonaMoments(res.personaNudge) at the response site — App.jsx
 * listens for the event and renders PersonaMomentModal.
 */
export const PERSONA_MOMENT_EVENT = "gp:persona-moment";

export function emitPersonaMoments(personaNudge) {
  if (!personaNudge || typeof window === "undefined") return;
  const moments = [];
  if (personaNudge.crowned && personaNudge.crownedInfo) {
    moments.push({ type: "CROWNED", ...personaNudge.crownedInfo });
  }
  if (personaNudge.signatureActivated && personaNudge.signatureInfo) {
    moments.push({ type: "SIGNATURE", ...personaNudge.signatureInfo });
  }
  for (const moment of moments) {
    window.dispatchEvent(new CustomEvent(PERSONA_MOMENT_EVENT, { detail: moment }));
  }
}
