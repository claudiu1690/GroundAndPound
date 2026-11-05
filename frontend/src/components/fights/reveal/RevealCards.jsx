import { t } from "@/lib/i18n";
import { CAMP_SESSIONS } from "../../../constants/campConfig";
import { RARITY_COLORS, RARITY_LABELS, TRIGGER_WORDS } from "../../../constants/specialMovesCatalog";
import { WILDCARD_AREA } from "../breakdown/eventTemplates.js";
import { ArtThumb } from "../breakdown/ArtThumb.jsx";
import { CAMP_EVENT_SESSION } from "./revealModel.js";

/** Every card below carries `.fr-rv-item` (the e2e suite waits on it) and a data-hkind. */

export function MoveCard({ move, effectType, line }) {
  const sig = effectType === "SIGNATURE";
  const color = RARITY_COLORS[move?.rarity] || RARITY_COLORS.COMMON;
  const trigger = TRIGGER_WORDS[move?.triggerCondition] || "";
  return (
    <div className="fr-rv-item fr-rv-movewrap" data-hkind="move" style={{ "--rarity-color": color }}>
      <div className={`fr-rv-movecard${sig ? " is-sig" : ""}`}>
        <ArtThumb art={move?.art} name={move?.name} className="fr-rv-movecard-art" />
        {move?.rarity && <span className="fr-rv-rar">{RARITY_LABELS[move.rarity] ?? move.rarity}</span>}
        <div className="fr-rv-nm">
          <b>{move?.name}</b>
          <span>{sig ? t("reveal.signatureCard") : t("reveal.procCard")}</span>
        </div>
      </div>
      <div className="fr-rv-moveline">
        {trigger && <div className="fr-rv-tag">{trigger}</div>}
        <div className="fr-rv-ln">{line}</div>
      </div>
    </div>
  );
}

const MATCH_WORDS = {
  // No bonus size here: a repeated session is worth less, and the snapshot does not carry the value.
  MATCHED: "Matched to his game",
  PARTIAL: "Partly matched to his game",
};

export function CampCard({ event, loadoutCamp, line }) {
  const session = CAMP_EVENT_SESSION[event?.templateKey] ?? null;
  const row = session ? (loadoutCamp ?? []).find((c) => c.sessionType === session) : null;
  const cfg = session ? CAMP_SESSIONS[session] : null;
  const label = row?.label ?? cfg?.label ?? t("reveal.chipCampGeneric");
  return (
    <div className="fr-rv-item fr-rv-campcard" data-hkind="camp">
      <div className="fr-rv-ic">{t("reveal.campPaidOff")}</div>
      <div className="fr-rv-big">{label}</div>
      {/* How well the session fit this opponent, from the fight's own data. The config's effect
          label carried a fixed number (e.g. +25%) that is lower on a partial match, so it is not shown. */}
      {MATCH_WORDS[row?.matchStatus] && <div className="fr-rv-eff">{MATCH_WORDS[row.matchStatus]}</div>}
      <div className="fr-rv-ln">{line}</div>
    </div>
  );
}

export function WildcardCard({ event, line }) {
  const area = WILDCARD_AREA[event?.vars?.stat] ?? "";
  return (
    <div className="fr-rv-item fr-rv-wild" data-hkind="wildcard">
      <div className="fr-rv-ic">{t("reveal.theirWildcard")}</div>
      <div className="fr-rv-big">{area}</div>
      <div className="fr-rv-ln">{line}</div>
    </div>
  );
}

export function HighlightCard({ name, event, big, line }) {
  const side = event?.actorIsPlayer ? "you" : "opp";
  const where = event?.timestamp ? event.timestamp : t("reveal.roundLabel", { n: event?.round });
  return (
    <div className={`fr-rv-item fr-rv-hl fr-rv-hl--${side}`} data-hkind="highlight">
      <div className="fr-rv-ic">{name} · {where}</div>
      <div className="fr-rv-big">{big}</div>
      <div className="fr-rv-ln">{line}</div>
    </div>
  );
}

export function QuietLine({ line }) {
  return <div className="fr-rv-item fr-rv-quiet" data-hkind="quiet">{line}</div>;
}

export function PassivePills({ rows }) {
  if (!rows.length) return null;
  return (
    <div className="fr-rv-pills" aria-hidden="true">
      {rows.map((m) => (
        <span key={m.moveId} className="fr-rv-pill" style={{ "--rarity-color": RARITY_COLORS[m.rarity] || RARITY_COLORS.COMMON }}>
          <ArtThumb art={m.art} name={m.name} className="fr-rv-pill-art" />
          {t("reveal.passiveOn", { name: m.name })}
        </span>
      ))}
    </div>
  );
}

/** A READY line in the feed: a move's gate opened at this round's start (docs/move-ready-glow-spec.md). */
export function ReadyRow({ line, age }) {
  return (
    <div className="fr-rv-feed-row fr-rv-feed-row--ready" data-age={age} data-testid="reveal-ready-row" style={{ opacity: Math.max(0.35, 1 - age * 0.18) }}>
      <span className="fr-rv-feed-chip fr-rv-feed-chip--ready">{t("reveal.ready.tab")}</span>
      <span className="fr-rv-feed-line">{t(`reveal.ready.line.${line.key}`, line.vars)}</span>
    </div>
  );
}

/** One compact, already-played row under the active card. Same line as the card, no new text. */
export function FeedRow({ item, age }) {
  const isQuiet = item.kind === "quiet";
  const event = item.event;
  // A combo row shows the move's line, so it carries the CARD chip (the camp half played as its own card).
  const chip = isQuiet ? null : item.hkind === "move" ? "card" : item.hkind === "camp" ? "camp" : item.hkind === "wildcard" ? "wildcard" : null;
  const side = isQuiet ? "quiet" : item.hkind === "wildcard" ? "opp" : event?.actorIsPlayer ? "you" : "opp";
  const when = event?.timestamp ? event.timestamp : t("reveal.clockRound", { n: item.round });
  const chipText = chip === "camp" ? t("reveal.chipCampGeneric") : chip === "wildcard" ? t("reveal.chipWildcard") : chip === "card" ? t("reveal.chipCard") : "";
  return (
    <div className={`fr-rv-feed-row fr-rv-feed-row--${side}`} data-age={age} style={{ opacity: Math.max(0.35, 1 - age * 0.18) }}>
      <span className="fr-rv-feed-time">{when}</span>
      <span className="fr-rv-feed-line">{item.line}</span>
      {chip && <span className={`fr-rv-feed-chip fr-rv-feed-chip--${chip}`}>{chipText}</span>}
    </div>
  );
}
