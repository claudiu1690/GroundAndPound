import { memo, useLayoutEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useDashboard } from "../../hooks/useDashboard";
import { statMeterRows } from "../fighterProfile/profileModel";
import { GazetteModal } from "../gazette/GazetteModal";
import { TitleShotStrip } from "./TitleShotStrip";
import { FightNightHero } from "./FightNightHero";
import { UndercardRow } from "./UndercardRow";
import { HomeGrid } from "./HomeGrid";
import "./home.css";

// Set on the first Home mount of the page session; see the entrance effect below.
let hasPlayedEntrance = false;
// The per-node marker below is what keeps React StrictMode's setup/cleanup/setup
// from turning the very first play into an instant one.

/**
 * Fight Night — the home screen (home-contract.md).
 *
 * Container only: owns the dashboard fetch, the gazette-modal open state, and
 * the one entrance-animation effect. Identity/vitals/stats/gazette render
 * synchronously off the `fighter` prop inside HomeGrid; hero/undercard/PG/
 * rankings/camp/sponsor/feed wait on `useDashboard` and skeleton only on the
 * very first load (never on a silent refetch, so there's no flash).
 */
export const DashboardTab = memo(function DashboardTab({
  fighter,
  onNavigate,
  onOpenCareerProfile,
  refreshKey,
  gymsRetired = false,
}) {
  const fighterId = fighter?._id;
  const { data, loading, error, reload } = useDashboard(fighterId, { refreshKey });
  const bootLoading = loading && !data;

  const [gazetteOpen, setGazetteOpen] = useState(false);
  const rootRef = useRef(null);

  // Single entrance-animation effect for the whole root — never per tile, and
  // never twice. Home is the tab players bounce off constantly; replaying the
  // cascade on every visit turns a flourish into a toll. `hasPlayedEntrance`
  // lives at module scope so it survives unmount/remount and only resets on a
  // full page load. Reduced motion needs no branch here: the media block in
  // home.css neutralizes every animation and shows the settled state.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    // StrictMode runs setup twice on the SAME node, so the module flag alone
    // would make the first visit skip its own animation. Only a node that never
    // played gets the instant treatment.
    if (hasPlayedEntrance && root.dataset.hnEntrance !== "played") {
      root.classList.add("is-armed", "is-in", "is-instant");
      return undefined;
    }
    hasPlayedEntrance = true;
    root.dataset.hnEntrance = "played";
    // Both classes in one commit, from a layout effect, so no frame ever paints
    // the armed-but-not-in state. These are CSS animations with `both` fill, so
    // they start from their own `from` keyframe; no reflow trick is needed.
    // Deferring `is-in` to requestAnimationFrame used to leave the whole screen
    // at opacity 0 for as long as the tab stayed hidden (rAF does not run in a
    // background tab), which is exactly what a restored or cmd-clicked tab is.
    root.classList.add("is-armed", "is-in");
    return undefined;
  }, []);

  const nav = (target) => {
    if (target && typeof onNavigate === "function") onNavigate(target);
  };

  const statRows = fighter?.statProgress ? statMeterRows(fighter.statProgress) : [];

  return (
    <section className="home" data-tut="dashboard-root" ref={rootRef}>
      <TitleShotStrip ranking={data?.ranking ?? null} onNavigate={nav} />

      {error && !data ? (
        <div className="hn-tile hn-error hn-anim" data-tut="dashboard-hero">
          <p>{t("home.error.title")}</p>
          <button type="button" onClick={reload}>{t("home.error.retry")}</button>
        </div>
      ) : (
        <FightNightHero
          dataTut="dashboard-hero"
          fighter={fighter}
          heroAction={data?.heroAction ?? null}
          heroBout={data?.heroBout ?? null}
          offers={data?.offers ?? null}
          loading={bootLoading}
          onNavigate={nav}
        />
      )}

      <UndercardRow offers={data?.offers ?? null} loading={bootLoading} onNavigate={nav} />

      <HomeGrid
        fighter={fighter}
        data={data}
        loading={loading}
        statRows={statRows}
        onNavigate={nav}
        onOpenCareerProfile={onOpenCareerProfile}
        onOpenGazette={() => setGazetteOpen(true)}
        gymsRetired={gymsRetired}
      />

      <GazetteModal
        open={gazetteOpen}
        gazette={fighter?.gazette}
        onClose={() => setGazetteOpen(false)}
        onNavigate={(target) => { setGazetteOpen(false); nav(target); }}
      />
    </section>
  );
});
