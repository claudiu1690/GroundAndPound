import { useState } from "react";
import { Radio, Zap, ShieldAlert, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { t } from "@/lib/i18n";
import { archetypeColor, archetypeLabel, octagonPlot } from "./personaTypes";

// Corner placement for the four archetype quadrants inside the octagon.
// x = Hated(left)/Loved(right), y = Loud(top)/Quiet(bottom).
const QUADRANTS = [
  { key: "VILLAIN", pos: "tl" },
  { key: "PEOPLES_CHAMP", pos: "tr" },
  { key: "BOOGEYMAN", pos: "bl" },
  { key: "ROLE_MODEL", pos: "br" },
];

function Octagon({ persona }) {
  const archetype = persona?.archetype || "UNWRITTEN";
  const { left, top } = octagonPlot(persona?.x, persona?.y);
  const dotColor = archetypeColor(archetype);
  return (
    <div className="persona-octagon-wrap">
      {/* Archetype labels overlay the art's corner glows (text-shadow keeps them
          readable); the art's colored corners match the archetype palette. */}
      {QUADRANTS.map((q) => (
        <span
          key={q.key}
          className={`persona-quad-lbl persona-quad-lbl--${q.pos}${archetype === q.key ? " act" : ""}`}
          style={{ color: archetypeColor(q.key) }}
        >
          {archetypeLabel(q.key)}
        </span>
      ))}
      <div className="persona-octagon">
        <img
          className="persona-octagon-img"
          src="/assets/persona/octagon-map.webp"
          alt=""
          draggable="false"
        />
        <div
          className="persona-octagon-dot"
          style={{ left: `${left}%`, top: `${top}%`, background: dotColor, boxShadow: `0 0 0 3px ${dotColor}33, 0 0 12px ${dotColor}aa` }}
        />
      </div>
    </div>
  );
}

/**
 * Live-modifier chips. Each chip is "Label value" colored by polarity (buff
 * green / debuff red / flavor dashed); tapping one reveals a plain-language
 * line of what it actually does (`m.desc`, authored in personaConfig).
 */
function PersonaModifiers({ modifiers }) {
  const [openKey, setOpenKey] = useState(null);
  const open = modifiers.find((m) => m.key === openKey);
  return (
    <div className="persona-mods">
      <div className="persona-mods-hdr"><Radio size={11} /> {t("media.persona.modifiersTitle")}</div>
      {modifiers.length === 0 ? (
        <div className="persona-mods-empty">{t("media.persona.modifiersEmpty")}</div>
      ) : (
        <>
          <div className="persona-mods-list">
            {modifiers.map((m) => {
              const tone = m.cosmetic ? "cosmetic" : (m.good === true ? "buff" : m.good === false ? "debuff" : "");
              const ToneIcon = m.cosmetic ? Sparkles : (m.good === false ? TrendingDown : TrendingUp);
              return (
                <button
                  type="button"
                  key={m.key}
                  className={`persona-mod-chip ${tone}${m.active === false ? " inactive" : ""}${openKey === m.key ? " open" : ""}`}
                  title={m.desc || undefined}
                  onClick={() => setOpenKey(openKey === m.key ? null : m.key)}
                >
                  <ToneIcon size={11} />
                  <span className="persona-mod-lbl">{m.label}</span>
                  <b className="persona-mod-val">{m.display}</b>
                </button>
              );
            })}
          </div>
          {open?.desc && (
            <div className="persona-mod-desc">
              {open.desc}
              {open.cosmetic ? ` (${t("media.persona.cosmeticTag")})` : ""}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Persona strip — mounts between the Media Hub page header and the tab
 * strip. Consumes `hub.persona` (no own fetch); re-renders whenever the
 * parent's silent `afterAction` refetch lands a new hub.
 *
 * Handles all three states itself since it's mounted unconditionally
 * (outside the hub's own loading/error gate in MediaHub):
 *  - loading (hub not yet fetched)      -> skeleton
 *  - error (hub fetch failed)           -> compact inline error
 *  - success, archetype === UNWRITTEN   -> deliberate non-empty "grab a mic" state
 *  - success, archetype resolved        -> full octagon + heat + modifiers
 */
export function PersonaStrip({ hub, loading, error }) {
  if (loading && !hub) {
    return (
      <div className="persona-strip persona-strip--loading" aria-busy="true">
        <div className="persona-skel-oct" />
        <div className="persona-skel-info">
          <div className="persona-skel-line persona-skel-line--lg" />
          <div className="persona-skel-line" style={{ width: "55%" }} />
          <div className="persona-skel-line" style={{ width: "80%" }} />
        </div>
      </div>
    );
  }

  if (error && !hub) {
    return (
      <div className="persona-strip persona-strip--error">
        {t("media.persona.error")}
      </div>
    );
  }

  if (!hub) return null;

  const persona = hub.persona;
  const archetype = persona?.archetype || "UNWRITTEN";
  const isUnwritten = archetype === "UNWRITTEN";
  const heat = Math.max(0, Math.min(100, Number(persona?.heat) || 0));
  const heatCap = persona?.heatCap;
  const capValue = heatCap?.capped ? Math.max(0, Math.min(100, Number(heatCap.capValue) || 0)) : null;
  const blackout = persona?.blackout;
  const modifiers = persona?.modifiers || [];

  return (
    <div className="persona-strip">
      <Octagon persona={persona} />

      <div className="persona-info">
        <div className="persona-id-row">
          <div className="persona-id-text">
            <div className="persona-name" style={{ color: archetypeColor(archetype) }}>
              {isUnwritten ? t("media.persona.archetypes.UNWRITTEN") : (persona?.archetypeLabel || archetypeLabel(archetype))}
            </div>
            <div className="persona-epithet">
              {isUnwritten ? t("media.persona.unwrittenDesc") : (persona?.epithet || "")}
            </div>
          </div>
          {persona?.signatureActive && (
            <span className="persona-sig-chip">
              <Zap size={11} /> {persona.signatureName || t("media.persona.signatureFallback")}
            </span>
          )}
        </div>

        <div className="persona-heat-row">
          <span className="persona-heat-lbl">{t("media.persona.heatLabel")}</span>
          <div className="persona-heat-track">
            <div className="persona-heat-fill" style={{ width: `${heat}%`, background: archetypeColor(archetype) }} />
            {capValue != null && (
              <div className="persona-heat-cap" style={{ left: `${capValue}%` }} title={t("media.persona.heatCapTitle", { value: heatCap.capValue })} />
            )}
          </div>
          <span className="persona-heat-val">{heat}%</span>
        </div>
        {heatCap?.capped && (
          <div className="persona-heat-cap-note">
            {t("media.persona.heatCapNote", { value: heatCap.capValue, tier: heatCap.uncappedAtTier ?? "—" })}
          </div>
        )}

        {blackout?.active && (
          <div className="persona-blackout-banner">
            <ShieldAlert size={13} />
            {blackout.fightsRemaining === 1
              ? t("media.persona.blackoutOne")
              : t("media.persona.blackoutMany", { n: blackout.fightsRemaining })}
          </div>
        )}

        <PersonaModifiers modifiers={modifiers} />
      </div>
    </div>
  );
}
