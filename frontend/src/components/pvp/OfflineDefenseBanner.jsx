import { Swords } from "lucide-react";
import { t } from "../../lib/i18n";

/**
 * Banner shown in PvpHub when the player was challenged while offline
 * and has unread defense results.
 *
 * Props:
 *   summary      — fighter.pvpDefense shape (or null)
 *   onViewReport — called when the user clicks "View defense report →"
 *                  (the ONLY path that acks; seeing the banner does NOT clear it)
 */
export function OfflineDefenseBanner({ summary, onViewReport }) {
  if (!summary || summary.unreadCount === 0) return null;

  const { heldCount, lostCount, totalDpChange, injuries } = summary;

  // Tone: a clean slate (nothing lost) reads positive (green), not a red alarm.
  const clean = (lostCount ?? 0) === 0;

  // DP string — use Unicode minus sign (U+2212) for negatives, never ASCII hyphen
  const dpStr =
    totalDpChange === 0
      ? "0 DP"
      : "−" + Math.abs(totalDpChange) + " DP";

  // Lead line (unit words never pluralize per spec)
  const leadLine = `⚔ Challenged while offline · ${heldCount} held · ${lostCount} lost · ${dpStr}`;

  // Injury sentence
  let injurySentence = null;
  if (injuries && injuries.length > 0) {
    let phrase;
    if (injuries.length === 1) {
      phrase = `a ${injuries[0]}`;
    } else if (injuries.length === 2) {
      phrase = `a ${injuries[0]} and a ${injuries[1]}`;
    } else {
      // Oxford-comma list, each prefixed with "a "
      const all = injuries.map((x) => `a ${x}`);
      const last = all.pop();
      phrase = all.join(", ") + ", and " + last;
    }
    injurySentence = t("pvp.offlineBanner.injurySustained", { phrase });
  }

  return (
    <div className={`pvp-odb${clean ? " pvp-odb-clean" : ""}`}>
      <Swords size={14} strokeWidth={2} className="pvp-odb-icon" />
      <div className="pvp-odb-content">
        <span className="pvp-odb-lead">{leadLine}</span>
        {injurySentence && (
          <span className="pvp-odb-injury"> {injurySentence}</span>
        )}
        {" "}
        <button
          type="button"
          className="pvp-odb-link"
          onClick={onViewReport}
        >
          {t("pvp.offlineBanner.viewReportBtn")}
        </button>
      </div>
    </div>
  );
}
