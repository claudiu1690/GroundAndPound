import { useCallback, useEffect, useState } from "react";
import { Mic, Video, Star, Swords, Archive } from "lucide-react";
import { api } from "../../api";
import { t } from "@/lib/i18n";
import { PodcastTab } from "./tabs/PodcastTab";
import { DocumentaryTab } from "./tabs/DocumentaryTab";
import { AppearancesTab } from "./tabs/AppearancesTab";
import { RivalryTab } from "./tabs/RivalryTab";
import { ArchiveTab } from "./tabs/ArchiveTab";
import { PersonaStrip } from "./PersonaStrip";

const TABS = [
  { id: "podcast",      labelKey: "media.tabs.podcast",      Icon: Mic },
  { id: "documentary",  labelKey: "media.tabs.documentary",  Icon: Video },
  { id: "appearances",  labelKey: "media.tabs.appearances",  Icon: Star },
  { id: "rivalry",      labelKey: "media.tabs.rivalry",      Icon: Swords },
  { id: "archive",      labelKey: "media.tabs.archive",      Icon: Archive },
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
      if (!silent) setError(e.message || t("media.hub.error"));
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
        <div className="media-page-eye">{t("media.hub.eyebrow")}</div>
        <h1 className="media-page-title">{t("media.hub.title")}</h1>
        <div className="media-page-sub">{t("media.hub.subtitle")}</div>
      </header>

      <PersonaStrip hub={hub} loading={loading} error={error} />

      <div className="media-tabs">
        {TABS.map(({ id, labelKey, Icon }) => (
          <button
            type="button"
            key={id}
            className={`media-mt${tab === id ? " act" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon size={13} /> {t(labelKey)}
            {id === "podcast" && podcastReady && <span className="media-mt-dot" />}
          </button>
        ))}
      </div>

      <div className="media-body">
        {loading && <div className="media-state">{t("media.hub.loading")}</div>}

        {!loading && error && (
          <div className="media-state media-state--error">
            {error}
            <button type="button" className="media-mini-btn" onClick={() => loadHub()}>{t("common.retry")}</button>
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
