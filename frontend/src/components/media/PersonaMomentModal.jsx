import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { t } from "@/lib/i18n";
import { archetypeColor } from "./personaTypes";

const GOLD = "#d4a820";

/**
 * Persona Moment celebration modal — two variants, title-led (no art):
 *  - CROWNED: first-ever claim of an archetype ("the press has spoken") with the
 *    live modifier chips that just switched on.
 *  - SIGNATURE: heat crossed 70 — signature name + payoff + retention hook.
 *
 * `moment` comes from personaMoments.js (backend crownedInfo/signatureInfo,
 * spread onto {type}); null renders nothing. Fires once ever per archetype
 * (crownedArchetypes) / on aggregate signature activation only.
 */
export function PersonaMomentModal({ moment, onClose, onSeePersona }) {
  useEffect(() => {
    if (!moment) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moment, onClose]);

  if (!moment) return null;

  const isCrowned = moment.type === "CROWNED";
  const color = archetypeColor(moment.archetype);
  const accent = isCrowned ? color : GOLD;
  const modifiers = isCrowned ? (moment.modifiers || []) : [];
  const heat = Math.max(0, Math.min(100, Number(moment.heat) || 0));
  // SIGNATURE_DESC strings lead with "NAME — ..." (needed where the name isn't
  // shown); here the name is the headline, so drop the redundant prefix.
  const sigDesc = moment.desc && moment.name && moment.desc.startsWith(`${moment.name} — `)
    ? moment.desc.slice(moment.name.length + 3)
    : moment.desc;

  return createPortal(
    <div className="banner-unlock-overlay" role="dialog" aria-modal="true" aria-label={t("media.persona.moment.ariaLabel")}>
      <div className="banner-unlock-backdrop" onClick={onClose} />
      <div
        className="persona-moment-modal"
        style={{ "--pm-color": color, "--pm-accent": accent, "--pm-glow": `${accent}55`, "--pm-tint": `${accent}20` }}
      >
        <div className="persona-moment-top">
          <span className="persona-moment-eyebrow">
            {isCrowned
              ? <><Sparkles size={12} aria-hidden="true" /> {t("media.persona.moment.crownedEyebrow")}</>
              : <><Zap size={12} aria-hidden="true" /> {t("media.persona.moment.signatureEyebrow")}</>}
          </span>

          {isCrowned ? (
            <>
              <div className="persona-moment-title">{moment.label}</div>
              {moment.epithet && <div className="persona-moment-epithet">{moment.epithet}</div>}
            </>
          ) : (
            <>
              <div className="persona-moment-title persona-moment-title--sub">{moment.archetypeLabel}</div>
              <div className="persona-moment-signame">{moment.name}</div>
              {sigDesc && <div className="persona-moment-sigdesc">{sigDesc}</div>}
            </>
          )}
        </div>

        <div className="persona-moment-body">
          {isCrowned ? (
            <>
              <div className="persona-moment-lede">{t("media.persona.moment.crownedLede")}</div>
              {modifiers.length > 0 && (
                <div className="persona-moment-mods">
                  {modifiers.map((m) => {
                    const tone = m.cosmetic ? "cosmetic" : (m.good === true ? "buff" : m.good === false ? "debuff" : "");
                    const ToneIcon = m.cosmetic ? Sparkles : (m.good === false ? TrendingDown : TrendingUp);
                    return (
                      <span key={m.key} className={`persona-mod-chip ${tone} persona-mod-chip--static`} title={m.desc || undefined}>
                        <ToneIcon size={11} />
                        <span className="persona-mod-lbl">{m.label}</span>
                        <b className="persona-mod-val">{m.display}</b>
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="persona-moment-heat">
                <span className="persona-heat-lbl">{t("media.persona.heatLabel")}</span>
                <div className="persona-heat-track">
                  <div className="persona-heat-fill" style={{ width: `${heat}%`, background: color }} />
                </div>
                <span className="persona-heat-val">{heat}%</span>
              </div>
              <div className="persona-moment-lede">{t("media.persona.moment.signatureLede")}</div>
            </>
          )}
        </div>

        <div className="persona-moment-foot">
          <button type="button" className="persona-moment-btn" onClick={onClose}>
            {isCrowned ? t("media.persona.moment.crownedClose") : t("media.persona.moment.signatureClose")}
          </button>
          <button type="button" className="persona-moment-btn persona-moment-btn--primary" onClick={onSeePersona}>
            {t("media.persona.moment.seePersona")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
