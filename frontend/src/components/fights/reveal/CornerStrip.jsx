import { memo } from "react";
import { t } from "@/lib/i18n";
import { RARITY_COLORS } from "../../../constants/specialMovesCatalog";
import { ArtThumb } from "../breakdown/ArtThumb.jsx";

/**
 * "Your corner": the cards and camp sessions the player brought, dimmed until they fire.
 * `corner` = { moves, camp } from the script (the loadout rows), `state` = the current item's
 * corner snapshot ({ moves: {id: count}, camp: {session: true}, passives: [id] }).
 * Hidden when the fight has no loadout snapshot (`corner` null).
 */
export const CornerStrip = memo(function CornerStrip({ corner, state }) {
  if (!corner) return null;
  const moves = corner.moves ?? [];
  const camp = corner.camp ?? [];
  const counts = state?.moves ?? {};
  const lit = state?.camp ?? {};
  const passives = state?.passives ?? [];
  const ready = state?.ready ?? [];

  return (
    <div className="fr-rv-corner" data-testid="reveal-corner">
      <div className="fr-rv-corner-lab">
        <span>{t("reveal.corner")}</span>
        <span>{t("reveal.cornerSub")}</span>
      </div>
      {moves.length === 0 && camp.length === 0 ? (
        <div className="fr-rv-corner-empty">{t("reveal.cornerEmpty")}</div>
      ) : (
        <div className="fr-rv-corner-row">
          {moves.map((m) => {
            const n = counts[m.moveId] || 0;
            const on = n > 0 || passives.includes(m.moveId);
            const isReady = ready.includes(m.moveId);
            return (
              <span
                key={m.moveId}
                className={`fr-rv-mini${on ? " is-lit" : ""}${isReady ? " is-ready" : ""}`}
                data-ready={isReady ? "1" : undefined}
                style={{ "--rarity-color": RARITY_COLORS[m.rarity] || RARITY_COLORS.COMMON }}
                title={m.name}
                aria-label={`${m.name}${isReady ? ` ${t("reveal.ready.tab")}` : ""}${n > 0 ? ` ${t("reveal.times", { n })}` : ""}`}
              >
                <ArtThumb art={m.art} name={m.name} className="fr-rv-mini-art" />
                {isReady && <span className="fr-rv-mini-ready" aria-hidden="true">{t("reveal.ready.tab")}</span>}
                {n > 0 && <span key={n} className="fr-rv-mini-n">{t("reveal.times", { n })}</span>}
              </span>
            );
          })}
          {moves.length > 0 && camp.length > 0 && <span className="fr-rv-corner-sep" aria-hidden="true" />}
          {camp.length > 0 && (
            <span className="fr-rv-camps">
              {camp.map((c) => (
                <span key={c.sessionType} className={`fr-rv-campchip${lit[c.sessionType] ? " is-lit" : ""}`} title={c.label}>
                  {c.label}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default CornerStrip;
