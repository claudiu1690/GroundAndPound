import { memo } from "react";
import { t } from "@/lib/i18n";

/** Nickname / gym editor. */
export const ProfileActionsSection = memo(function ProfileActionsSection({
  fighter,
  gyms,
  editing,
  setEditing,
  editNickname,
  setEditNickname,
  editGymId,
  setEditGymId,
  onRefreshFighter,
  onMessage,
  onSaveProfile,
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
          />
        </div>
        <div className="form-row">
          <label>{t("fighterProfile.edit.homeGymLabel")}</label>
          <select
            value={editGymId}
            onChange={(e) => setEditGymId(e.target.value)}
            className="form-select"
          >
            <option value="">{t("fighterProfile.edit.homeGymNone")}</option>
            {(gyms || []).map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="edit-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onSaveProfile}>
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
