import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";
import { gazetteResultPill, relativeTime } from "../homeModel";

/** The Octagon Gazette tile — renders synchronously from fighter.gazette. */
export function GazetteTile({ gazette, onOpen, index }) {
  const isEmpty = !gazette?.issueNumber || !gazette?.leadStory;
  const leadStory = gazette?.leadStory ?? null;
  const resultPill = gazetteResultPill(leadStory);
  const teaser = leadStory?.bodyParagraphs?.[0]
    ? leadStory.bodyParagraphs[0].split(/[.!?]/)[0] + "."
    : (leadStory?.deck ?? null);
  const bullets = Array.isArray(gazette?.sidebarItems) ? gazette.sidebarItems.slice(0, 3) : [];

  return (
    <HomeTile tone="plain" span={7} index={index} className="hn-gazette">
      <div className="hn-masthead">
        <b>{t("home.gazette.mastheadName")}</b>
      </div>
      {isEmpty ? (
        <p>{t("home.gazette.empty")}</p>
      ) : (
        <>
          {resultPill ? <span className={`hn-gz-pill ${resultPill.cls}`}>{resultPill.text}</span> : null}
          {leadStory?.headline ? <h3>{leadStory.headline}</h3> : null}
          {teaser ? <p>{teaser}</p> : null}
          {bullets.length ? (
            <ul className="hn-gz-list">
              {bullets.map((item, i) => (
                <li key={i}>{item.headline || item.body}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      <div className="hn-gz-foot">
        <button type="button" className="hn-link" onClick={onOpen} aria-label={t("home.gazette.openAriaLabel")}>{t("home.gazette.footerCta")}</button>
        {gazette?.updatedAt ? <span>{t("home.gazette.footerUpdated", { time: relativeTime(gazette.updatedAt) })}</span> : null}
      </div>
    </HomeTile>
  );
}
