import { memo } from "react";
import { t } from "@/lib/i18n";

/** Nickname editor. */
export const ProfileActionsSection = memo(function ProfileActionsSection({
  fighter,
  editing,
  setEditing,
  editNickname,
  setEditNickname,
  onRefreshFighter,
  onMessage,
  onSaveProfile,
  saving = false,
}) {
  if (editing) {
    return (
      <div className="profile-edit">
        <div className="form-row">
          <label>{t("fighterProfile.edit.nicknameLabel")}</label>
          <input
            type="text"
            value={editNickname}
            onChange={(e) => setEditNickname(e.target.value)}
            placeholder={t("fighterProfile.edit.nicknamePlaceholder")}
            className="form-input"
            maxLength={20}
          />
        </div>
        <div className="edit-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onSaveProfile} disabled={saving}>
            {t("common.save")}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditing(false)}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return null;
});
