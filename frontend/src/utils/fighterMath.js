/**
 * Small pure helpers over the fighter payload. Display gating only; the server
 * is the source of truth for anything that changes game state.
 */

/** Lifetime resolved PvE fights: wins + losses + draws (mirrors the server's pveFightCount). */
export function pveFightCount(fighter) {
  const r = fighter?.record;
  if (!r) return 0;
  return (r.wins || 0) + (r.losses || 0) + (r.draws || 0);
}

/** True while the fighter has never resolved a PvE fight (the debut is still ahead). */
export function isPreDebut(fighter) {
  return !!fighter && pveFightCount(fighter) === 0;
}
