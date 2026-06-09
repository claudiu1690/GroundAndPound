import { useCallback, useEffect, useState } from "react";
import { Mic, Video, Star, Swords, Archive } from "lucide-react";
import { api } from "../../api";
import { PodcastTab } from "./tabs/PodcastTab";
import { DocumentaryTab } from "./tabs/DocumentaryTab";
import { AppearancesTab } from "./tabs/AppearancesTab";
import { RivalryTab } from "./tabs/RivalryTab";
import { ArchiveTab } from "./tabs/ArchiveTab";

const TABS = [
  { id: "podcast",      label: "Podcast",       Icon: Mic },
  { id: "documentary",  label: "Documentary",   Icon: Video },
  { id: "appearances",  label: "Appearances",   Icon: Star },
  { id: "rivalry",      label: "Rivalry Board", Icon: Swords },
  { id: "archive",      label: "Archive",       Icon: Archive },
];

/**
 * Media Hub shell — page header, 5-tab strip, and the hub state fetch.
 * Podcast + Documentary read from the shared hub state; the other three tabs
 * fetch their own endpoints. The hub state is refetched after any mutation.
 */
export function MediaHub({ fighter, onMessage, onRefreshFighter, onNavigate }) {
  const fighterId = fighter?._id;
  const [tab, setTab] = useState("podcast");
  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHub = useCallback(async ({ silent = false } = {}) => {
    if (!fighterId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await api.getMediaState(fighterId);
      setHub(data);
    } catch (e) {
      if (!silent) setError(e.message || "Could not load the Media Hub.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fighterId]);

  useEffect(() => { loadHub(); }, [loadHub]);

  const afterAction = useCallback(() => loadHub({ silent: true }), [loadHub]);

  const podcastReady = !!hub?.podcast?.canRecord;

  return (
    <section className="media-hub">
      <header className="media-page-hdr">
        <div className="media-page-eye">Media</div>
        <h1 className="media-page-title">Media Hub</h1>
        <div className="media-page-sub">Build your public persona. Create storylines. Control the narrative.</div>
      </header>

      <div className="media-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            className={`media-mt${tab === id ? " act" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon size={13} /> {label}
            {id === "podcast" && podcastReady && <span className="media-mt-dot" />}
          </button>
        ))}
      </div>

      <div className="media-body">
        {loading && <div className="media-state">Loading the Media Hub…</div>}

        {!loading && error && (
          <div className="media-state media-state--error">
            {error}
            <button type="button" className="media-mini-btn" onClick={() => loadHub()}>Retry</button>
          </div>
        )}

        {!loading && !error && hub && (
          <>
            {tab === "podcast" && (
              <PodcastTab
                fighter={fighter}
                hub={hub}
                onMessage={onMessage}
                onRefreshFighter={onRefreshFighter}
                onNavigate={onNavigate}
                onAfterAction={afterAction}
              />
            )}
            {tab === "documentary" && (
              <DocumentaryTab
                fighter={fighter}
                hub={hub}
                onMessage={onMessage}
                onRefreshFighter={onRefreshFighter}
                onAfterAction={afterAction}
              />
            )}
            {tab === "appearances" && (
              <AppearancesTab
                fighter={fighter}
                onMessage={onMessage}
                onRefreshFighter={onRefreshFighter}
              />
            )}
            {tab === "rivalry" && (
              <RivalryTab fighter={fighter} onMessage={onMessage} />
            )}
            {tab === "archive" && (
              <ArchiveTab fighter={fighter} onMessage={onMessage} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
