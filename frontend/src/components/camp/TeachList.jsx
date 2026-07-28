import { memo } from "react";
import { Check, Star, Lock, MinusCircle } from "lucide-react";
import { t } from "@/lib/i18n";
import { rarityColor } from "./campConstants";

/** What this coach teaches — taught / next-to-unlock / still-locked moves. */
export const TeachList = memo(function TeachList({ teaches }) {
  if (!teaches || teaches.length === 0) {
    return <div className="yc-teach-empty">{t("yourCamp.teach.empty")}</div>;
  }
  return (
    <div className="yc-teach-grid">
      {teaches.map((m) => {
        const color = rarityColor(m.rarity);
        return (
          <div key={m.moveId} className={`yc-move-chip ${m.state}`} style={{ "--mc": color }}>
            <span className="yc-rarity-tag" data-rarity={m.rarity}>{m.rarity}</span>
            <span className="yc-move-name">{m.name}</span>
            {m.state === "taught" && (
              <span className="yc-move-state taught" style={{ "--mc": color }}>
                <Check size={11} /> {t("yourCamp.teach.taught")}
              </span>
            )}
            {m.state === "next" && (
              <span className="yc-move-state next">
                <Star size={11} /> {t("yourCamp.teach.unlocksAtRank", { rank: m.rankReq })}
              </span>
            )}
            {/* `rankReq` is the rank that GRANTS the move — never rankReq-1. Rank 3
                teaches nothing (it's the +5% XP node), so "reach Rank 3 first" on a
                rank-4 slot named a promotion that hands over nothing. */}
            {m.state === "locked" && (
              <span className="yc-move-state locked">
                <Lock size={11} /> {t("yourCamp.teach.lockedReach", { rank: m.rankReq })}
              </span>
            )}
            {/* Max-rank coach who never learned it — no promotion left to grant it.
                The migrated-veteran case: honest "missed", never a fake countdown. */}
            {m.state === "unavailable" && (
              <span className="yc-move-state unavailable">
                <MinusCircle size={11} /> {t("yourCamp.teach.unavailable", { rank: m.rankReq })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
