import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";
import { feedDate } from "../homeModel";

/** Recent career tile — async (data.feed). */
export function CareerFeedTile({ feed, loading, onNavigate, index }) {
  const rows = Array.isArray(feed) ? feed.slice(0, 3) : [];

  return (
    <HomeTile
      tone="plain"
      span={5}
      index={index}
      className="hn-career"
      head={<span>{t("home.feed.title")}</span>}
      link={{ label: t("home.feed.cta"), onClick: () => onNavigate?.("career") }}
    >
      {rows.length ? (
        <ul className="hn-feed">
          {rows.map((row, i) => (
            <li key={i}>
              <time>{feedDate(row.createdAt)}</time>
              <span>{row.detail ?? "Event"}</span>
            </li>
          ))}
        </ul>
      ) : loading && !feed ? (
        <div className="hn-skel" style={{ height: 48 }} />
      ) : (
        <p>{t("home.empty.feed")}</p>
      )}
    </HomeTile>
  );
}
