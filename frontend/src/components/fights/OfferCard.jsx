/**
 * OfferCard.jsx — single card for all 6 offer variants:
 * easy / even / hard / title / callout / nemesis
 *
 * Props: { offer, fighter, energyCost, onAccept }
 * Pure presentational; all derived data comes from offerIntel.js.
 */
import { Lock } from "lucide-react";
import {
  RELIABILITY_TIERS,
  buildStatIntel,
  buildThreatTags,
  describeOffer,
} from "./offerIntel";
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants";
import { t } from "@/lib/i18n";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ovrPillColor(variant) {
  // easy → grey (default op.ovr); even → white text; hard/title/callout/nemesis → red
  if (variant === "easy") return "op ovr op-ovr-easy";
  if (variant === "even") return "op ovr op-ovr-even";
  return "op ovr op-ovr-hard";
}

function formatOvrGap(gap) {
  if (gap === 0) return { text: t("fights.offerCard.ovrMatched"), cls: "ss-val gold" };
  if (gap < 0)  return { text: t("fights.offerCard.ovrBelow", { n: Math.abs(gap) }), cls: "ss-val grn" };
  return { text: t("fights.offerCard.ovrAbove", { n: gap }), cls: "ss-val red" };
}

function RankDisplay({ opp }) {
  const rank = typeof opp.displayRank === "number" ? opp.displayRank
             : typeof opp.fixedRank   === "number" ? opp.fixedRank
             : null;
  if (rank == null) return null;
  return <span className="op rank">#{rank}</span>;
}

function Last3Dots({ lastThree }) {
  if (!lastThree || lastThree.length === 0) return null;
  return (
    <div className="last3">
      {lastThree.map((f, i) => {
        const cls = f.result === "win" ? "l3-dot w" : f.result === "loss" ? "l3-dot l" : "l3-dot d";
        return <div key={i} className={cls}>{f.result === "win" ? "W" : f.result === "loss" ? "L" : "D"}</div>;
      })}
    </div>
  );
}

function StreakChip({ count }) {
  if (!count || count < 4) return null;
  return <span className="streak-chip">{t("fights.offerCard.streakChip", { n: count })}</span>;
}

function FogBar({ value, reliability }) {
  const widthPct = `${value}%`;
  const isUnknown = reliability === RELIABILITY_TIERS.UNKNOWN;
  const isSuspected = reliability === RELIABILITY_TIERS.SUSPECTED;

  if (isUnknown) {
    return (
      <div className="fog-bar">
        <div className="fog-fill fog-fill-grey" style={{ width: "20%" }} />
      </div>
    );
  }

  return (
    <div className="fog-bar">
      <div className="fog-fill" style={{ width: widthPct }} />
      {isSuspected && <div className="fog-cover" style={{ width: "25%" }} />}
    </div>
  );
}

function FogTag({ reliability }) {
  const map = {
    [RELIABILITY_TIERS.CONFIRMED]:  { cls: "fog-tag confirmed", textKey: "fights.offerCard.fogConfirmed" },
    [RELIABILITY_TIERS.SUSPECTED]:  { cls: "fog-tag suspected", textKey: "fights.offerCard.fogSuspected" },
    [RELIABILITY_TIERS.UNKNOWN]:    { cls: "fog-tag unknown",    textKey: "fights.offerCard.fogUnknown" },
  };
  const { cls, textKey } = map[reliability] ?? map[RELIABILITY_TIERS.UNKNOWN];
  return <span className={cls}>{t(textKey)}</span>;
}

function ThreatTag({ label, tone }) {
  const cls = `threat-tag tt-${tone}`;
  return <span className={cls}>{label}</span>;
}

// ── Locked title card ─────────────────────────────────────────────────────────
function LockedOverlay({ offer }) {
  // Precedence follows the actual path to the shot: clear any rematch cooldown,
  // then get ranked top-5, THEN bank the qualifying wins. Rank must come before
  // winsNeeded — the qualifying wins can only be earned while top-5, so telling a
  // #10 fighter "win 2 to qualify" is wrong (they can't, until they're top-5).
  let message = t("fights.offerCard.lockedDefault");
  if (offer.cooldownRemaining > 0) {
    message = t("fights.offerCard.lockedWinsRematch", { n: offer.cooldownRemaining, plural: offer.cooldownRemaining !== 1 ? "s" : "" });
  } else if (offer.rankNeeded) {
    message = offer.currentRank == null
      ? t("fights.offerCard.lockedGetRanked")
      : t("fights.offerCard.lockedReachTop5", { rank: offer.currentRank });
  } else if (offer.winsNeeded > 0) {
    message = t("fights.offerCard.lockedWinsQualify", { n: offer.winsNeeded, plural: offer.winsNeeded !== 1 ? "s" : "" });
  }
  return (
    <div className="accept-section">
      <Lock size={14} style={{ color: "var(--text-muted)" }} />
      <span className="offer-locked-text">{message}</span>
    </div>
  );
}

// ── Main OfferCard ────────────────────────────────────────────────────────────

export function OfferCard({ offer, fighter, energyCost, onAccept }) {
  const opp     = offer?.opponent ?? {};
  const ctx     = offer?.context  ?? {};
  const variant = offer?._variant ?? "even"; // injected by buildCardModel consumer

  const isTitle   = variant === "title";
  const isCallout = variant === "callout";
  const isNemesis = variant === "nemesis";
  const isLocked  = !!offer.locked;

  const { ovrGap, finishes, lastThree, winStreak, specialType, giantKiller } = describeOffer(offer, fighter);
  const statIntel = buildStatIntel(offer);
  const threatTags = buildThreatTags(offer, fighter?.overallRating);

  const rec = ctx.record ?? {};
  const recordText = `${rec.wins ?? 0}W · ${rec.losses ?? 0}L`;

  // Determine promotionTier-aware energy cost
  const cost = isTitle
    ? (FIGHT_ENERGY_COST[fighter?.promotionTier] ?? energyCost)
    : energyCost;

  // ── Diff badge ──
  const diffBadgeMap = {
    easy:    { cls: "diff-badge easy",    textKey: "fights.offerCard.diffEasy" },
    even:    { cls: "diff-badge even",    textKey: "fights.offerCard.diffEven" },
    hard:    { cls: "diff-badge hard",    textKey: "fights.offerCard.diffHard" },
    title:   { cls: "diff-badge title",   textKey: "fights.offerCard.diffTitle" },
    callout: { cls: "diff-badge callout", textKey: "fights.offerCard.diffCallout" },
    nemesis: { cls: "diff-badge nemesis", textKey: "fights.offerCard.diffNemesis" },
  };
  const badge = diffBadgeMap[variant] ?? diffBadgeMap.even;

  // ── Special banner ──
  function SpecialBanner() {
    if (isTitle) {
      const tier = fighter?.promotionTier ?? "Amateur";
      const targetTier = offer.titleShotMeta?.targetTier ?? "National";
      return (
        <div className="special-banner title">
          <span className="sb-icon">🏆</span>
          <div className="sb-text">
            <div className="sb-title title">{t("fights.offerCard.specialTitleBout", { tier })}</div>
            <div className="sb-sub">{t("fights.offerCard.specialTitleSub", { targetTier })}</div>
          </div>
        </div>
      );
    }
    if (isCallout) {
      return (
        <div className="special-banner callout">
          <span className="sb-icon">📣</span>
          <div className="sb-text">
            <div className="sb-title callout">{t("fights.offerCard.specialCalloutTitle")}</div>
            <div className="sb-sub">{t("fights.offerCard.specialCalloutSub")}</div>
          </div>
        </div>
      );
    }
    if (isNemesis) {
      const n = offer.nemesisMeta?.lossCount ?? 1;
      return (
        <div className="special-banner nemesis">
          <span className="sb-icon">☠</span>
          <div className="sb-text">
            <div className="sb-title nemesis">{t("fights.offerCard.specialNemesisTitle")}</div>
            <div className="sb-sub">{t("fights.offerCard.specialNemesisSub", { name: opp.name, n, plural: n !== 1 ? "s" : "" })}</div>
          </div>
        </div>
      );
    }
    return null;
  }

  // ── Opponent pills ──
  function OppPills() {
    return (
      <div className="opp-pills">
        <span className={ovrPillColor(variant)}>OVR {opp.overallRating}</span>
        <RankDisplay opp={opp} />
        {opp.style && <span className="op style">{opp.style}</span>}
        {opp.weightClass && !isNemesis && <span className="op wc">{opp.weightClass}</span>}
        {isTitle && <span className="op champ">{t("fights.offerCard.pillChampion")}</span>}
        {isCallout && <span className="op callout-target">{t("fights.offerCard.pillCalloutTarget")}</span>}
        {offer.beefMatch && <span className="op op-grudge" title={t("fights.offerCard.grudgeTitle", { n: offer.beefMatch.expiresAfterFights })}>{t("fights.offerCard.grudgeLabel")}</span>}
        {offer.respectMatch && <span className="op op-respect" title={t("fights.offerCard.respectTitle", { n: offer.respectMatch.expiresAfterFights })}>{t("fights.offerCard.respectLabel")}</span>}
      </div>
    );
  }

  // ── Stats section ──
  const ovrGapFmt = formatOvrGap(ovrGap);

  function StatsSection() {
    const hasStreak = winStreak >= 4;
    return (
      <div className="stats-section">
        <div className="ss-item">
          <div className="ss-lbl">{t("fights.offerCard.statsRecord")}</div>
          <div className="ss-val">{recordText}</div>
        </div>
        <div className="ss-item">
          <div className="ss-lbl">{t("fights.offerCard.statsLast3")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Last3Dots lastThree={lastThree} />
            {hasStreak && <StreakChip count={winStreak} />}
          </div>
        </div>
        {finishes && (
          <div className="ss-item">
            <div className="ss-lbl">{t("fights.offerCard.statsFinishes")}</div>
            <div className={`ss-val${finishes.ko > 0 ? " red" : ""}`}>
              KO {finishes.ko} · Sub {finishes.sub}
            </div>
          </div>
        )}
        <div className="ss-item">
          <div className="ss-lbl">{t("fights.offerCard.statsOvrGap")}</div>
          <div className={ovrGapFmt.cls}>{ovrGapFmt.text}</div>
        </div>
      </div>
    );
  }

  // ── Intel section ──
  function IntelSection() {
    // Champion title fight: restricted intel
    const isChampion = !!opp.isChampion;
    const intelHeader = isTitle
      ? t("fights.offerCard.intelRestricted")
      : isCallout
        ? t("fights.offerCard.intelFullAccess")
        : t("fights.offerCard.intelHeader");

    // Unified display rule across ALL cards: a CONFIRMED stat shows its real
    // number; anything less reliable shows the reliability word + an obscured
    // bar. Number = you know it; word = you don't (to varying degrees).
    return (
      <div className="intel-section">
        <div className="intel-lbl">{intelHeader}</div>
        <div className="intel-fog">
          {statIntel.map(({ key, label, value, reliability }) => {
            const confirmed = reliability === RELIABILITY_TIERS.CONFIRMED;
            return (
              <div key={key} className="fog-row">
                <span className="fog-lbl">{label}</span>
                <FogBar value={value} reliability={reliability} />
                {confirmed
                  ? <span className="fog-tag confirmed fog-num">{value}</span>
                  : <FogTag reliability={reliability} />}
              </div>
            );
          })}
        </div>
        {isTitle && isChampion && (
          <div className="restricted-intel">
            <span className="ri-icon">⚠</span>
            <span className="ri-text">{t("fights.offerCard.intelChampionNote")}</span>
          </div>
        )}
        {isCallout && (
          <div className="full-intel-note">
            <div className="fi-row">
              <span className="fi-icon">🔍</span>
              <span className="fi-text">{t("fights.offerCard.intelCalloutNote")}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Stakes section ──
  function StakesSection() {
    if (isTitle) {
      const tier = fighter?.promotionTier ?? "Amateur";
      const targetTier = offer.titleShotMeta?.targetTier ?? "National";
      return (
        <div className="stakes-section">
          <div className="stakes-lbl">{t("fights.offerCard.stakesIfYouWin")}</div>
          <div className="stakes-row">
            <span className="stake gold">🏆 {t("fights.offerCard.stakesTitleChampion", { tier })}</span>
            <span className="stake grn">{t("fights.offerCard.stakesTitlePromote", { targetTier })}</span>
            <span className="stake gold">+200 fame</span>
          </div>
        </div>
      );
    }
    if (isCallout) {
      return (
        <div className="stakes-section">
          <div className="stakes-lbl">{t("fights.offerCard.stakesCalloutBonuses")}</div>
          <div className="stakes-row">
            <span className="stake blue">{t("fights.offerCard.stakesCalloutBadge")}</span>
            <span className="stake grn">{t("fights.offerCard.stakesCalloutCash")}</span>
            <span className="stake grn">{t("fights.offerCard.stakesCalloutFame")}</span>
          </div>
        </div>
      );
    }
    if (isNemesis) {
      return (
        <div className="stakes-section">
          <div className="stakes-lbl">{t("fights.offerCard.stakesIfYouWin")}</div>
          <div className="stakes-row">
            <span className="stake grn">{t("fights.offerCard.stakesNemesisCleared")}</span>
            <span className="stake grn">{t("fights.offerCard.stakesNemesisFame")}</span>
            <span className="stake blue">{t("fights.offerCard.stakesNemesisBadge")}</span>
          </div>
        </div>
      );
    }
    return null;
  }

  // ── Nemesis record block ──
  function NemesisRecord() {
    if (!isNemesis) return null;
    const n = offer.nemesisMeta?.lossCount ?? 1;
    return (
      <div className="nemesis-record">
        <div className="nr-row">
          <span className="nr-lbl">{t("fights.offerCard.nemesisRecordLabel", { name: opp.name })}</span>
          <span className="nr-val">0W · {n}L</span>
        </div>
        <div className="nr-row" style={{ marginTop: "4px" }}>
          <span className="nr-lbl">{t("fights.offerCard.nemesisWinBonusLabel")}</span>
          <span className="nr-bonus">{t("fights.offerCard.nemesisWinBonusValue")}</span>
        </div>
      </div>
    );
  }

  // ── Accept section ──
  function AcceptSection() {
    if (isLocked) {
      return <LockedOverlay offer={offer} />;
    }

    let btnCls = `accept-btn ${variant}`;
    let btnLabel = t("fights.offerCard.acceptDefault");
    if (isTitle) btnLabel = t("fights.offerCard.acceptTitle");
    if (isCallout) btnLabel = t("fights.offerCard.acceptCallout");

    const energyLabel = isTitle
      ? t("fights.offerCard.energyFull", { n: cost })
      : t("fights.offerCard.energy", { n: cost });

    return (
      <div className="accept-section">
        <span className="energy-note">{energyLabel}</span>
        <button
          type="button"
          className={btnCls}
          onClick={() => onAccept && onAccept(opp._id, offer.type)}
          data-tut="offer-accept"
        >
          {btnLabel}
        </button>
      </div>
    );
  }

  // ── Card class ──
  const cardCls = `offer-card ${variant}${isLocked ? " offer-card-locked" : ""}`;

  return (
    // data-tut only on UNLOCKED cards so the tutorial cut-out never lands on a
    // locked offer (whose Accept button is hidden), which would re-trap the player.
    <div className={cardCls} data-tut={isLocked ? undefined : "offer-card"}>
      <span className={badge.cls}>{t(badge.textKey)}</span>

      <SpecialBanner />

      <div className="opp-section">
        <div className="opp-name">{opp.name}</div>
        {opp.nickname && <div className="opp-nick">&quot;{opp.nickname}&quot;</div>}
        <OppPills />
      </div>

      <StatsSection />

      <NemesisRecord />

      <IntelSection />

      {threatTags.length > 0 && (
        <div className="threat-section">
          {threatTags.map((t, i) => <ThreatTag key={i} label={t.label} tone={t.tone} />)}
        </div>
      )}

      <StakesSection />

      {giantKiller && !isTitle && (
        <div className="context-section">
          <div className="context-note">
            <span className="context-note-icon" style={{ color: "var(--c-amber-bright, #D4A820)" }}>★</span>
            <span>{t("fights.offerCard.giantKillerNote", { name: opp.name, n: Math.abs(ovrGap) })}</span>
          </div>
        </div>
      )}

      <AcceptSection />
    </div>
  );
}
