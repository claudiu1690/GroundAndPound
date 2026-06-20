import { useState } from "react";
import { WEIGHT_CLASSES, STYLE_OPTIONS, BACKSTORY_OPTIONS } from "../../constants/gameConstants";
import { api } from "../../api";
import { t } from "../../lib/i18n";

export function CreateFighter({ onCreated, onMessage }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [weightClass, setWeightClass] = useState(WEIGHT_CLASSES[0]);
  const [style, setStyle] = useState(STYLE_OPTIONS[0]);
  const [backstory, setBackstory] = useState(BACKSTORY_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      onMessage?.(t("account.createFighter.validationNameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        weightClass,
        style,
      };
      if (nickname.trim()) body.nickname = nickname.trim();
      if (backstory != null && backstory !== "") body.backstory = backstory;
      const fighter = await api.createFighter(body);
      onMessage?.(t("account.createFighter.successMsg"));
      onCreated?.(fighter);
      setFirstName("");
      setLastName("");
      setNickname("");
      setWeightClass(WEIGHT_CLASSES[0]);
      setStyle(STYLE_OPTIONS[0]);
      setBackstory(BACKSTORY_OPTIONS[0].value);
    } catch (err) {
      onMessage?.(err.message || t("common.error"));
    }
    setSubmitting(false);
  };

  return (
    <section className="panel create-fighter">
      <h2 className="panel-title">{t("account.createFighter.title")}</h2>
      <div className="panel-body">
        <form onSubmit={handleSubmit} className="create-fighter-form">
          <div className="form-row">
            <label>{t("account.createFighter.firstNameLabel")}</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("account.createFighter.firstNamePlaceholder")}
              required
            />
          </div>
          <div className="form-row">
            <label>{t("account.createFighter.lastNameLabel")}</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("account.createFighter.lastNamePlaceholder")}
              required
            />
          </div>
          <div className="form-row">
            <label>{t("account.createFighter.nicknameLabel")}</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("account.createFighter.nicknamePlaceholder")}
            />
          </div>
          <div className="form-row">
            <label>{t("account.createFighter.weightClassLabel")}</label>
            <select value={weightClass} onChange={(e) => setWeightClass(e.target.value)}>
              {WEIGHT_CLASSES.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>{t("account.createFighter.styleLabel")}</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>{t("account.createFighter.backstoryLabel")}</label>
            <select value={backstory ?? ""} onChange={(e) => setBackstory(e.target.value === "" ? null : e.target.value)}>
              {BACKSTORY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value ?? ""}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? t("account.createFighter.submitting") : t("account.createFighter.submitBtn")}
          </button>
        </form>
      </div>
    </section>
  );
}
