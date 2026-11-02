import { useEffect, useRef } from "react";
import { useSeasonBand } from "../../hooks/useSeasonBand";
import { RoadmapPage } from "./RoadmapPage";

const ROADMAP_PARAM = "page";
const ROADMAP_VALUE = "roadmap";

export const urlHasRoadmap = () =>
  new URLSearchParams(window.location.search).get(ROADMAP_PARAM) === ROADMAP_VALUE;

/**
 * The roadmap page for signed-in players, full screen over the game. Same
 * page and data as the logged-out `/?page=roadmap`, so a shared link opens it
 * for everyone. The URL carries `?page=roadmap` while it is open: the browser's
 * Back button closes it, and closing it from the page steps that entry back off.
 */
export function RoadmapOverlay({ onClose }) {
  const { data, loading } = useSeasonBand();
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!urlHasRoadmap()) {
      const url = new URL(window.location.href);
      url.searchParams.set(ROADMAP_PARAM, ROADMAP_VALUE);
      window.history.pushState({}, "", url.pathname + url.search + url.hash);
      pushedRef.current = true;
    }
    const onPop = () => { if (!urlHasRoadmap()) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    if (pushedRef.current) {
      window.history.back(); // popstate then calls onClose
      return;
    }
    // Opened from a shared link: drop the param in place instead of leaving the site.
    const url = new URL(window.location.href);
    url.searchParams.delete(ROADMAP_PARAM);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    onClose();
  }

  return (
    <div className="rm-overlay" role="dialog" aria-modal="true" aria-label="Roadmap">
      <RoadmapPage seasonData={data} seasonLoading={loading} onHome={close} player />
    </div>
  );
}
