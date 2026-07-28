import { memo, useEffect, useState } from "react";
import { Pencil, AlertTriangle, Sparkles } from "lucide-react";
import { t } from "@/lib/i18n";
import { Tip } from "./Tip";
import { conditionBandColor, DEEP_CLEAN_COST } from "./campConstants";
import { PIECES_BY_ID, DEFAULT_BANNER } from "../banner/bannerCatalog";

/** Inline, always-editable camp-name field with a pencil affordance. */
function CampNameField({ name, onRename }) {
  const [value, setValue] = useState(name || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setValue(name || "");
  }, [name]);

  const commit = async () => {
    const trimmed = value.trim();
    if (trimmed === (name || "")) {
      setErr("");
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 28) {
      setErr(t("yourCamp.bar.nameLength"));
      setValue(name || "");
      return;
    }
    setBusy(true);
    try {
      await onRename(trimmed);
      setErr("");
    } catch (e) {
      const msg =
        e?.code === "name_length" ? t("yourCamp.bar.nameLength")
          : e?.code === "name_profanity" ? t("yourCamp.bar.nameProfanity")
          : e?.code === "name_required" ? t("yourCamp.bar.nameRequired")
          : (e?.message || t("yourCamp.bar.nameSaveFailed"));
      setErr(msg);
      setValue(name || "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        className="yc-name-input"
        value={value}
        maxLength={28}
        disabled={busy}
        spellCheck={false}
        aria-label={t("yourCamp.bar.renameAria")}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(name || "");
            e.currentTarget.blur();
          }
        }}
      />
      {err && <span className="yc-name-err">{err}</span>}
    </>
  );
}

/**
 * Renovation CTA (Phase 1, F4) — shown whenever `camp.renovation.available`
 * is true (contract §3.5 rule: only when `storedTier === effectiveTier` AND
 * the next tier's renovation exists). Cost/requirements/grants all come
 * straight from the payload — the button itself is the confirmation surface
 * (same one-click precedent as `DevelopmentTrack`'s Promote button; no
 * separate ConfirmDialog for this one), disabled until `ready`.
 */
function RenovationCard({ renovation, onRenovate, renovating }) {
  if (!renovation?.available) return null;
  const ready = !!renovation.ready;

  let cta;
  if (renovating) cta = t("yourCamp.renovate.renovating");
  else if (ready) cta = t("yourCamp.renovate.cta", { tier: renovation.nextTier });
  else if (renovation.reqsMet && !renovation.canAfford) cta = t("yourCamp.renovate.needCash");
  else cta = t("yourCamp.renovate.needsReqs");

  return (
    <div className={`yc-renovate-card${ready ? " ready" : ""}`} id="yc-renovate-card">
      <div className="yc-renovate-head">
        <span className="yc-renovate-title">{t("yourCamp.renovate.title", { tier: renovation.nextTier })}</span>
        <span className="yc-renovate-cost">${(renovation.cost ?? 0).toLocaleString()}</span>
      </div>
      <div className="yc-renovate-grants">{renovation.grants}</div>
      {renovation.requirements?.length > 0 && (
        <div className="yc-renovate-reqs">
          {renovation.requirements.map((req) => {
            const met = req.cur >= req.tgt;
            const pct = req.tgt > 0 ? Math.min(100, (req.cur / req.tgt) * 100) : 100;
            return (
              <div key={req.key} className="yc-req-item">
                <div className="yc-req-label">
                  <span>{req.label}</span>
                  <b>{req.cur}/{req.tgt}</b>
                </div>
                <div className="yc-req-bar-track">
                  <div className={`yc-req-bar-fill${met ? " met" : ""}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className={`yc-renovate-btn${ready ? " ready" : ""}`}
        disabled={!ready || renovating}
        onClick={onRenovate}
      >
        {cta}
      </button>
    </div>
  );
}

/**
 * Camp identity banner (owner picks 02-V1 + 01-V2):
 *  - The bar renders ON the player's equipped cosmetic banner composition
 *    (same bannerCatalog pieces the profile nameplate uses), so the camp
 *    literally wears the player's colors and follows their banner edits.
 *  - Facility Condition is a conic-gradient gauge ring — number inside in the
 *    band color, band word + XP effect beside it. Energy is deliberately NOT
 *    in the camp payload — it reads `fighter.energy` per the API contract.
 *  - Phase 1: an unpaid-wages banner (unmissable, not a quiet color change),
 *    a Deep Clean button beside the condition ring (shown only below full
 *    condition), and the renovation CTA above.
 */
export const CampBar = memo(function CampBar({ campMeta, condition, wages, fighter, onRename, onRenovate, renovating, onDeepCleanRequest }) {
  const energyCurrent = fighter?.energy?.current ?? fighter?.energy ?? 0;
  const energyMax = fighter?.energy?.max ?? 100;

  // Player's equipped cosmetic banner → background composition + accent.
  const cfg = fighter?.banner || DEFAULT_BANNER;
  const comp = PIECES_BY_ID[cfg.backgroundId] || PIECES_BY_ID[DEFAULT_BANNER.backgroundId];
  const accent = (PIECES_BY_ID[cfg.accentColor] || PIECES_BY_ID[DEFAULT_BANNER.accentColor])?.color || "#ef4444";

  const condColor = conditionBandColor(condition?.band);
  const condValue = condition?.value ?? 0;
  const condMax = condition?.max ?? 100;
  const condPct = condMax > 0 ? Math.max(0, Math.min(1, condValue / condMax)) : 0;
  const condMult = condition?.xpMultiplier ?? 1;
  const condEffect = condMult >= 1
    ? t("yourCamp.bar.fullRate")
    : t("yourCamp.bar.xpPenalty", { pct: Math.round((1 - condMult) * 100) });
  const condTip = t("yourCamp.bar.conditionTip", {
    penalty: condition?.penaltyStartsAt ?? 49,
    explainer: condition?.explainer || "",
  });

  const showWageSuffix = wages?.nextDebitInDays != null;
  const cornerName = fighter?.lastName || fighter?.firstName || null;
  const unpaidWeeks = wages?.unpaidWeeks ?? 0;

  return (
    <div className="yc-bar yc-bnr" id="yc-bar" style={{ background: comp?.css }}>
      {comp?.texture && <i className={`yc-bnr-tex yc-bnr-tex--${comp.texture}`} aria-hidden="true" />}

      {unpaidWeeks > 0 && (
        <div className="yc-wage-warn-banner">
          <AlertTriangle size={14} />
          {t("yourCamp.bar.wagesUnpaid", { n: unpaidWeeks, plural: unpaidWeeks === 1 ? "" : "s" })}
        </div>
      )}

      <div className="yc-bnr-row">
        <div className="yc-bnr-left">
          <div className="yc-bnr-name-row">
            <CampNameField name={campMeta?.name} onRename={onRename} />
            <button
              type="button"
              className="yc-pencil-btn"
              title={t("yourCamp.bar.renameTitle")}
              aria-label={t("yourCamp.bar.renameTitle")}
              onClick={() => document.querySelector(".yc-name-input")?.focus()}
            >
              <Pencil size={12} />
            </button>
          </div>
          <div className="yc-bnr-meta">
            <span className="yc-tier-chip">{campMeta?.tierLabel}</span>
            {campMeta?.focusLabel && <span className="yc-style-chip">{campMeta.focusLabel}</span>}
            {cornerName && (
              <span className="yc-bnr-flavor" style={{ color: accent }}>
                {t("yourCamp.bar.corner", { name: cornerName })}
              </span>
            )}
          </div>
        </div>

        <div className="yc-bnr-stats">
          <div className="yc-seg yc-cond-metric" id="yc-condition-metric">
            <Tip title={t("yourCamp.bar.conditionLabel")} text={condTip} className="yc-ring-wrap">
              <span
                className="yc-ring"
                style={{ background: `conic-gradient(${condColor} ${condPct * 360}deg, #2a2a2a 0)` }}
              >
                <b style={{ color: condColor }}>{condValue}</b>
              </span>
            </Tip>
            <div className="yc-ring-txt">
              <div className="yc-ring-band" style={{ color: condColor }}>{condition?.bandLabel}</div>
              <div className="yc-ring-effect">{condEffect}</div>
              {condValue < condMax && (
                <button type="button" className="yc-deep-clean-btn" onClick={onDeepCleanRequest}>
                  <Sparkles size={10} /> {t("yourCamp.bar.deepClean", { cost: DEEP_CLEAN_COST })}
                </button>
              )}
            </div>
          </div>

          <div className={`yc-bnr-stat${unpaidWeeks > 0 ? " yc-wage-warn" : ""}`}>
            <span className="yc-bnr-stat-l">{t("yourCamp.bar.wagesLabel")}</span>
            <span className="yc-bnr-stat-v">
              {t("yourCamp.bar.wagesValue", { amount: (wages?.weeklyTotal ?? 0).toLocaleString() })}
              {showWageSuffix && (
                <span className="yc-wage-suffix"> · {t("yourCamp.bar.nextDebit", { days: wages.nextDebitInDays })}</span>
              )}
            </span>
          </div>

          <div className="yc-bnr-stat">
            <Tip title={t("yourCamp.bar.energyLabel")} text={t("yourCamp.bar.energyTip")} className="yc-bnr-stat-l">
              {t("yourCamp.bar.energyLabel")}
            </Tip>
            <span className="yc-bnr-stat-v">
              <b className="yc-energy-cur">{energyCurrent}</b>/{energyMax}
            </span>
          </div>
        </div>
      </div>

      <RenovationCard renovation={campMeta?.renovation} onRenovate={onRenovate} renovating={renovating} />
    </div>
  );
});
