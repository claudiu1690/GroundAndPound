import { memo } from "react";
import { api } from "../../api";

/**
 * Nickname / gym editor, Rest, and Mental Reset.
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
  restDisabled,
  restTitle,
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

  return (
    <div className="profile-actions-row">
      <RestButton
        fighterId={fighter._id}
        disabled={restDisabled}
        title={restTitle}
        onRefreshFighter={onRefreshFighter}
        onMessage={onMessage}
      />
      {fighter.mentalResetRequired && (
        <MentalResetButton
          fighterId={fighter._id}
          onRefreshFighter={onRefreshFighter}
          onMessage={onMessage}
        />
      )}
    </div>
  );
});

const RestButton = memo(function RestButton({
  fighterId,
  disabled,
  title,
  onRefreshFighter,
  onMessage,
}) {
  async function handleRest() {
    try {
      await api.rest(fighterId);
      if (onRefreshFighter) await onRefreshFighter(fighterId);
    } catch (e) {
      onMessage?.(e.message || "Rest failed");
    }
  }

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={disabled}
      title={title}
      onClick={handleRest}
    >
      Rest (3E)
    </button>
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
