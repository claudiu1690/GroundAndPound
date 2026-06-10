import { useState } from "react";
import { CareerSubTabs } from "./CareerSubTabs";
import { CareerFeed } from "../CareerFeed";
import { ProfilePane } from "./ProfilePane";

/**
 * Career page shell. Owns the Feed / Profile sub-tab state (default "feed").
 * Both panes stay mounted and are toggled with CSS so each keeps its own scroll
 * position — switching tabs never re-fetches or resets scroll.
 */
export function CareerPage({ fighter, fighterId, refreshKey, onMessage, onRefreshFighter, subTab, onSubTabChange }) {
  // Controlled when subTab/onSubTabChange are provided (e.g. deep-link from the
  // dashboard "open profile" click); otherwise self-managed, default "feed".
  const [internal, setInternal] = useState("feed");
  const tab = subTab ?? internal;
  const setTab = onSubTabChange ?? setInternal;

  return (
    <section className="career-page">
      <CareerSubTabs active={tab} onChange={setTab} />

      <div className="career-panes">
        <div className={`career-pane${tab === "feed" ? " active" : ""}`}>
          <CareerFeed fighterId={fighterId} refreshKey={refreshKey} />
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
    </section>
  );
}
