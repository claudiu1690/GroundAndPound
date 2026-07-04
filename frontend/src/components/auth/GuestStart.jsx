import { useState } from "react";
import { api, authStorage } from "../../api";
import { FighterFields, WEIGHT_CLASSES, STYLES, BACKSTORIES } from "./FighterFields";
import { RecoveryCodeModal } from "./RecoveryCodeModal";
import { t } from "../../lib/i18n";

/**
 * "Play as guest" — reuses the register step-2 fighter fieldset, skips
 * email/password entirely. On success: authStorage.save(token, fighterId),
 * show the one-time RecoveryCodeModal, then call onAuthenticated(fighterId)
 * only after the user confirms they've saved the code.
 *
 * Contract: POST /auth/guest → 201 { token, fighterId, accountId, recoveryCode }.
 */
export function GuestStart({ onAuthenticated, onCancel }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [nickname, setNickname]   = useState("");
  const [weightClass, setWeightClass] = useState(WEIGHT_CLASSES[2]);
  const [style, setStyle]         = useState(STYLES[0]);
  const [backstory, setBackstory] = useState(BACKSTORIES[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // Once creation succeeds we hold the fighterId + code and show the
  // one-time reveal modal; onAuthenticated fires only after confirmation.
  const [pending, setPending] = useState(null); // { fighterId, recoveryCode } | null

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) {
      setError(t("auth.validation.nameRequired"));
      return;
    }
    setLoading(true);
    try {
      const { token, fighterId, recoveryCode } = await api.createGuest({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim() || null,
        weightClass,
        style,
        backstory,
      });
      authStorage.save(token, fighterId);
      setPending({ fighterId, recoveryCode });
    } catch (err) {
      setError(err.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    return (
      <RecoveryCodeModal
        open
        code={pending.recoveryCode}
        onConfirm={() => onAuthenticated(pending.fighterId)}
      />
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-step-label">{t("auth.guest.startLabel")}</div>
      <p className="auth-desc">{t("auth.guest.startDesc")}</p>
      <FighterFields
        firstName={firstName} setFirstName={setFirstName}
        lastName={lastName} setLastName={setLastName}
        nickname={nickname} setNickname={setNickname}
        weightClass={weightClass} setWeightClass={setWeightClass}
        style={style} setStyle={setStyle}
        backstory={backstory} setBackstory={setBackstory}
      />
      {error && <div className="auth-error">{error}</div>}
      <div className="auth-row auth-row-btns">
        <button type="button" className="auth-back" onClick={onCancel}>{t("auth.register.backBtn")}</button>
        <button className="auth-submit auth-submit-create" type="submit" disabled={loading}>
          {loading ? t("auth.guest.creating") : t("auth.guest.createBtn")}
        </button>
      </div>
    </form>
  );
}
