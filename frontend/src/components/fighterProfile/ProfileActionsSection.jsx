import { memo } from "react";
import { api } from "../../api";

/**
 * Nickname / gym editor, plus the Mental Reset action when required.
 * Rest was removed — health now regenerates passively over real time.
 */
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

  if (!fighter.mentalResetRequired) return null;

  return (
    <div className="profile-actions-row">
      <MentalResetButton
        fighterId={fighter._id}
        onRefreshFighter={onRefreshFighter}
        onMessage={onMessage}
      />
    </div>
  );
});

const MentalResetButton = memo(function MentalResetButton({
  fighterId,
  onRefreshFighter,
  onMessage,
}) {
  async function handleMentalReset() {
    try {
      await api.mentalReset(fighterId);
      onMessage?.("Mental Reset done. You're cleared to fight again.");
      if (onRefreshFighter) await onRefreshFighter(fighterId);
    } catch (e) {
      onMessage?.(e.message || "Mental Reset failed");
    }
  }

  return (
    <button
      type="button"
      className="btn btn-danger btn-sm"
      title="5 Energy — clears mental block after 3 consecutive losses"
      onClick={handleMentalReset}
    >
      Mental Reset (5E)
    </button>
  );
});
