// Shared shape mirror + presentation helpers for the Persona system.
//
// Mirrors the backend payload 1:1 (per the architect contract) so the strip
// and all three tabs read the same shapes. This file owns *presentation*
// only (colors/labels/formatting) — persona resolution itself always comes
// from the backend (hub.persona / the persona/preview endpoint), never
// computed here.

import { t } from "@/lib/i18n";

/**
 * @typedef {"UNWRITTEN"|"VILLAIN"|"PEOPLES_CHAMP"|"BOOGEYMAN"|"ROLE_MODEL"} ArchetypeKey
 *
 * @typedef {Object} PersonaModifier
 * @property {string} key
 * @property {string} label
 * @property {"A"|"B"|"C"} kind
 * @property {number} value
 * @property {string} display
 * @property {boolean} active
 * @property {boolean} [cosmetic]
 *
 * @typedef {Object} PersonaBlackout
 * @property {boolean} active
 * @property {number} fightsRemaining
 *
 * @typedef {Object} PersonaHeatCap
 * @property {boolean} capped
 * @property {number} capValue
 * @property {number} [uncappedAtTier]
 *
 * @typedef {Object} Persona   // hub.persona — GET /media/:fighterId
 * @property {number} x
 * @property {number} y
 * @property {number} heat
 * @property {ArchetypeKey} archetype
 * @property {string} archetypeLabel
 * @property {string} epithet
 * @property {boolean} signatureActive
 * @property {string} [signatureName]
 * @property {PersonaBlackout} blackout
 * @property {PersonaHeatCap} heatCap
 * @property {PersonaModifier[]} modifiers
 *
 * @typedef {Object} PersonaNudge   // per-option nudge embedded on segments/appearances/documentary options
 * @property {number} dx
 * @property {number} dy
 * @property {ArchetypeKey} [quadrant]
 *
 * @typedef {Object} PersonaPoint
 * @property {number} x
 * @property {number} y
 * @property {number} heat
 * @property {ArchetypeKey} archetype
 *
 * @typedef {Object} PersonaActionNudge   // recordPodcast/takeAppearance/recordDocumentary/resolveInterview response.personaNudge
 * @property {number} dx
 * @property {number} dy
 * @property {PersonaPoint} before
 * @property {PersonaPoint} after
 * @property {boolean} breakingCharacter
 * @property {boolean} shattered
 * @property {boolean} blackoutSet
 * @property {boolean} signatureActivated
 * @property {boolean} signatureDeactivated
 *
 * @typedef {Object} PersonaPreview   // POST /media/:fighterId/persona/preview response
 * @property {number} dx
 * @property {number} dy
 * @property {PersonaPoint} before
 * @property {PersonaPoint} after
 * @property {boolean} breakingCharacter
 * @property {boolean} shattered
 * @property {boolean} wouldSetBlackout
 */

// Archetype → color, locked to the approved mock.
export const ARCHETYPE_META = {
  UNWRITTEN: { color: "#f4f5f8", labelKey: "media.persona.archetypes.UNWRITTEN" },
  VILLAIN: { color: "#e06479", labelKey: "media.persona.archetypes.VILLAIN" },
  PEOPLES_CHAMP: { color: "#7fc98f", labelKey: "media.persona.archetypes.PEOPLES_CHAMP" },
  BOOGEYMAN: { color: "#b9b9c4", labelKey: "media.persona.archetypes.BOOGEYMAN" },
  ROLE_MODEL: { color: "#e8cd7a", labelKey: "media.persona.archetypes.ROLE_MODEL" },
};

export function archetypeColor(key) {
  return ARCHETYPE_META[key]?.color || ARCHETYPE_META.UNWRITTEN.color;
}

/** Local display label for an archetype key — falls back to the raw key so an
 *  unrecognised enum value (contract drift) stays visible instead of blank. */
export function archetypeLabel(key) {
  const meta = ARCHETYPE_META[key];
  return meta ? t(meta.labelKey) : (key || t(ARCHETYPE_META.UNWRITTEN.labelKey));
}

/**
 * Octagon plot position (in %) from persona x/y, per the contract formula:
 *   left = 50 + (x/100)*~40%,  top = 50 - (y/100)*~40%
 * Clamped defensively — the backend owns the actual range, we just don't
 * want an out-of-range value pushing the dot outside the octagon.
 */
export function octagonPlot(x, y) {
  const cx = Math.max(-100, Math.min(100, Number(x) || 0));
  const cy = Math.max(-100, Math.min(100, Number(y) || 0));
  return {
    left: 50 + (cx / 100) * 40,
    top: 50 - (cy / 100) * 40,
  };
}

/**
 * "Hated −9 · Loud +7" style nudge chip text from {dx,dy}.
 * x-axis: negative dx = toward Hated, positive dx = toward Loved.
 * y-axis: positive dy = toward Loud, negative dy = toward Quiet.
 * Returns "" when there's nothing to show (both deltas are 0/absent).
 */
export function formatNudge(nudge) {
  if (!nudge) return "";
  const dx = Number(nudge.dx) || 0;
  const dy = Number(nudge.dy) || 0;
  const parts = [];
  if (dx !== 0) {
    const dir = dx < 0 ? t("media.persona.axis.hated") : t("media.persona.axis.loved");
    const sign = dx < 0 ? "−" : "+";
    parts.push(`${dir} ${sign}${Math.abs(dx)}`);
  }
  if (dy !== 0) {
    const dir = dy > 0 ? t("media.persona.axis.loud") : t("media.persona.axis.quiet");
    const sign = dy > 0 ? "+" : "−";
    parts.push(`${dir} ${sign}${Math.abs(dy)}`);
  }
  return parts.join(" · ");
}

/** "62→71" heat delta string for the preview pill. */
export function heatDeltaLabel(before, after) {
  if (before == null || after == null) return "";
  return `${Math.round(before)}→${Math.round(after)}`;
}
