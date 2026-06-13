import { useState } from "react";
import { CareerSubTabs } from "./CareerSubTabs";
import { CareerFeed } from "../CareerFeed";
import { ProfilePane } from "./ProfilePane";
import { FightDrawer } from "../fights/breakdown/FightDrawer";

/**
 * Career page shell. Owns the Feed / Profile sub-tab state (default "feed").
 * Both panes stay mounted and are toggled with CSS so each keeps its own scroll
 * position — switching tabs never re-fetches or resets scroll.
 *
 * Drawer mount: push-left layout (flex row). Feed flex:1, drawer fixed 420px.
 * On mobile the drawer becomes a bottom-sheet overlay.
 */
export function CareerPage({ fighter, fighterId, refreshKey, onMessage, onRefreshFighter, subTab, onSubTabChange }) {
  // Controlled when subTab/onSubTabChange are provided (e.g. deep-link from the
  // dashboard "open profile" click); otherwise self-managed, default "feed".
  const [internal, setInternal] = useState("feed");
  const tab = subTab ?? internal;
  const setTab = onSubTabChange ?? setInternal;

  // Fight drawer state — null = closed, { fightId, kind } = open
  const [openFight, setOpenFight] = useState(null);

  const handleOpenFight = (fightRef) => {
    setOpenFight(fightRef);
  };

  const handleCloseDrawer = () => {
    setOpenFight(null);
  };

  return (
    <section className="career-page">
      <CareerSubTabs active={tab} onChange={setTab} />

      {/* Push-left layout: feed + drawer side by side */}
      <div className={`career-feed-wrap${openFight ? " career-feed-wrap--drawer-open" : ""}`}>
        <div className="career-panes career-panes--feed-col">
          <div className={`career-pane${tab === "feed" ? " active" : ""}`}>
            <CareerFeed
              fighterId={fighterId}
              refreshKey={refreshKey}
              onOpenFight={handleOpenFight}
              activeFightId={openFight?.fightId ?? null}
            />
          </div>
          <div className={`career-pane${tab === "profile" ? " active" : ""}`}>
            <ProfilePane
              fighter={fighter}
              fighterId={fighterId}
              onMessage={onMessage}
              onRefreshFighter={onRefreshFighter}
            />
          </div>
        </div>

        {/* Drawer — sibling of feed column, not overlay on desktop */}
        {openFight && (
          <>
            {/* Mobile backdrop */}
            <div
              className="career-drawer-backdrop"
              onClick={handleCloseDrawer}
              role="presentation"
            />
            <FightDrawer
              key={openFight.fightId}
              fightId={openFight.fightId}
              kind={openFight.kind}
              onClose={handleCloseDrawer}
            />
          </>
        )}
      </div>
    </section>
  );
}
