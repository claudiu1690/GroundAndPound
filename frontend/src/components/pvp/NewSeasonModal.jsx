import { divisionLabel, divisionColor, seasonWeightClassLabel, OPEN_LABEL } from "./pvpConst";
import { t } from "../../lib/i18n";

/**
 * Screen 6 — New Season Start modal.
 * Shows twist, belt-unclaimed banner, reset summary, Enter the Ladder button.
 *
 * newDivision / newDp come directly from lastSeasonRecord (backend-computed).
 * Do NOT recompute them from SOFT_RESET — the backend is authoritative.
 */
export function NewSeasonModal({ season, newDivision, newDp, previousDivision, onEnter }) {
  if (!season) return null;

  // Use backend-provided reset landing spot. Fall back to "prospect" only as
  // a defensive last resort when no previous season exists.
  const resetDiv = newDivision ?? "prospect";
  const resetColor = divisionColor(resetDiv);
  // Starting DP from backend; zero when not provided.
  const startingDp = newDp ?? 0;

  const weeksLeft = season.endDate
    ? Math.max(0, Math.ceil((new Date(season.endDate) - Date.now()) / (7 * 86400000)))
    : 10;

  return (
    <div className="pvp-modal-overlay">
      <div className="pvp-modal">
        <div className="pvp-ns-hero">
          <div className="pvp-ns-glow" />
          <div className="pvp-ns-eyebrow">{t("pvp.newSeason.eyebrow")}</div>
          <div className="pvp-ns-title">
            Season {season.seasonNumber}
            {season.name ? ` — ${season.name}` : ""}
          </div>
          <div className="pvp-ns-sub">
            {t("pvp.newSeason.sub", { weeks: weeksLeft, weightClass: seasonWeightClassLabel(season), division: divisionLabel(resetDiv) })}
          </div>

          {/* Belt unclaimed */}
          <div className="pvp-ns-belt-unclaimed">
            <div className="pvp-nbu-icon">🏆</div>
            <div className="pvp-nbu-info">
              <div className="pvp-nbu-title">{t("pvp.newSeason.beltUnclaimedTitle", { n: season.seasonNumber })}</div>
              <div className="pvp-nbu-sub">
                {t("pvp.newSeason.beltUnclaimedSub", { weightClass: seasonWeightClassLabel(season) })}
              </div>
            </div>
          </div>

          {/* Twist */}
          {season.twistName && (
            <div className="pvp-ns-twist">
              <div>⚔</div>
              <div>
                <div className="pvp-nt-label">{t("pvp.newSeason.twistLabel")}</div>
                <div className="pvp-nt-name">{season.twistName}</div>
                <div className="pvp-nt-desc">{season.twistEffect ?? ""}</div>
              </div>
            </div>
          )}
        </div>

        <div className="pvp-modal-body">
          <div className="pvp-section-lbl">{t("pvp.newSeason.resetSectionLabel")}</div>
          <div className="pvp-ns-reset-grid">
            <div className="pvp-ns-reset-item">
              <div className="pvp-nsri-label">{t("pvp.newSeason.resetDivisionLabel")}</div>
              <div className="pvp-nsri-val">
                <span
                  className="pvp-div-badge"
                  style={{ color: resetColor, background: `${resetColor}20`, border: `1px solid ${resetColor}40` }}
                >
                  {divisionLabel(resetDiv)}
                </span>
              </div>
              {previousDivision && previousDivision !== resetDiv && (
                <div className="pvp-nsri-sub">{t("pvp.newSeason.resetFromSub", { division: divisionLabel(previousDivision) })}</div>
              )}
            </div>
            <div className="pvp-ns-reset-item">
              <div className="pvp-nsri-label">{t("pvp.newSeason.resetDpLabel")}</div>
              <div className="pvp-nsri-val">{startingDp.toLocaleString()}</div>
              <div className="pvp-nsri-sub">{t("pvp.newSeason.resetDpFloor", { division: divisionLabel(resetDiv) })}</div>
            </div>
            <div className="pvp-ns-reset-item">
              <div className="pvp-nsri-label">{t("pvp.newSeason.resetCarriesLabel")}</div>
              <div className="pvp-nsri-val" style={{ color: "#4ADE80", fontSize: 11 }}>
                {t("pvp.newSeason.resetCarriesValue")}
              </div>
            </div>
            <div className="pvp-ns-reset-item">
              <div className="pvp-nsri-label">{t("pvp.newSeason.resetResetsLabel")}</div>
              <div className="pvp-nsri-val" style={{ color: "#C8102E", fontSize: 11 }}>
                {t("pvp.newSeason.resetResetsValue")}
              </div>
            </div>
          </div>
        </div>

        <div className="pvp-modal-footer">
          <button className="pvp-mf-btn pvp-mf-btn-prim" onClick={onEnter} style={{ flex: 1 }}>
            {t("pvp.newSeason.enterLadderBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
