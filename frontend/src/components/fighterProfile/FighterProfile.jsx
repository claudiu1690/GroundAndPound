import { memo, useCallback, useEffect, useState } from "react";
import { resourceRowsFromFighter, statMeterRows } from "./profileModel";
import { FighterInjuriesPanel } from "./FighterInjuriesPanel";
import { FighterMetaPanel } from "./FighterMetaPanel";
import { FighterResourceBars } from "./FighterResourceBars";
import { FighterStatMeters } from "./FighterStatMeters";
import { ProfileActionsSection } from "./ProfileActionsSection";
import { BannerPreview } from "../banner/BannerPreview";
import { BannerEditor } from "../banner/BannerEditor";
import { t } from "@/lib/i18n";

function FighterProfileLoading() {
  return (
    <section className="panel fighter-profile" data-tut="fighter-profile">
      <h2 className="panel-title">{t("fighterProfile.panelTitle")}</h2>
      <div className="panel-body">
        <p className="panel-empty">{t("fighterProfile.loading")}</p>
      </div>
    </section>
  );
}

/**
 * Sidebar fighter card: identity, vitals, fame, badges, quick actions, stats, injuries.
 * Layout is composed from small presentational pieces; numeric/UI copy lives in `profileModel`.
 */
export const FighterProfile = memo(function FighterProfile({
  fighter,
  gyms,
  campSlotsUsed,
  onUpdateFighter,
  onRefreshFighter,
  onMessage,
  openBannerEditorSignal,
}) {
  const [editing, setEditing] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editGymId, setEditGymId] = useState("");
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);

  // Deep-link CTA from the banner-unlock modal's "Customize Banner" button —
  // bumped nonce (not a boolean) so repeat clicks re-open even if the editor
  // was already closed in between.
  useEffect(() => {
    if (openBannerEditorSignal) setBannerEditorOpen(true);
  }, [openBannerEditorSignal]);

  const saveProfile = useCallback(async () => {
    if (!fighter?._id || !onUpdateFighter) return;
    try {
      await onUpdateFighter(fighter._id, {
        nickname: editNickname.trim() || undefined,
        gymId: editGymId || null,
      });
      setEditing(false);
    } catch (_) {
      /* parent / API surfaces errors elsewhere if needed */
    }
  }, [fighter, onUpdateFighter, editNickname, editGymId]);

  if (!fighter) {
    return <FighterProfileLoading />;
  }

  return (
    <section className="panel fighter-profile" data-tut="fighter-profile">
      <h2 className="panel-title">{t("fighterProfile.panelTitle")}</h2>

      <div className="fighter-profile-banner-wrap">
        <BannerPreview
          fighter={fighter}
          size="compact"
          onClick={() => setBannerEditorOpen(true)}
          title={t("fighterProfile.bannerCustomizeTitle")}
        />
        <button
          type="button"
          className="banner-customize-btn"
          onClick={() => setBannerEditorOpen(true)}
          title={t("fighterProfile.bannerCustomizeBtnTitle")}
        >
          {t("fighterProfile.bannerCustomizeBtn")}
        </button>
      </div>

      <BannerEditor
        open={bannerEditorOpen}
        fighter={fighter}
        onClose={() => setBannerEditorOpen(false)}
        onSaved={() => { if (onRefreshFighter) onRefreshFighter(fighter._id); }}
        onMessage={onMessage}
      />

      <FighterResourceBars rows={resourceRowsFromFighter(fighter)} />
      <FighterMetaPanel fighter={fighter} campSlotsUsed={campSlotsUsed} />
      {/* Badge display removed — badges still earned/stored; will return as achievements.
          Re-enable: render <FighterBadgeRow badges={badgesForDisplay(fighter.badges, fighter.activePerks)} /> */}

      <ProfileActionsSection
        fighter={fighter}
        gyms={gyms}
        editing={editing}
        setEditing={setEditing}
        editNickname={editNickname}
        setEditNickname={setEditNickname}
        editGymId={editGymId}
        setEditGymId={setEditGymId}
        onRefreshFighter={onRefreshFighter}
        onMessage={onMessage}
        onSaveProfile={saveProfile}
      />

      {fighter.statProgress && (
        <FighterStatMeters rows={statMeterRows(fighter.statProgress)} />
      )}

      <FighterInjuriesPanel injuries={fighter.injuries} />
    </section>
  );
});
