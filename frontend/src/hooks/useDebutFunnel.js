import { useEffect, useRef } from "react";
import { tutorialBus } from "../utils/tutorialBus";
import { markDebutStart, trackDebutStep } from "../utils/debutAnalytics";
import { isPreDebut } from "../utils/fighterMath";

/**
 * Debut funnel beacons that can be read off app state (see utils/debutAnalytics.js):
 *   1 the player reached the Fight tab, 2 fight accepted, 3 Fighter Report closed,
 *   4 Begin Fight pressed, 6 the debut result screen was left by changing tab.
 * Steps 5 (reveal started) and 6 (Next fight / Train buttons) are sent from App where they happen.
 * Everything is gated on the fighter still having no resolved fight, except step 6, which reads the
 * result summary (by then the fighter has one).
 */
export function useDebutFunnel({ fighter, activeTab, lastFightSummary }) {
  const fighterId = fighter?._id;
  const preDebut = isPreDebut(fighter);
  const preDebutRef = useRef(preDebut);
  preDebutRef.current = preDebut;

  // The clock for msSinceStart starts the first time this session sees the debut ahead.
  useEffect(() => {
    if (fighterId && preDebut) markDebutStart(fighterId);
  }, [fighterId, preDebut]);

  useEffect(() => {
    if (fighterId && preDebut && activeTab === "fights") trackDebutStep(fighterId, 1);
  }, [fighterId, preDebut, activeTab]);

  useEffect(() => {
    if (!fighterId) return undefined;
    const send = (step) => () => { if (preDebutRef.current) trackDebutStep(fighterId, step); };
    const offs = [
      tutorialBus.on("fight_accepted", send(2)),
      tutorialBus.on("fighter_report_closed", send(3)),
      tutorialBus.on("fight_resolve_started", send(4)),
    ];
    return () => offs.forEach((off) => off());
  }, [fighterId]);

  // Leaving the debut result by any tab counts as step 6 (the buttons send it themselves).
  useEffect(() => {
    if (fighterId && lastFightSummary?.isDebut && activeTab !== "fights") trackDebutStep(fighterId, 6);
  }, [fighterId, lastFightSummary?.isDebut, activeTab]);
}

export default useDebutFunnel;
