import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";
import { tierLabel } from "../../../constants/fame";

/**
 * Money & Fame tile — renders synchronously (fighter prop), payload preferred
 * when present. Display-only: the app has no dedicated Finances page (the
 * mockup's "Finances" link has no real destination here), so unlike the other
 * tiles this one has no bottom hn-link row.
 */
export function MoneyFameTile({ fighter, resources, index }) {
  const n = fighter?.notoriety ?? null;
  const ironVal = resources?.iron ?? fighter?.iron ?? 0;
  const fameScore = resources?.fame ?? n?.score ?? 0;
  const fameTier = n?.tierLabel ?? "n/a";
  const purseFrac = n?.purseModifier ?? 0;
  const progress = Math.max(0, Math.min(100, Number(n?.progressWithinTier ?? 0)));
  const nextTh = n?.nextTierThreshold ?? null;
  const nextKey = n?.nextTierKey ?? null;
  const fameFrozen = !!n?.isFrozen;
  const fameDecaying = !!n?.decayWarningActive;

  let fameContext;
  let fameBarFull = false;
  if (nextTh == null) {
    fameContext = t("home.money.topTierReached");
    fameBarFull = true;
  } else if (nextKey == null) {
    fameContext = t("home.money.keepFighting");
  } else {
    fameContext = t("home.money.toNextTier", {
      remaining: Math.max(0, nextTh - fameScore).toLocaleString(),
      tier: tierLabel(nextKey),
    });
  }
  const fameBarWidth = fameBarFull ? 100 : progress;
  const pursePct = Math.round(purseFrac * 100);

  return (
    <HomeTile
      tone="gold"
      span={6}
      index={index}
      className="hn-money"
      head={
        <>
          <span>{t("home.money.title")}</span>
          {(fameFrozen || fameDecaying) ? (
            <span className="hn-money-chips">
              {fameFrozen ? <span className="hn-money-chip is-frozen">{t("home.money.frozen")}</span> : null}
              {fameDecaying ? <span className="hn-money-chip is-decay">{t("home.money.fameDecaying")}</span> : null}
            </span>
          ) : null}
        </>
      }
    >
      <div className="hn-kpis">
        <span className="hn-kpi">
          <b>${Number(ironVal).toLocaleString()}</b>
          <small>{t("home.money.cashLabel")}</small>
        </span>
        <span className="hn-kpi">
          <b>{Number(fameScore).toLocaleString()}</b>
          <small>{fameTier}</small>
        </span>
      </div>
      <div>
        <div className="hn-fame-row">
          <b>{fameTier}</b>
          <span>{fameContext}</span>
        </div>
        <span className="hn-bar" style={{ "--w": `${fameBarWidth}%` }}><i /></span>
      </div>
      {pursePct > 0 ? <p><span className="hn-perk">{t("home.money.pursePct", { pct: pursePct })}</span></p> : null}
    </HomeTile>
  );
}
