/**
 * Move art URL convention — mirrors the sponsor-card convention
 * (`/assets/sponsors/{catalogId}.webp` in ContractsTab) but for the moves
 * catalog's `art` slug. No final art assets exist yet (per spec); callers
 * must treat a missing image as a normal, non-error state and fall back to
 * a styled placeholder — see `useMoveArtExists` in MoveArt.jsx.
 */
export function moveArtUrl(art) {
    if (!art) return null;
    return `/assets/moves/${String(art).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webp`;
}
