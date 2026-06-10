import { Pencil } from "lucide-react";
import { BannerPreview } from "../banner/BannerPreview";
import { PinnedBadgeRow } from "./PinnedBadgeRow";

/**
 * Profile hero. Shows the player's CUSTOMIZED cosmetic banner (the same
 * BannerPreview rendered in the sidebar) — no avatar/photo — with the
 * pinned-badge row and a "Customize Banner" button alongside.
 */
export function ProfileBanner({ fighter, earnedBadges, earnedCount, fighterId, onMessage, onPinnedChange, onCustomizeBanner }) {
  return (
    <div className="banner career-banner">
      <div className="banner-bg" />
      <div className="banner-inner">
        <div className="career-banner-preview">
          <BannerPreview
            fighter={fighter}
            size="full"
            onClick={onCustomizeBanner}
            title="Click to customize your banner"
          />
        </div>

        <div className="banner-right">
          <PinnedBadgeRow
            fighterId={fighterId}
            earnedBadges={earnedBadges}
            earnedCount={earnedCount}
            pinnedBadges={fighter?.pinnedBadges}
            onMessage={onMessage}
            onPinnedChange={onPinnedChange}
          />
          <button type="button" className="customize-btn" onClick={onCustomizeBanner}>
            <Pencil size={11} /> Customize Banner
          </button>
        </div>
      </div>
    </div>
  );
}
