import { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";

/**
 * The Octagon Gazette — pure broadsheet renderer.
 *
 * Props:
 *   open       — boolean
 *   gazette    — fighter.gazette object (may be null / issue 0)
 *   onClose    — () => void  (no backend call, just close)
 *   onNavigate — (tab: string) => void  (closes then routes)
 *
 * No fetch, no dismiss API call. All data comes from the fighter prop.
 */
export function GazetteModal({ open, gazette, onClose, onNavigate }) {
  // Escape key to close
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const isEmpty = !gazette?.issueNumber || !gazette?.leadStory;

  // ── helpers ──────────────────────────────────────────────────────────
  function handleNav(e, tab) {
    e.stopPropagation();
    if (tab) { onClose?.(); onNavigate?.(tab); }
  }

  function outcomeColor(label) {
    if (!label) return "rgba(255,255,255,0.55)";
    const l = label.toLowerCase();
    if (l.includes("win") || l.includes("victor")) return "#4ADE80";
    if (l.includes("loss") || l.includes("defeat")) return "#F87171";
    return "#CBD5E1"; // draw / unknown
  }

  // Date from gazette.updatedAt — "Monday, June 15, 2026"
  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    } catch { return ""; }
  }

  // Roman numeral for vol number
  const ROMAN_MAP = [
    [1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
    [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"],
  ];
  function toRoman(n) {
    let num = Math.max(1, Math.floor(n || 1));
    let out = "";
    for (const [v, s] of ROMAN_MAP) { while (num >= v) { out += s; num -= v; } }
    return out;
  }

  const volLabel = gazette?.volNumber != null
    ? toRoman(gazette.volNumber)
    : "XII";

  return createPortal(
    <div
      className="gz2-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("gazette.ariaLabel")}
      onClick={() => onClose?.()}
    >
      <div className="gz2-paper" onClick={(e) => e.stopPropagation()}>

        {/* CLOSE */}
        <button type="button" className="gz2-close" aria-label={t("gazette.closeAriaLabel")} onClick={() => onClose?.()}>✕</button>

        {/* MASTHEAD */}
        <div className="gz2-masthead">
          <div className="gz2-mh-row1">
            <div className="gz2-mh-meta">
              <div>{isEmpty ? "Vol. — · No. —" : `Vol. ${volLabel} · No. ${gazette?.issueNumber ?? 1}`}</div>
              <div>{t("gazette.masthead.established")}</div>
            </div>
            <div className="gz2-mh-center">
              <div className="gz2-mh-est">{t("gazette.masthead.est")}</div>
              <div className="gz2-mh-title">The Octagon Gazette</div>
              <span className="gz2-mh-tagline">{t("gazette.masthead.tagline")}</span>
            </div>
            <div className="gz2-mh-meta gz2-mh-meta-right">
              <div>{formatDate(gazette?.updatedAt)}</div>
              <div>{gazette?.edition ?? ""}</div>
            </div>
          </div>
          <div className="gz2-masthead-rule" />
          {!isEmpty && (
            <div className="gz2-mh-strip">
              <div className="gz2-mh-strip-text">{gazette?.fighterMeta ?? ""}</div>
              <div className="gz2-mh-breaking">{gazette?.breakingLabel ?? "Breaking"}</div>
              <div className="gz2-mh-strip-text">{gazette?.cashFameMeta ?? ""}</div>
            </div>
          )}
        </div>

        {/* HERO RESULT BAND — only when non-empty and resultBand.outcomeLabel is present */}
        {!isEmpty && (() => {
          const band = gazette.leadStory?.resultBand ?? null;
          if (!band || !band.outcomeLabel) return null;

          // Build stat boxes — only include those with non-null values
          const statBoxes = [
            { val: band.record,    lbl: t("gazette.statLabels.record") },
            { val: band.campGrade, lbl: t("gazette.statLabels.campGrade") },
            { val: band.ranking,   lbl: t("gazette.statLabels.ranking") },
          ].filter((s) => s.val != null && s.val !== "");

          return (
            <div className="gz2-hero">
              {/* Left: kicker + outcome word + method.
                  Kicker = "{Tier} · {WeightClass} · Fight N" (band.context),
                  falling back to the lead's breaking-label kicker. */}
              <div className="gz2-hero-left">
                {(band.context || gazette.leadStory?.kicker) && (
                  <div className="gz2-hero-kicker">{band.context || gazette.leadStory.kicker}</div>
                )}
                <div
                  className="gz2-hero-outcome"
                  style={{ color: outcomeColor(band.outcomeLabel) }}
                >
                  {band.outcomeLabel}
                </div>
                {band.methodRound && (
                  <div className="gz2-hero-method">{band.methodRound}</div>
                )}
              </div>

              {/* Stats column — only rendered when at least one stat has data */}
              {statBoxes.length > 0 && (
                <>
                  <div className="gz2-hero-stat-div gz2-hero-stat-div--main" />
                  <div className="gz2-hero-stats">
                    {statBoxes.map((box, i) => (
                      <div key={box.lbl} className="gz2-hero-stat-wrap">
                        {i > 0 && <div className="gz2-hero-stat-div" />}
                        <div className="gz2-hero-stat">
                          <div className="gz2-hero-stat-val">{box.val}</div>
                          <div className="gz2-hero-stat-lbl">{box.lbl}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* BODY */}
        <div className="gz2-body">

          {/* ── EMPTY STATE ── */}
          {isEmpty ? (
            <div className="gz2-empty">
              {t("gazette.emptyState")}
            </div>
          ) : (
            <>
              {/* ── LEAD ── */}
              {(() => {
                const lead = gazette.leadStory;
                const pq = lead?.pullQuote ?? null;
                const bodyParas = Array.isArray(lead?.bodyParagraphs) ? lead.bodyParagraphs : [];
                return (
                  <>
                    <div className="gz2-sec-rule">
                      <span className="gz2-sec-rule-lbl">{t("gazette.sections.lastFightResult")}</span>
                      <div className="gz2-sec-rule-line" />
                    </div>

                    <div className="gz2-lead-layout">
                      {/* Lead main */}
                      <div className="gz2-lead-main">
                        {lead?.kicker && (
                          <div className="gz2-lead-kicker" style={{ color: lead.kickerColor || "var(--gz2-acc)" }}>
                            {lead.kicker}
                          </div>
                        )}
                        {lead?.headline && <div className="gz2-lead-hl">{lead.headline}</div>}
                        {lead?.deck && <div className="gz2-lead-deck">{lead.deck}</div>}
                        <div className="gz2-lead-byline">
                          {t("gazette.bylineRole")} · {gazette?.fighterMeta ? gazette.fighterMeta.split("·")[0]?.trim() : ""} {t("gazette.bylineSuffix")}
                        </div>

                        {/* Body paragraphs with drop cap on first */}
                        <div className="gz2-body-copy">
                          {bodyParas.map((para, i) => (
                            <p key={i} className={i === 0 ? "gz2-body-p gz2-drop-cap" : "gz2-body-p"}>
                              {para}
                            </p>
                          ))}
                          {pq && (
                            <div className="gz2-pull-quote">
                              <div className="gz2-pq-text">&ldquo;{pq.text}&rdquo;</div>
                              {pq.source && <div className="gz2-pq-src">— {pq.source}</div>}
                            </div>
                          )}
                        </div>

                        {lead?.linkTarget && (
                          <button
                            type="button"
                            className="gz2-inline-link"
                            onClick={(e) => handleNav(e, lead.linkTarget)}
                          >
                            {t("gazette.links.fullReport")}
                          </button>
                        )}
                      </div>

                      {/* Sidebar */}
                      <div className="gz2-lead-sidebar">
                        {(Array.isArray(gazette.sidebarItems) ? gazette.sidebarItems.slice(0, 4) : []).map((item, i) => (
                          <div key={i} className="gz2-lsb">
                            {item.categoryLabel && (
                              <div className="gz2-lsb-lbl" style={{ color: item.categoryColor || "var(--gz2-acc)" }}>
                                {item.categoryLabel}
                              </div>
                            )}
                            {item.headline && <div className="gz2-lsb-hl">{item.headline}</div>}
                            {item.body && (
                              <div
                                className="gz2-lsb-body"
                                dangerouslySetInnerHTML={{ __html: item.body }}
                              />
                            )}
                            {item.goPill ? (
                              <button
                                type="button"
                                className="gz2-go-pill"
                                onClick={(e) => handleNav(e, item.linkTarget)}
                              >
                                {item.goPillLabel ?? t("gazette.links.go")} →
                              </button>
                            ) : item.linkTarget ? (
                              <button
                                type="button"
                                className="gz2-inline-link"
                                onClick={(e) => handleNav(e, item.linkTarget)}
                              >
                                {t("gazette.links.view")}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ── SECONDARY STORIES ── */}
              {Array.isArray(gazette.secondaryStories) && gazette.secondaryStories.length > 0 && (() => {
                const stories = gazette.secondaryStories.slice(0, 3);
                // Build: [story, divider, story, divider, story] — insert dividers between
                const cells = [];
                stories.forEach((story, i) => {
                  if (i > 0) cells.push({ type: "divider", key: `d${i}` });
                  cells.push({ type: "story", story, key: `s${i}` });
                });
                return (
                  <>
                    <div className="gz2-sec-rule">
                      <span className="gz2-sec-rule-lbl">{t("gazette.sections.alsoInTodaysPaper")}</span>
                      <div className="gz2-sec-rule-line" />
                    </div>
                    <div
                      className="gz2-secondary-row"
                      style={{ gridTemplateColumns: cells.map((c) => c.type === "divider" ? "1px" : "1fr").join(" ") }}
                    >
                      {cells.map((cell) =>
                        cell.type === "divider" ? (
                          <div key={cell.key} className="gz2-ss-divider" />
                        ) : (
                          <div key={cell.key} className="gz2-ss">
                            {cell.story.categoryLabel && (
                              <div className="gz2-ss-lbl" style={{ color: cell.story.categoryColor || "var(--gz2-acc)" }}>
                                {cell.story.categoryLabel}
                              </div>
                            )}
                            {cell.story.headline && <div className="gz2-ss-hl">{cell.story.headline}</div>}
                            {cell.story.body && (
                              <div
                                className="gz2-ss-body"
                                dangerouslySetInnerHTML={{ __html: cell.story.body }}
                              />
                            )}
                            {cell.story.linkTarget && (
                              <button
                                type="button"
                                className="gz2-inline-link"
                                onClick={(e) => handleNav(e, cell.story.linkTarget)}
                              >
                                {t("gazette.links.readMore")}
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </>
                );
              })()}

              {/* ── IN BRIEF ── */}
              {Array.isArray(gazette.inBrief) && gazette.inBrief.length > 0 && (
                <div className="gz2-in-brief">
                  <div className="gz2-ib-head">{t("gazette.sections.inBrief")}</div>
                  <div className="gz2-ib-grid">
                    {gazette.inBrief.map((item, i) => (
                      <div key={i} className="gz2-ib-item">
                        <span className="gz2-ib-bull">■</span>
                        <span>
                          <span dangerouslySetInnerHTML={{ __html: item.text }} />
                          {item.pillLabel && (
                            <button
                              type="button"
                              className="gz2-go-pill gz2-go-pill-sm"
                              onClick={(e) => handleNav(e, item.linkTarget)}
                            >
                              {item.pillLabel}
                            </button>
                          )}
                          {!item.pillLabel && item.linkTarget && (
                            <button
                              type="button"
                              className="gz2-inline-link"
                              onClick={(e) => handleNav(e, item.linkTarget)}
                            >
                              →
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="gz2-footer">
          <div className="gz2-gf-l">{t("gazette.footer.tagline")}</div>
          <div className="gz2-gf-orn">◆ ◆ ◆</div>
          <div className="gz2-gf-r">
            <span className="gz2-gf-upd">{t("gazette.footer.updatedNote")}</span>
            <button type="button" className="gz2-gf-close" onClick={() => onClose?.()}>
              {t("gazette.footer.close")}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}

export default memo(GazetteModal);
