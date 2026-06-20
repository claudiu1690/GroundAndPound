import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { api } from "../../api";
import { useCareerProfile } from "../../hooks/useCareerProfile";
import { BannerEditor } from "../banner/BannerEditor";
import { ProfileBanner } from "./ProfileBanner";
import { ProfileStatsCard } from "./ProfileStatsCard";
import { ProfileCareerCard } from "./ProfileCareerCard";
import { ChampionshipBeltsCard } from "./ChampionshipBeltsCard";
import { BadgeGrid } from "./BadgeGrid";
import { MediaCareerCard } from "./MediaCareerCard";
import { PvpHistoryCard } from "./PvpHistoryCard";

/**
 * Profile sub-tab. Fetches the career profile and renders the 5 sections.
 * Owns the cosmetic BannerEditor modal and patches the in-place profile state
 * after a pinned-badge change (no refetch needed).
 *
 * When `readOnly` is true:
 *   - The BannerEditor is never opened.
 *   - Customize Banner button is hidden.
 *   - Avatar edit pencil is hidden (via ProfileBanner).
 *   - Pinned-badge row is read-only (no click interactions).
 *   - markBadgesSeen is NEVER called (that POST is for the profile owner only).
 */
export function ProfilePane({
  fighter: liveFighter,
  fighterId,
  onMessage,
  onRefreshFighter,
  readOnly = false,
}) {
  const { data, setData, loading, error, reload } = useCareerProfile(fighterId);
  const [bannerOpen, setBannerOpen] = useState(false);

  // Flatten earned badges across categories for the picker + pinned-row lookup.
  const earnedBadges = useMemo(() => {
    const out = [];
    (data?.badges?.categories ?? []).forEach((cat) => {
      (cat.badges ?? []).forEach((b) => {
        if (b.earned) out.push({ id: b.id, name: b.name, category: cat.key, icon: b.icon, color: b.color });
      });
    });
    return out;
  }, [data]);

  const handlePinnedChange = useCallback(
    (pinnedBadges) => {
      setData((prev) => (prev ? { ...prev, fighter: { ...prev.fighter, pinnedBadges } } : prev));
    },
    [setData]
  );

  // Newly-unlocked (unseen) badges show a "NEW" corner flag on their tile.
  // CRITICAL: only fire markBadgesSeen for the owner's own profile (readOnly === false).
  const hasNew = useMemo(
    () =>
      (data?.badges?.categories ?? []).some((cat) =>
        (cat.badges ?? []).some((b) => b.earned && b.new)
      ),
    [data]
  );
  const ackedFor = useRef(null);
  useEffect(() => {
    if (readOnly) return; // never fire for someone else's profile
    if (!fighterId || !hasNew) return;
    if (ackedFor.current === fighterId) return;
    ackedFor.current = fighterId;
    api.markBadgesSeen(fighterId).catch(() => {});
  }, [fighterId, hasNew, readOnly]);

  if (loading) {
    return <div className="career-state">{t("career.profile.loading")}</div>;
  }

  if (error) {
    return (
      <div className="career-state career-state--error">
        {error}
        <button type="button" className="career-retry-btn" onClick={() => reload()}>
          {t("career.profile.retry")}
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { fighter, belts, badges } = data;
  const earnedCount = badges?.earnedCount ?? earnedBadges.length;

  return (
    <>
      <ProfileBanner
        fighter={fighter}
        fighterId={fighterId}
        earnedBadges={earnedBadges}
        earnedCount={earnedCount}
        onMessage={onMessage}
        onPinnedChange={readOnly ? null : handlePinnedChange}
        onCustomizeBanner={readOnly ? null : () => setBannerOpen(true)}
        readOnly={readOnly}
      />

      <div className="profile-body">
        <div className="three-col">
          <ProfileStatsCard fighter={fighter} />
          <ProfileCareerCard fighter={fighter} />
          <ChampionshipBeltsCard belts={belts} />
        </div>

        <BadgeGrid badges={badges} />

        <div className="two-col">
          <MediaCareerCard fighter={fighter} />
          <PvpHistoryCard fighterId={fighterId} />
        </div>
      </div>

      {/* BannerEditor is never rendered in readOnly mode */}
      {!readOnly && (
        <BannerEditor
          fighter={liveFighter || fighter}
          open={bannerOpen}
          onClose={() => setBannerOpen(false)}
          onSaved={() => {
            onRefreshFighter?.(fighterId);
          }}
          onMessage={onMessage}
        />
      )}
    </>
  );
}
