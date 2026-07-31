import { CoachAvatar } from "./CoachAvatar";
import { memo } from "react";
import { Lock, Search } from "lucide-react";
import { t } from "@/lib/i18n";
import { rarityColor, moraleToneClass } from "./campConstants";

function CoachTile({ coach, selected, onSelect }) {
  const color = rarityColor(coach.rarity);
  const tone = moraleToneClass(coach.morale?.tone);
  const filled = coach.rank;
  return (
    <div
      id={`yc-coach-tile-${coach.coachId}`}
      className={`yc-coach-tile${selected ? " selected" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={t("yourCamp.staff.selectAria", { name: coach.name })}
      onClick={() => onSelect(coach.coachId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(coach.coachId);
        }
      }}
    >
      {selected && <div className="yc-selected-ribbon">{t("yourCamp.staff.selected")}</div>}
      {coach.nextRank?.ready && <div className="yc-ready-flag">{t("yourCamp.staff.promoteReady")}</div>}
      <div className="yc-tile-top">
        <CoachAvatar coach={coach} style={{ "--rc": color }} />
        <div className="yc-tile-id">
          <div className="yc-tile-name">{coach.name}</div>
          <div className="yc-tile-archetype">{coach.archetypeLabel}</div>
        </div>
      </div>
      <div className={`yc-tile-mood ${tone}`}>
        <span className={`yc-mood-dot ${tone}`} />
        {coach.morale?.label} · {coach.morale?.value}
      </div>
      <div className="yc-tile-foot">
        <div className="yc-rank-dots">
          {Array.from({ length: coach.maxRank || 4 }, (_, i) => (
            <span key={i} className={`yc-rdot${i < filled ? " filled" : ""}`} />
          ))}
        </div>
        <span className="yc-rank-label-sm">{t("yourCamp.staff.rankLabel", { rank: coach.rank, max: coach.maxRank })}</span>
      </div>
    </div>
  );
}

function OpenSlot() {
  return (
    <div className="yc-coach-tile yc-open-slot">
      <div className="yc-locked-title">{t("yourCamp.staff.openSlotTitle")}</div>
      <div className="yc-locked-sub">{t("yourCamp.staff.openSlotSub")}</div>
    </div>
  );
}

/**
 * The next locked slot, labelled by the CAMP TIER that opens it.
 *
 * It used to read `nextUnlocksAt`, which only described the promotion route, so a Tier-1 camp
 * said "Unlocks at Regional Pro" while the renovation card directly below sold that same slot
 * for 3 wins and $2,000. The tier is true whichever way the player reaches it, and the
 * renovation card already explains the cheaper route, so naming the tier says one honest thing
 * instead of two contradictory ones.
 */
function LockedSlot({ slotNumber, nextUnlocksAt, nextUnlock }) {
  let sub;
  if (nextUnlock && nextUnlock.tier) {
    /**
     * NAME THE TIER *AND* HOW TO REACH IT. The tier alone is a dead end for slots 3 and 4:
     * RENOVATIONS only defines Tier 2, so Tier 3 and Tier 4 come solely from being promotion-
     * floored, and nothing else on the camp screen says so. "Unlocks at Camp Tier 3" left the
     * player with no way to find out when that happens.
     */
    sub = nextUnlock.via === "renovation"
      ? t("yourCamp.staff.lockedSubRenovate", { tier: nextUnlock.tier, wins: nextUnlock.wins })
      : t("yourCamp.staff.lockedSubPromotion", { tier: nextUnlock.tier, promotion: nextUnlock.promotion });
  } else if (nextUnlocksAt) {
    // Older payload with no `nextUnlock`. Better than nothing, but it is the message this
    // component exists to stop showing.
    sub = t("yourCamp.staff.lockedSub", { tier: nextUnlocksAt });
  } else {
    sub = t("yourCamp.staff.lockedSubGeneric");
  }
  return (
    <div className="yc-coach-tile locked">
      <div className="yc-lock-icon"><Lock size={18} /></div>
      <div className="yc-locked-title">{t("yourCamp.staff.lockedTitle", { n: slotNumber })}</div>
      <div className="yc-locked-sub">{sub}</div>
    </div>
  );
}

/**
 * The API sends one scalar (`market.open`), never a fake "clickable" state —
 * when the market isn't open there is deliberately NO button at all (a
 * disabled-looking button that never does anything reads worse than no
 * button). Phase 1 flips `market.open` true and this renders the real Scout
 * button, which opens `MarketPanel`.
 */
function MarketTile({ market, onScout }) {
  const candidateCount = market?.candidateCount ?? 0;
  const open = !!market?.open;
  return (
    <div className="yc-market-tile" id="yc-market-tile">
      <div className="yc-market-title">{t("yourCamp.staff.marketTitle")}</div>
      <div className="yc-market-sub">
        {open
          ? t("yourCamp.staff.marketOpenSub", { n: candidateCount })
          : t("yourCamp.staff.marketLocked")}
      </div>
      {open && (
        <button type="button" className="yc-scout-btn" onClick={onScout}>
          <Search size={11} /> {t("yourCamp.staff.scout")}
        </button>
      )}
    </div>
  );
}

/**
 * Horizontal staff selector — hired coaches, any unlocked-but-empty slots,
 * exactly ONE locked tile for the next slot (the API only ever describes the
 * next unlock via `slots.nextUnlocksAt`, a single scalar — it never sends a
 * per-slot schedule, so rendering `max - unlocked` identical locked tiles
 * would fabricate the same "unlocks at X" label for slots that actually
 * unlock at different, later points), and the Trainer Market tile.
 */
export const StaffRow = memo(function StaffRow({ coaches, slots, market, selectedCoachId, onSelect, onScout }) {
  const max = slots?.max ?? coaches.length;
  const unlocked = slots?.unlocked ?? coaches.length;
  const tiles = [];

  coaches.forEach((coach) => {
    tiles.push(
      <CoachTile key={coach.coachId} coach={coach} selected={coach.coachId === selectedCoachId} onSelect={onSelect} />
    );
  });

  // Unlocked-but-not-yet-hired slots (Phase 1 hiring target).
  for (let i = coaches.length; i < unlocked; i++) {
    tiles.push(<OpenSlot key={`open-${i}`} />);
  }

  // The single next locked slot, if any remain.
  if (unlocked < max) {
    tiles.push(<LockedSlot key="locked-next" slotNumber={unlocked + 1} nextUnlocksAt={slots?.nextUnlocksAt} nextUnlock={slots?.nextUnlock} />);
  }

  return (
    <>
      <div className="yc-section-head">
        <div>
          <div className="yc-section-title">{t("yourCamp.staff.title")}</div>
          <div className="yc-section-sub">{t("yourCamp.staff.subtitle")}</div>
        </div>
      </div>
      <div className="yc-staff-row">
        {tiles}
        <MarketTile market={market} onScout={onScout} />
      </div>
    </>
  );
});
