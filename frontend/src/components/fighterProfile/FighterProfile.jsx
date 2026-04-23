import { memo, useCallback, useState } from "react";
import { badgesForDisplay, resourceRowsFromFighter, statMeterRows } from "./profileModel";
import { FighterBadgeRow } from "./FighterBadgeRow";
import { FighterInjuriesPanel } from "./FighterInjuriesPanel";
import { FighterMetaPanel } from "./FighterMetaPanel";
import { FighterNameplate } from "./FighterNameplate";
import { FighterResourceBars } from "./FighterResourceBars";
import { FighterStatMeters } from "./FighterStatMeters";
import { ProfileActionsSection } from "./ProfileActionsSection";
import { BannerPreview } from "../banner/BannerPreview";
import { BannerEditor } from "../banner/BannerEditor";

function FighterProfileLoading() {
  return (
    <section className="panel fighter-profile">
      <h2 className="panel-title">Fighter</h2>
      <div className="panel-body">
        <p className="panel-empty">Loading fighter data…</p>
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
}) {
  const [editing, setEditing] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editGymId, setEditGymId] = useState("");
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);

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
    <section className="panel fighter-profile">
      <h2 className="panel-title">Fighter</h2>

      <div className="fighter-profile-banner-wrap">
        <BannerPreview
          fighter={fighter}
          size="compact"
          onClick={() => setBannerEditorOpen(true)}
          title="Click to customize your banner"
        />
        <button
          type="button"
          className="banner-customize-btn"
          onClick={() => setBannerEditorOpen(true)}
          title="Customize banner"
        >
          ✎ Customize
        </button>
      </div>

      <BannerEditor
        open={bannerEditorOpen}
        fighter={fighter}
        onClose={() => setBannerEditorOpen(false)}
        onSaved={() => { if (onRefreshFighter) onRefreshFighter(fighter._id); }}
        onMessage={onMessage}
      />

      <FighterNameplate fighter={fighter} />
      <FighterResourceBars rows={resourceRowsFromFighter(fighter)} />
      <FighterMetaPanel fighter={fighter} campSlotsUsed={campSlotsUsed} />
      <FighterBadgeRow badges={badgesForDisplay(fighter.badges, fighter.activePerks)} />

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

      <FighterInjuriesPanel
        fighterId={fighter._id}
        injuries={fighter.injuries}
        onRefreshFighter={onRefreshFighter}
        onMessage={onMessage}
      />
    </section>
  );
});
