import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useDashboard } from "../../hooks/useDashboard";
import { useOfferReroll } from "../../hooks/useOfferBoard";
import { useAcceptOffer } from "../../hooks/useAcceptOffer";
import { statMeterRows } from "../fighterProfile/profileModel";
import { GazetteModal } from "../gazette/GazetteModal";
import { CalloutModal } from "../fights/CalloutModal";
import { InjuryWarnModal } from "../fights/InjuryWarnModal";
import { TitleShotStrip } from "./TitleShotStrip";
import { AthleteHero } from "./AthleteHero";
import { NextFightCard } from "./NextFightCard";
import { FighterStatsTile } from "./tiles/FighterStatsTile";
import { ConditionTile } from "./tiles/ConditionTile";
import { BookingsList } from "./BookingsList";
import { RankingsTile } from "./tiles/RankingsTile";
import { LastFightTile } from "./tiles/LastFightTile";
import { PurseFameTile } from "./tiles/PurseFameTile";
import { rerollButtonState } from "./homeModel";
import "./home.css";

// Set on the first Home mount of the page session; see the entrance effect below.
let hasPlayedEntrance = false;
// The per-node marker below is what keeps React StrictMode's setup/cleanup/setup
// from turning the very first play into an instant one.

/**
 * The Athlete Page, the home screen (offer-board-contract.md §5).
 *
 * Container only: owns the dashboard fetch, the reroll mutation, the shared
 * accept-offer flow, the gazette/callout modal open state, and the one
 * entrance-animation effect. Everything else is derived data passed down to
 * presentational children, no business logic lives in this file beyond
 * wiring hooks to props.
 */
export const DashboardTab = memo(function DashboardTab({
  fighter,
  onNavigate,
  onOpenCareerProfile,
  refreshKey,
  gymsRetired = false,
  onAcceptOffer,
  onRefreshFighter,
  onMessage,
}) {
  const fighterId = fighter?._id;
  const { data, loading, error, reload } = useDashboard(fighterId, { refreshKey });
  const bootLoading = loading && !data;

  const { reroll: rerollMutation, rerolling, rerollError } = useOfferReroll(fighterId);

  const handleStale = useCallback(() => { reload(); }, [reload]);

  const { requestAccept, acceptingId, injuryModal } = useAcceptOffer({
    fighter,
    onAcceptOffer,
    onStale: handleStale,
  });

  const [gazetteOpen, setGazetteOpen] = useState(false);
  const [calloutOpen, setCalloutOpen] = useState(false);
  const bookingsRef = useRef(null);
  const rootRef = useRef(null);

  // Single entrance-animation effect for the whole root, never per tile, and
  // never twice. Same mechanics as the old Fight Night home: `hasPlayedEntrance`
  // lives at module scope so it survives unmount/remount and only resets on a
  // full page load; a node that already played gets the instant treatment.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    if (hasPlayedEntrance && root.dataset.apEntrance !== "played") {
      root.classList.add("is-armed", "is-in", "is-instant");
      return undefined;
    }
    hasPlayedEntrance = true;
    root.dataset.apEntrance = "played";
    root.classList.add("is-armed", "is-in");
    return undefined;
  }, []);

  const nav = useCallback((target) => {
    if (target && typeof onNavigate === "function") onNavigate(target);
  }, [onNavigate]);

  const scrollToBookings = useCallback(() => {
    bookingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleReroll = useCallback(async () => {
    const res = await rerollMutation();
    if (res.ok) {
      reload();
      if (fighterId) onRefreshFighter?.(fighterId);
    } else if (res.code === "OFFER_BOARD_STALE") {
      reload();
    } else if (res.message) {
      onMessage?.(res.message);
    }
  }, [rerollMutation, reload, onRefreshFighter, fighterId, onMessage]);

  const statRows = fighter?.statProgress ? statMeterRows(fighter.statProgress) : [];

  return (
    <section className="home" data-tut="dashboard-root" ref={rootRef}>
      <TitleShotStrip ranking={data?.ranking ?? null} onNavigate={nav} />

      {error && !data ? (
        <div className="ap-tile ap-error ap-anim" data-tut="dashboard-hero">
          <p>{t("home.error.title")}</p>
          <button type="button" onClick={reload}>{t("home.error.retry")}</button>
        </div>
      ) : (
        <AthleteHero
          fighter={fighter}
          ranking={data?.ranking ?? null}
          loading={bootLoading}
          onOpenCareerProfile={onOpenCareerProfile}
          dataTut="dashboard-hero"
        >
          <NextFightCard
            heroBout={data?.heroBout ?? null}
            heroAction={data?.heroAction ?? null}
            offers={data?.offers ?? null}
            loading={bootLoading}
            acceptingId={acceptingId}
            onAccept={requestAccept}
            onNavigate={nav}
            onOtherBouts={scrollToBookings}
          />
        </AthleteHero>
      )}

      <div className="ap-cols">
        <FighterStatsTile statRows={statRows} onTrain={() => nav(gymsRetired ? "camp" : "gym")} gymsRetired={gymsRetired} />
        <ConditionTile
          fighter={fighter}
          injuries={data?.injuries ?? null}
          camp={data?.camp ?? null}
          homeCamp={data?.homeCamp ?? null}
          loading={bootLoading}
          onNavigate={nav}
        />
      </div>

      <BookingsList
        offers={data?.offers ?? null}
        heroBout={data?.heroBout ?? null}
        loading={bootLoading}
        acceptingId={acceptingId}
        onAccept={requestAccept}
        reroll={{
          state: rerollButtonState(data?.offers ?? null),
          rerolling,
          error: rerollError,
          onReroll: handleReroll,
        }}
        activeCallout={fighter?.activeCallout ?? null}
        onCallout={() => setCalloutOpen(true)}
        onReload={reload}
        sectionRef={bookingsRef}
      />

      <div className="ap-grid">
        <RankingsTile ranking={data?.ranking ?? null} weightClass={fighter?.weightClass} loading={bootLoading} onNavigate={nav} />
        <LastFightTile
          lastFight={data ? (data.lastFight ?? null) : undefined}
          feed={data?.feed}
          gazette={fighter?.gazette}
          pvp={data?.pvp ?? null}
          pvpDefense={fighter?.pvpDefense ?? null}
          loading={bootLoading}
          onOpenGazette={() => setGazetteOpen(true)}
          onNavigate={nav}
        />
        <PurseFameTile
          fighter={fighter}
          resources={data?.resources ?? null}
          sponsorship={data?.sponsorship ?? null}
          homeCamp={data?.homeCamp ?? null}
          loading={bootLoading}
          onNavigate={nav}
        />
      </div>

      <GazetteModal
        open={gazetteOpen}
        gazette={fighter?.gazette}
        onClose={() => setGazetteOpen(false)}
        onNavigate={(target) => { setGazetteOpen(false); nav(target); }}
      />

      <CalloutModal
        open={calloutOpen}
        fighter={fighter}
        onClose={() => setCalloutOpen(false)}
        onCalledOut={() => { onRefreshFighter?.(fighter?._id); reload(); }}
        onCancelled={() => { onRefreshFighter?.(fighter?._id); reload(); }}
        onMessage={onMessage}
      />

      <InjuryWarnModal
        open={injuryModal.open}
        injuries={injuryModal.injuries}
        onCancel={injuryModal.onCancel}
        onConfirm={injuryModal.onConfirm}
      />
    </section>
  );
});
