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
  campSlotsUsed,
  onUpdateFighter,
  onRefreshFighter,
  onMessage,
  openBannerEditorSignal,
}) {
  const [editing, setEditing] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);

  // Deep-link CTA from the banner-unlock modal's "Customize Banner" button —
  // bumped nonce (not a boolean) so repeat clicks re-open even if the editor
  // was already closed in between.
  useEffect(() => {
    if (openBannerEditorSignal) setBannerEditorOpen(true);
  }, [openBannerEditorSignal]);

  // Prefill the box with the current nickname each time the editor opens: an empty
  // nickname on save clears it server-side, so a blank box must be a deliberate choice.
  const currentNickname = fighter?.nickname || "";
  useEffect(() => {
    if (editing) setEditNickname(currentNickname);
    // Only on open; typing must not be overwritten by a background fighter refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const saveProfile = useCallback(async () => {
    if (!fighter?._id || !onUpdateFighter || saving) return;
    // Unchanged nickname: skip the request so a legacy nickname that predates the
    // validation rules can be left alone without the server rejecting it.
    if (editNickname.trim() === (fighter.nickname ?? "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await onUpdateFighter(fighter._id, {
        nickname: editNickname.trim(),
      });
      // Keep the editor open on failure so the player can correct the nickname;
      // the parent has already shown the server's message.
      if (!result || result.ok !== false) setEditing(false);
    } catch (_) {
      /* parent surfaces the error; leave the editor open */
    } finally {
      setSaving(false);
    }
  }, [fighter, onUpdateFighter, editNickname, saving]);

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
        editing={editing}
        setEditing={setEditing}
        editNickname={editNickname}
        setEditNickname={setEditNickname}
        onRefreshFighter={onRefreshFighter}
        onMessage={onMessage}
        onSaveProfile={saveProfile}
        saving={saving}
      />

      {fighter.statProgress && (
        <FighterStatMeters rows={statMeterRows(fighter.statProgress)} />
      )}

      <FighterInjuriesPanel injuries={fighter.injuries} />
    </section>
  );
});
