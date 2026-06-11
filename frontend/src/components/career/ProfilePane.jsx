import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 */
export function ProfilePane({ fighter: liveFighter, fighterId, onMessage, onRefreshFighter }) {
  const { data, setData, loading, error, reload } = useCareerProfile(fighterId);
  const [bannerOpen, setBannerOpen] = useState(false);

  // Flatten earned badges across categories for the picker + pinned-row lookup.
  const earnedBadges = useMemo(() => {
    const out = [];
    (data?.badges?.categories ?? []).forEach((cat) => {
      (cat.badges ?? []).forEach((b) => {
        if (b.earned) out.push({ id: b.id, name: b.name, category: cat.key });
      });
    });
    return out;
  }, [data]);

  const handlePinnedChange = useCallback((pinnedBadges) => {
    setData((prev) => (prev ? { ...prev, fighter: { ...prev.fighter, pinnedBadges } } : prev));
  }, [setData]);

  // Newly-unlocked (unseen) badges show a "NEW" corner flag on their tile. There's
  // no modal — viewing the profile acknowledges them server-side, so the flags show
  // this visit and are gone on the next load.
  const hasNew = useMemo(
    () => (data?.badges?.categories ?? []).some((cat) => (cat.badges ?? []).some((b) => b.earned && b.new)),
    [data]
  );
  const ackedFor = useRef(null);
  useEffect(() => {
    if (!fighterId || !hasNew) return;
    if (ackedFor.current === fighterId) return; // once per mount/fighter
    ackedFor.current = fighterId;
    api.markBadgesSeen(fighterId).catch(() => {});
  }, [fighterId, hasNew]);

  if (loading) {
    return <div className="career-state">Loading your profile…</div>;
  }

  if (error) {
    return (
      <div className="career-state career-state--error">
        {error}
        <button type="button" className="career-retry-btn" onClick={() => reload()}>Retry</button>
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
        onPinnedChange={handlePinnedChange}
        onCustomizeBanner={() => setBannerOpen(true)}
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

      <BannerEditor
        fighter={liveFighter || fighter}
        open={bannerOpen}
        onClose={() => setBannerOpen(false)}
        onSaved={() => { onRefreshFighter?.(fighterId); }}
        onMessage={onMessage}
      />
    </>
  );
}
