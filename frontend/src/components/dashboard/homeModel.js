/**
 * Pure derivations for the Fight Night home screen. No React, no fetching —
 * everything here takes plain data and returns plain data or strings so the
 * components that use them stay declarative. Moved out of the old
 * DashboardTab.jsx during the Fight Night rewrite (see home-contract.md §3).
 */
import { t } from "@/lib/i18n";

// ── Time formatting ───────────────────────────────────────────
export function formatEta(minutes) {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function feedDate(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.round((Date.now() - d.getTime()) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Relative time label from an ISO date string — "2h ago", "3d ago", etc. */
export function relativeTime(iso) {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch { return ""; }
}

/** Derive result pill text and color class from leadStory.resultBand. */
export function gazetteResultPill(leadStory) {
  const band = leadStory?.resultBand;
  if (!band?.outcomeLabel) return null;
  const label = band.outcomeLabel;
  const method = band.methodRound ? ` · ${band.methodRound}` : "";
  const text = `${label}${method}`;
  const l = label.toLowerCase();
  const cls = l.includes("win") || l.includes("victor") ? "hn-gz-pill--win"
    : l.includes("loss") || l.includes("defeat") ? "hn-gz-pill--loss"
    : "hn-gz-pill--draw";
  return { text, cls };
}

/**
 * Title-shot condition progress, from ranking.titleShot
 * {ovrMet, topFive, winsMet, winsInTier, titleWins}.
 * `nextLabel` is the number of wins still needed (the wins condition is the
 * last-mile gate); null once all three conditions are met.
 */
export function titleShotProgress(ranking) {
  const ts = ranking?.titleShot;
  if (!ts) return { done: 0, total: 3, nextLabel: null };
  const done = [ts.ovrMet, ts.topFive, ts.winsMet].filter(Boolean).length;
  const nextLabel = ts.winsMet ? null : Math.max(1, (ts.titleWins ?? 0) - (ts.winsInTier ?? 0));
  return { done, total: 3, nextLabel };
}

/** First-name / last-name split for an opponent's plain full name string. NPC
 *  Opponent docs and offers only carry one "opponentName" field, but
 *  BannerPreview (built for real fighters) needs firstName/lastName
 *  separately. Split on the first space; single-word names become the
 *  surname so the nameplate's bold last-name treatment still applies. */
export function splitName(fullName) {
  const name = (fullName || "").trim();
  if (!name) return { firstName: "", lastName: "" };
  const idx = name.indexOf(" ");
  if (idx === -1) return { firstName: "", lastName: name };
  return { firstName: name.slice(0, idx), lastName: name.slice(idx + 1) };
}

/**
 * Banner config for an unknown/NPC rival — Opponent docs carry no banner of
 * their own (home-contract.md §4). No backend field; this is a frontend-only
 * constant.
 */
export const RIVAL_BANNER = {
  backgroundId: "BG_CRIMSON",
  accentColor: "ACC_WHITE",
  frameId: "LAYOUT_BROADCAST",
  badgeSlots: [],
};

/** Build a plain "fighter" object BannerPreview can render for a heroBout/offer opponent. */
export function rivalFighter({ opponentName, opponentNickname, opponentOvr, opponentTier, opponentWeightClass, record }) {
  const { firstName, lastName } = splitName(opponentName);
  return {
    firstName,
    lastName,
    nickname: opponentNickname ?? null,
    promotionTier: opponentTier ?? "Amateur",
    weightClass: opponentWeightClass ?? null,
    overallRating: opponentOvr ?? "n/a",
    record: record ?? { wins: 0, losses: 0, draws: 0 },
  };
}

/**
 * Copy + role derivations for the Fight Night hero. Pure — the CTA label and
 * sublabel always come from the server's heroAction (every branch of
 * computeHeroAction returns one), never invented client-side prose.
 */
export function heroCopy(heroAction, heroBout, offers) {
  const ctaLabel = heroAction?.label ?? "";
  const ctaSublabel = heroAction?.sublabel ?? null;
  const offerCount = offers?.count ?? 0;

  if (!heroBout) {
    return {
      ctaLabel,
      ctaSublabel,
      ctaPillCount: offerCount > 0 ? offerCount : null,
      hasBout: false,
      rivalRoleKey: null,
      stakesBoldKey: null,
      purseAmount: null,
      boutWeightClass: null,
      boutRounds: null,
    };
  }

  const rivalRoleKey = heroBout.isNemesis
    ? "roleNemesis"
    : heroBout.isTitleShot
      ? "roleChampion"
      : "roleRival";

  const stakesBoldKey = heroBout.isRematch
    ? "stakesRematch"
    : heroBout.isTitleShot
      ? "stakesTitle"
      : null;

  return {
    ctaLabel,
    ctaSublabel,
    ctaPillCount: offerCount > 0 ? offerCount : null,
    hasBout: true,
    rivalRoleKey,
    stakesBoldKey,
    purseAmount: heroBout.purse ?? null,
    boutWeightClass: heroBout.opponentWeightClass ?? null,
    boutRounds: heroBout.rounds ?? null,
  };
}

/** "$3,200" style formatting for purses — no currency lib in the frontend. */
export function formatPurse(n) {
  if (n == null) return "";
  return `$${Number(n).toLocaleString()}`;
}

/** Plural-aware label for "N unread defense report(s)". */
export function defenseTitle(n) {
  return n === 1 ? t("home.pg.defenseTitle", { n }) : t("home.pg.defenseTitlePlural", { n });
}
