import { Loader2, AlertTriangle } from "lucide-react";
import { t } from "@/lib/i18n";
import { archetypeLabel, heatDeltaLabel } from "./personaTypes";

/**
 * The "this {episode/appearance/documentary} moves you → {archetype}
 * (heat→heat)" pill that sits above a commit/record button. Purely
 * presentational — all resolution comes from the `preview` prop, which the
 * caller feeds from `usePersonaPreview` (POST /media/:id/persona/preview).
 *
 * Three states per project convention:
 *  - loading      -> spinner pill
 *  - !preview     -> renders nothing (no selection yet, or the preview call
 *                     errored — errors are swallowed by the hook and hidden
 *                     here rather than shown, per spec)
 *  - preview      -> archetype + heat delta, plus a red "Breaking Character"
 *                     warning pill when the action would shatter the persona.
 */
export function PersonaPreviewPill({ loading, preview, subjectKey }) {
  // Stale-while-revalidate: with an existing preview, keep it visible (dimmed)
  // during a refresh — swapping to a spinner on every click made the whole
  // card reflow and read as "weird re-rendering".
  if (loading && !preview) {
    return (
      <div className="persona-preview-pill persona-preview-pill--loading">
        <Loader2 size={12} className="persona-preview-spin" />
        {t("media.persona.preview.loading")}
      </div>
    );
  }

  if (!preview) return null;

  const before = preview.before || {};
  const after = preview.after || {};

  return (
    <div className={`persona-preview-wrap${loading ? " is-refreshing" : ""}`}>
      <div className="persona-preview-pill">
        {t("media.persona.preview.movesTo", {
          subject: t(subjectKey || "media.persona.preview.subjects.default"),
          archetype: archetypeLabel(after.archetype),
          delta: heatDeltaLabel(before.heat, after.heat),
        })}
      </div>
      {preview.breakingCharacter && (
        <div className="persona-preview-warn">
          <AlertTriangle size={12} />
          {t("media.persona.preview.breakingCharacter")}
        </div>
      )}
    </div>
  );
}
