import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { t } from "@/lib/i18n";
import { api } from "../../api";
import { badgeVisual } from "./badgeCatalog";
import { BadgePickerModal } from "./BadgePickerModal";

const MAX_PINS = 3;

/**
 * Up to 3 pinned badge slots + a "+" empty slot. Tapping a slot opens the
 * picker; selecting a badge writes the updated ordered array via
 * PUT setPinnedBadges. If the badge is already pinned to another slot it
 * swaps; otherwise it fills the tapped slot. On a 400 we revert and surface
 * the message.
 *
 * `earnedBadges` is the flat list of earned badge metadata (id, name, category)
 * pulled from the profile. `pinnedBadges` is the current ordered id array.
 */
export function PinnedBadgeRow({ fighterId, earnedBadges, pinnedBadges, earnedCount, onMessage, onPinnedChange, readOnly = false }) {
  const [pickerSlot, setPickerSlot] = useState(null); // index being edited, or null
  const [saving, setSaving] = useState(false);

  const pins = useMemo(() => (Array.isArray(pinnedBadges) ? pinnedBadges.slice(0, MAX_PINS) : []), [pinnedBadges]);

  const byId = useMemo(() => {
    const m = new Map();
    (earnedBadges || []).forEach((b) => m.set(b.id, b));
    return m;
  }, [earnedBadges]);

  // Render slots: filled pins, then one empty "+" if under the cap.
  const slots = [...pins];
  if (slots.length < MAX_PINS) slots.push(null);

  const commit = useCallback(async (nextPins) => {
    if (saving) return;
    const prev = pins;
    setSaving(true);
    // Optimistic update through the parent.
    onPinnedChange?.(nextPins);
    try {
      const res = await api.setPinnedBadges(fighterId, nextPins);
      onPinnedChange?.(res.pinnedBadges ?? nextPins);
    } catch (e) {
      onPinnedChange?.(prev); // revert
      onMessage?.(e.code === "BADGE_NOT_EARNED" ? t("career.pinnedBadges.badgeNotEarned") : (e.message || t("career.pinnedBadges.updateError")));
    } finally {
      setSaving(false);
    }
  }, [fighterId, pins, saving, onMessage, onPinnedChange]);

  const handleSelect = useCallback((badgeId) => {
    const slotIndex = pickerSlot;
    setPickerSlot(null);
    if (slotIndex == null) return;

    const next = [...pins];
    const existingAt = next.indexOf(badgeId);

    if (existingAt !== -1 && existingAt !== slotIndex) {
      // Swap: the badge already lives in another slot.
      if (slotIndex < next.length) {
        const tmp = next[slotIndex];
        next[slotIndex] = badgeId;
        next[existingAt] = tmp;
      } else {
        // Tapped the empty "+" slot but badge already pinned — just remove the
        // dupe and append (net: no change in count, moves to end).
        next.splice(existingAt, 1);
        next.push(badgeId);
      }
    } else if (existingAt === slotIndex) {
      return; // no-op
    } else if (slotIndex < next.length) {
      next[slotIndex] = badgeId; // replace this slot
    } else if (next.length < MAX_PINS) {
      next.push(badgeId); // fill new empty slot
    }

    commit(next);
  }, [pickerSlot, pins, commit]);

  // In readOnly mode: render pinned badges as static icons (no picker, no "+" slot).
  if (readOnly) {
    const readOnlyPins = pins.filter(Boolean);
    return (
      <div className="pinned-row">
        <span className="pin-lbl">{t("career.pinnedBadges.label")}</span>
        {readOnlyPins.length === 0 && (
          <span style={{ fontSize: 10, color: "#555" }}>{t("career.pinnedBadges.none")}</span>
        )}
        {readOnlyPins.map((id) => {
          const meta = byId.get(id);
          const { Icon, color, bg } = badgeVisual(id, meta?.category, meta);
          return (
            <span
              key={id}
              className="pin-b"
              style={{ background: bg, borderColor: color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              title={meta?.name || id}
            >
              <Icon size={18} color={color} strokeWidth={1.8} aria-hidden="true" />
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="pinned-row">
        <span className="pin-lbl">{t("career.pinnedBadges.label")}</span>
        {slots.map((id, i) => {
          if (id == null) {
            return (
              <button
                type="button"
                key={`empty-${i}`}
                className="pin-empty"
                onClick={() => setPickerSlot(i)}
                aria-label={t("career.pinnedBadges.pinAriaLabel")}
                disabled={saving}
              >
                <Plus size={11} color="var(--tm, #555)" />
              </button>
            );
          }
          const meta = byId.get(id);
          const { Icon, color, bg } = badgeVisual(id, meta?.category, meta);
          return (
            <button
              type="button"
              key={id}
              className="pin-b"
              style={{ background: bg, borderColor: color }}
              onClick={() => setPickerSlot(i)}
              title={meta?.name || id}
              disabled={saving}
            >
              <Icon size={18} color={color} strokeWidth={1.8} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="pin-sub">
        {t("career.pinnedBadges.subLine", { count: earnedCount, plural: earnedCount === 1 ? "" : "s", max: MAX_PINS })}
      </div>

      <BadgePickerModal
        open={pickerSlot != null}
        onClose={() => setPickerSlot(null)}
        earnedBadges={earnedBadges}
        pinnedIds={pins}
        onSelect={handleSelect}
      />
    </>
  );
}
