import { memo } from "react";

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
          <label>Nickname</label>
          <input
            type="text"
            value={editNickname}
            onChange={(e) => setEditNickname(e.target.value)}
            placeholder="The Destroyer"
            className="form-input"
          />
        </div>
        <div className="form-row">
          <label>Home gym</label>
          <select
            value={editGymId}
            onChange={(e) => setEditGymId(e.target.value)}
            className="form-select"
          >
            <option value="">None</option>
            {(gyms || []).map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="edit-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onSaveProfile}>
            Save
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
});
