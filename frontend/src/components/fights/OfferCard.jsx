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

// ── Helpers ───────────────────────────────────────────────────────────────────

function ovrPillColor(variant) {
  // easy → grey (default op.ovr); even → white text; hard/title/callout/nemesis → red
  if (variant === "easy") return "op ovr op-ovr-easy";
  if (variant === "even") return "op ovr op-ovr-even";
  return "op ovr op-ovr-hard";
}

function formatOvrGap(gap) {
  if (gap === 0) return { text: "Matched", cls: "ss-val gold" };
  if (gap < 0)  return { text: `${Math.abs(gap)} below you`, cls: "ss-val grn" };
  return { text: `+${gap} above you`, cls: "ss-val red" };
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
  return <span className="streak-chip">{count}-Fight Streak</span>;
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
    [RELIABILITY_TIERS.CONFIRMED]:  { cls: "fog-tag confirmed", text: "Confirmed" },
    [RELIABILITY_TIERS.SUSPECTED]:  { cls: "fog-tag suspected", text: "Suspected" },
    [RELIABILITY_TIERS.UNKNOWN]:    { cls: "fog-tag unknown",    text: "Unknown" },
  };
  const { cls, text } = map[reliability] ?? map[RELIABILITY_TIERS.UNKNOWN];
  return <span className={cls}>{text}</span>;
}

function ThreatTag({ label, tone }) {
  const cls = `threat-tag tt-${tone}`;
  return <span className={cls}>{label}</span>;
}

// ── Locked title card ─────────────────────────────────────────────────────────
function LockedOverlay({ offer }) {
  let message = "Locked";
  if (offer.cooldownRemaining > 0) {
    message = `${offer.cooldownRemaining} win${offer.cooldownRemaining !== 1 ? "s" : ""} to rematch`;
  } else if (offer.winsNeeded > 0) {
    message = `${offer.winsNeeded} win${offer.winsNeeded !== 1 ? "s" : ""} to qualify`;
  } else if (offer.rankNeeded) {
    message = offer.currentRank == null
      ? "Get ranked first"
      : `Reach top 5 (now #${offer.currentRank})`;
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
    easy:    { cls: "diff-badge easy",    text: "Easy" },
    even:    { cls: "diff-badge even",    text: "Even" },
    hard:    { cls: "diff-badge hard",    text: "Hard" },
    title:   { cls: "diff-badge title",   text: "Title Shot" },
    callout: { cls: "diff-badge callout", text: "📣 Called Out" },
    nemesis: { cls: "diff-badge nemesis", text: "☠ Nemesis" },
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
            <div className="sb-title title">{tier} Championship</div>
            <div className="sb-sub">Win to promote to {targetTier} · Full 5-slot camp · +200 fame on win</div>
          </div>
        </div>
      );
    }
    if (isCallout) {
      return (
        <div className="special-banner callout">
          <span className="sb-icon">📣</span>
          <div className="sb-text">
            <div className="sb-title callout">Your Callout</div>
            <div className="sb-sub">You called this fight out. Full intel unlocked · +25% cash · +30% fame on win</div>
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
            <div className="sb-title nemesis">Nemesis Match</div>
            <div className="sb-sub">{opp.name} beat you {n} time{n !== 1 ? "s" : ""}. Win for +150 fame — even if fame is frozen.</div>
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
        {isTitle && <span className="op champ">Champion</span>}
        {isCallout && <span className="op callout-target">Callout Target</span>}
        {offer.beefMatch && <span className="op op-grudge" title={`Grudge match — +30% fame on win (${offer.beefMatch.expiresAfterFights} fights left)`}>Grudge</span>}
        {offer.respectMatch && <span className="op op-respect" title={`Respect match — +15% cash on win (${offer.respectMatch.expiresAfterFights} fights left)`}>Respect</span>}
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
          <div className="ss-lbl">Record</div>
          <div className="ss-val">{recordText}</div>
        </div>
        <div className="ss-item">
          <div className="ss-lbl">Last 3</div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Last3Dots lastThree={lastThree} />
            {hasStreak && <StreakChip count={winStreak} />}
          </div>
        </div>
        {finishes && (
          <div className="ss-item">
            <div className="ss-lbl">Finishes</div>
            <div className={`ss-val${finishes.ko > 0 ? " red" : ""}`}>
              KO {finishes.ko} · Sub {finishes.sub}
            </div>
          </div>
        )}
        <div className="ss-item">
          <div className="ss-lbl">OVR Gap</div>
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
      ? "Fighter Intel — Restricted"
      : isCallout
        ? "Fighter Intel — Full Access"
        : "Fighter Intel";

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
            <span className="ri-text">
              Champion tape is restricted — only <strong>2 fight logs</strong> visible. Use Game Plan Study or Sparring as safety nets.
            </span>
          </div>
        )}
        {isCallout && (
          <div className="full-intel-note">
            <div className="fi-row">
              <span className="fi-icon">🔍</span>
              <span className="fi-text">Callout unlocked <strong>full intel</strong> — every stat confirmed. No fog of war.</span>
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
          <div className="stakes-lbl">If you win</div>
          <div className="stakes-row">
            <span className="stake gold">🏆 {tier} Champion</span>
            <span className="stake grn">Promote to {targetTier}</span>
            <span className="stake gold">+200 fame</span>
          </div>
        </div>
      );
    }
    if (isCallout) {
      return (
        <div className="stakes-section">
          <div className="stakes-lbl">Callout bonuses on win</div>
          <div className="stakes-row">
            <span className="stake blue">📣 Called It badge</span>
            <span className="stake grn">+25% cash purse</span>
            <span className="stake grn">+30% fame</span>
          </div>
        </div>
      );
    }
    if (isNemesis) {
      return (
        <div className="stakes-section">
          <div className="stakes-lbl">If you win</div>
          <div className="stakes-row">
            <span className="stake grn">☠ Nemesis cleared</span>
            <span className="stake grn">+150 fame bonus</span>
            <span className="stake blue">Nemesis Slayer badge</span>
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
          <span className="nr-lbl">Your record vs {opp.name}</span>
          <span className="nr-val">0W · {n}L</span>
        </div>
        <div className="nr-row" style={{ marginTop: "4px" }}>
          <span className="nr-lbl">Win bonus</span>
          <span className="nr-bonus">★ +150 fame (always applies)</span>
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
    let btnLabel = "Accept";
    if (isTitle) btnLabel = "Accept Title Shot";
    if (isCallout) btnLabel = "Accept Callout";

    const energyLabel = isTitle
      ? `⚡ ${cost} energy · Full camp required`
      : `⚡ ${cost} energy`;

    return (
      <div className="accept-section">
        <span className="energy-note">{energyLabel}</span>
        <button
          type="button"
          className={btnCls}
          onClick={() => onAccept && onAccept(opp._id, offer.type)}
        >
          {btnLabel}
        </button>
      </div>
    );
  }

  // ── Card class ──
  const cardCls = `offer-card ${variant}${isLocked ? " offer-card-locked" : ""}`;

  return (
    <div className={cardCls}>
      <span className={badge.cls}>{badge.text}</span>

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
            <span>Giant Killer opportunity — {opp.name} is +{Math.abs(ovrGap)} OVR above you. Win for +300 fame bonus.</span>
          </div>
        </div>
      )}

      <AcceptSection />
    </div>
  );
}
