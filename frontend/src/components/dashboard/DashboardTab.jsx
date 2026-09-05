import { memo, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useDashboard } from "../../hooks/useDashboard";
import { statMeterRows } from "../fighterProfile/profileModel";
import { GazetteModal } from "../gazette/GazetteModal";
import { TitleShotStrip } from "./TitleShotStrip";
import { FightNightHero } from "./FightNightHero";
import { UndercardRow } from "./UndercardRow";
import { HomeGrid } from "./HomeGrid";
import "./home.css";

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

  // Single entrance-animation effect for the whole root — never per tile.
  // The reduced-motion CSS block (home.css) neutralizes every animation once
  // matched; reading matchMedia here just lets us skip the animation-frame
  // hop when it won't do anything.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    root.classList.add("is-armed");
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      root.classList.add("is-in");
      return undefined;
    }
    const raf = requestAnimationFrame(() => root.classList.add("is-in"));
    return () => cancelAnimationFrame(raf);
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
