import { t } from "../../lib/i18n";

// Shared with AuthPage's register step-2 form and GuestStart — keep these in
// sync (do not fork). If these ever need to diverge, move to gameConstants.
export const WEIGHT_CLASSES = ["Featherweight", "Lightweight", "Middleweight", "Heavyweight"];
export const STYLES = ["Boxer", "Kickboxer", "Wrestler", "Brazilian Jiu-Jitsu", "Muay Thai", "Judo", "Sambo", "Capoeira"];
export const BACKSTORIES = ["Street Fighter", "College Wrestler", "Kickboxing Champion", "Army Veteran", "MMA Prodigy", "Late Bloomer"];

export const STYLE_DESC = {
  "Boxer":               "Precise striking, footwork and evasion. Primary stats: STR, SPD, CHN.",
  "Kickboxer":           "Explosive combinations on the feet. Primary stats: STR, SPD, LEG.",
  "Wrestler":            "Dominant takedowns and cage control. Primary stats: WRE, GND, STR.",
  "Brazilian Jiu-Jitsu": "Ground specialist with elite submissions. Primary stats: GND, SUB, WRE.",
  "Muay Thai":           "Eight-limb striker, devastating clinch. Primary stats: STR, LEG, SPD.",
  "Judo":                "Explosive throws into top position. Primary stats: WRE, GND, STR.",
  "Sambo":               "Hybrid wrestling and submission grappler. Primary stats: WRE, SUB, GND.",
  "Capoeira":            "Unpredictable movement and speed. Primary stats: SPD, LEG, FIQ.",
};

export const BACKSTORY_DESC = {
  "Street Fighter":        "+5 CHN — Tougher chin, survived hard knocks.",
  "College Wrestler":      "+8 WRE — Solid wrestling base before turning pro.",
  "Kickboxing Champion":   "+6 STR, +4 LEG — Seasoned on the feet.",
  "Army Veteran":          "+10 Max Stamina — Iron conditioning from service.",
  "MMA Prodigy":           "+2 to all stats — Born for this sport.",
  "Late Bloomer":          "+25% training XP — A slow start, explosive ceiling.",
};

/**
 * The register step-2 "build your fighter" fieldset (firstName, lastName,
 * nickname, weightClass, style, backstory) — extracted so GuestStart can
 * reuse it exactly rather than duplicating markup. Purely presentational;
 * all state lives in the parent (AuthPage or GuestStart).
 */
export function FighterFields({
  firstName, setFirstName,
  lastName, setLastName,
  nickname, setNickname,
  weightClass, setWeightClass,
  style, setStyle,
  backstory, setBackstory,
}) {
  return (
    <>
      <div className="auth-row">
        <div className="auth-field">
          <label>{t("auth.register.firstNameLabel")}</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("auth.register.firstNamePlaceholder")} required />
        </div>
        <div className="auth-field">
          <label>{t("auth.register.lastNameLabel")}</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("auth.register.lastNamePlaceholder")} required />
        </div>
      </div>
      <div className="auth-field">
        <label>{t("auth.register.nicknameLabel")} <span className="auth-hint">{t("auth.register.nicknameHint")}</span></label>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t("auth.register.nicknamePlaceholder")} />
      </div>
      <div className="auth-row">
        <div className="auth-field">
          <label>{t("auth.register.weightClassLabel")}</label>
          <select value={weightClass} onChange={(e) => setWeightClass(e.target.value)}>
            {WEIGHT_CLASSES.map((wc) => <option key={wc}>{wc}</option>)}
          </select>
        </div>
        <div className="auth-field">
          <label>{t("auth.register.fightingStyleLabel")}</label>
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            {STYLES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="auth-desc">{STYLE_DESC[style]}</div>
      <div className="auth-field">
        <label>{t("auth.register.backstoryLabel")}</label>
        <select value={backstory} onChange={(e) => setBackstory(e.target.value)}>
          {BACKSTORIES.map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      <div className="auth-desc">{BACKSTORY_DESC[backstory]}</div>
    </>
  );
}
