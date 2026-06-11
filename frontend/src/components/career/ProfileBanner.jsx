import { Pencil } from "lucide-react";
import { BannerPreview } from "../banner/BannerPreview";
import { PinnedBadgeRow } from "./PinnedBadgeRow";

/**
 * Profile hero. Shows the player's CUSTOMIZED cosmetic banner (the same
 * BannerPreview rendered in the sidebar) — no avatar/photo — with the
 * pinned-badge row and a "Customize Banner" button alongside.
 *
 * When `readOnly` is true:
 *   - BannerPreview is non-interactive (no onClick / no title).
 *   - "Customize Banner" button is hidden.
 *   - PinnedBadgeRow receives readOnly so pin editing is disabled.
 */
export function ProfileBanner({
  fighter,
  earnedBadges,
  earnedCount,
  fighterId,
  onMessage,
  onPinnedChange,
  onCustomizeBanner,
  readOnly = false,
}) {
  return (
    <div className="banner career-banner">
      <div className="banner-bg" />
      <div className="banner-inner">
        <div className="career-banner-preview">
          <BannerPreview
            fighter={fighter}
            size="full"
            onClick={readOnly ? undefined : onCustomizeBanner}
            title={readOnly ? undefined : "Click to customize your banner"}
          />
        </div>

        <div className="banner-right">
          <PinnedBadgeRow
            fighterId={fighterId}
            earnedBadges={earnedBadges}
            earnedCount={earnedCount}
            pinnedBadges={fighter?.pinnedBadges}
            onMessage={readOnly ? null : onMessage}
            onPinnedChange={readOnly ? null : onPinnedChange}
            readOnly={readOnly}
          />
          {!readOnly && (
            <button type="button" className="customize-btn" onClick={onCustomizeBanner}>
              <Pencil size={11} /> Customize Banner
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
