import { memo, useCallback, useState } from "react";
import { badgesForDisplay, resourceRowsFromFighter, statMeterRows } from "./profileModel";
import { FighterBadgeRow } from "./FighterBadgeRow";
import { FighterInjuriesPanel } from "./FighterInjuriesPanel";
import { FighterMetaPanel } from "./FighterMetaPanel";
import { FighterNameplate } from "./FighterNameplate";
import { FighterResourceBars } from "./FighterResourceBars";
import { FighterStatMeters } from "./FighterStatMeters";
import { ProfileActionsSection } from "./ProfileActionsSection";

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
