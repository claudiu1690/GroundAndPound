/**
 * offerIntel.js — DISPLAY-ONLY mirror of services/campService.js + consts/campConfig.js
 * classification logic.  Pure JS, no React.
 *
 * If the backend heuristic changes this drifts — keep in sync.
 * Source of truth: campConfig.js (RELIABILITY_TIERS, STAT_FIGHT_DOMAIN)
 *                  campService.js (analyseFightHistory, classifyStat)
 */

// ── Reliability tiers (mirror of campConfig.RELIABILITY_TIERS) ──────────────
export const RELIABILITY_TIERS = {
  CONFIRMED:  "CONFIRMED",
  SUSPECTED:  "SUSPECTED",
  UNKNOWN:    "UNKNOWN",
};

// ── Stat → fight domain mapping (mirror of campConfig.STAT_FIGHT_DOMAIN) ─────
export const STAT_FIGHT_DOMAIN = {
  str: { domain: "striking",    methods: ["KO/TKO"] },
  spd: { domain: "striking",    methods: ["KO/TKO"] },
  leg: { domain: "striking",    methods: ["KO/TKO"] },
  wre: { domain: "grappling",   methods: ["KO/TKO", "Submission"] },
  gnd: { domain: "grappling",   methods: ["KO/TKO"] },
  sub: { domain: "submission",  methods: ["Submission"] },
  chn: { domain: "durability",  methods: [] },
  fiq: { domain: "tactical",    methods: ["Decision"] },
};

// Short display labels for each stat key
const STAT_SHORT_LABEL = {
  str: "STR", spd: "SPD", leg: "LEG", wre: "WRE",
  gnd: "GND", sub: "SUB", chn: "CHN", fiq: "FIQ",
};

// Tie-break order when values are equal (fixed canonical order)
const STAT_KEY_ORDER = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

// ── Threat tag labels table ──────────────────────────────────────────────────
// Maps stat key + tier ("elite"/"strong"/"weak") to display text.
const THREAT_LABELS = {
  str_elite:  "Elite KO power",
  str_strong: "Strong striking power",
  str_weak:   "Weak striking output",
  spd_elite:  "Elite hand speed",
  spd_strong: "Strong hand speed",
  spd_weak:   "Slow on the feet",
  leg_elite:  "Elite kick game",
  leg_strong: "Strong kicks",
  leg_weak:   "Limited kick game",
  wre_elite:  "Elite wrestler",
  wre_strong: "Strong takedowns",
  wre_weak:   "Limited wrestling",
  gnd_elite:  "Elite ground game",
  gnd_strong: "Heavy ground & pound",
  gnd_weak:   "Exploitable ground game",
  sub_elite:  "Elite submission hunter",
  sub_strong: "Powerful submission game",
  sub_weak:   "Weak submission defence",
  chn_elite:  "Iron chin",
  chn_strong: "Strong chin",
  chn_weak:   "Exploitable chin",
  fiq_elite:  "Elite fight IQ",
  fiq_strong: "Smothering top control",
  fiq_weak:   "Exploitable fight IQ",
};

// ── analyseFightHistory (mirror of campService.analyseFightHistory) ───────────
/**
 * @param {Array} fightHistory
 * @param {number} maxLogs
 * @returns {{ domainCounts: object, totalFights: number }}
 */
export function analyseFightHistory(fightHistory, maxLogs = 5) {
  const last = (fightHistory || []).slice(-maxLogs);
  const domainCounts = {
    striking: 0,
    grappling: 0,
    submission: 0,
    durability: 0,
    tactical: 0,
  };

  for (const fight of last) {
    const method = fight.method || "";
    if (method.includes("KO/TKO")) {
      domainCounts.striking++;
      if (fight.result === "loss") domainCounts.durability++;
    }
    if (method.includes("Submission")) {
      domainCounts.submission++;
      domainCounts.grappling++;
    }
    if (method.includes("Decision")) {
      domainCounts.tactical++;
    }
    // Grappling implied in non-pure-striking fights
    if (method.includes("Submission") || method.includes("Decision")) {
      domainCounts.grappling++;
    }
  }

  return { domainCounts, totalFights: last.length };
}

// ── classifyStat (mirror of campService.classifyStat) ────────────────────────
/**
 * Rank MUST be computed over ALL 8 stats sorted by value desc (1-based).
 *
 * @param {string} statKey   lowercase (str, spd, …)
 * @param {number} statValue kept for parity with campService.classifyStat(statKey, statValue,
 *                           rank, domainCounts, totalFights) — intentionally unused here.
 *                           If the backend ever starts using it in branch logic this param
 *                           will surface the drift immediately.
 * @param {number} rank      1-based rank among all 8 stats
 * @param {object} domainCounts
 * @param {number} totalFights
 * @returns {string}  one of RELIABILITY_TIERS
 */
// eslint-disable-next-line no-unused-vars
export function classifyStat(statKey, statValue, rank, domainCounts, totalFights) {
  const domain = STAT_FIGHT_DOMAIN[statKey]?.domain ?? "unknown";
  const domainEvidence = domainCounts[domain] ?? 0;

  if (rank <= 2 && domainEvidence >= 3) return RELIABILITY_TIERS.CONFIRMED;
  if (rank <= 2 && domainEvidence >= 1) return RELIABILITY_TIERS.SUSPECTED;
  if (rank >= 7 && domainEvidence >= 1) return RELIABILITY_TIERS.SUSPECTED;

  return RELIABILITY_TIERS.UNKNOWN;
}

// ── buildStatIntel ─────────────────────────────────────────────────────────
/**
 * Returns the top 4 stats by value desc (tie-break: STAT_KEY_ORDER),
 * each with { key, label, value, reliability }.
 * When isCallout, forces every reliability to CONFIRMED (full intel).
 * Champion opponents use maxLogs=2.
 *
 * @param {object} offer
 * @returns {Array<{ key, label, value, reliability }>}
 */
export function buildStatIntel(offer) {
  const opp = offer.opponent ?? {};
  // Full intel (every stat CONFIRMED) for callouts AND Easy opponents — Easy
  // matchups are treated as fully scouted, so they read as known numbers under
  // the unified "number = Confirmed" display rule.
  const fullIntel = !!offer.isCallout || offer.type === "Easy";
  const isChampion = !!opp.isChampion;
  const maxLogs = isChampion ? 2 : 5;

  // Build all-8-stat entries with value
  const allStats = STAT_KEY_ORDER.map((k) => ({ key: k, value: opp[k] ?? 0 }));

  // Sort desc by value; ties resolved by STAT_KEY_ORDER (already stable)
  const sorted = [...allStats].sort((a, b) => b.value - a.value);

  // Assign 1-based ranks over ALL 8 stats
  const rankMap = {};
  sorted.forEach(({ key }, i) => { rankMap[key] = i + 1; });

  // Fight history classification
  const { domainCounts, totalFights } = analyseFightHistory(opp.fightHistory, maxLogs);

  // Top 4 displayed stats (highest value)
  const top4 = sorted.slice(0, 4);

  return top4.map(({ key, value }) => {
    const reliability = fullIntel
      ? RELIABILITY_TIERS.CONFIRMED
      : classifyStat(key, value, rankMap[key], domainCounts, totalFights);
    return {
      key,
      label: STAT_SHORT_LABEL[key],
      value,
      reliability,
    };
  });
}

// ── buildThreatTags ────────────────────────────────────────────────────────
/**
 * Returns up to 4 threat tags: [{ label, tone }].
 * tone: "red" | "gold" | "green" | "grey"
 *
 * Order: (1) nemesis tag, (2) streak tag, (3) stat-driven tags (fog-gated).
 * Cap at 4 total.
 *
 * @param {object} offer
 * @param {number} fighterOvr  player's overallRating (unused for now, here for future use)
 */
export function buildThreatTags(offer, fighterOvr) {
  const tags = [];
  const opp = offer.opponent ?? {};
  const ctx = offer.context ?? {};
  const isCallout = !!offer.isCallout;

  // (1) Nemesis tag — always first
  if (offer.nemesisMeta) {
    const n = offer.nemesisMeta.lossCount ?? 1;
    tags.push({ label: `Beat you ${n} time${n !== 1 ? "s" : ""}`, tone: "red" });
  }

  // (2) Win streak
  const streak = ctx.streak ?? null;
  if (streak && streak.result === "win" && streak.count >= 4) {
    tags.push({ label: `${streak.count}-fight streak`, tone: "red" });
  }

  if (tags.length >= 4) return tags.slice(0, 4);

  // Build stat intel to get reliabilities for fog check
  const intel = buildStatIntel(offer);
  // Create a reliability map for all displayed stats
  const relMap = {};
  intel.forEach(({ key, reliability }) => { relMap[key] = reliability; });

  // For stat-driven rules we need ALL 8 reliabilities (not just top-4).
  // We need to compute them for all 8 keys.
  const isChampion = !!opp.isChampion;
  const maxLogs = isChampion ? 2 : 5;
  const allStats = STAT_KEY_ORDER.map((k) => ({ key: k, value: opp[k] ?? 0 }));
  const sorted = [...allStats].sort((a, b) => b.value - a.value);
  const rankMap = {};
  sorted.forEach(({ key }, i) => { rankMap[key] = i + 1; });
  const { domainCounts, totalFights } = analyseFightHistory(opp.fightHistory, maxLogs);

  const allRelMap = {};
  STAT_KEY_ORDER.forEach((k) => {
    allRelMap[k] = isCallout
      ? RELIABILITY_TIERS.CONFIRMED
      : classifyStat(k, opp[k] ?? 0, rankMap[k], domainCounts, totalFights);
  });

  const isVisible = (key) => {
    const r = allRelMap[key];
    return r === RELIABILITY_TIERS.CONFIRMED || r === RELIABILITY_TIERS.SUSPECTED;
  };

  const isVisibleBoth = (k1, k2) => isVisible(k1) && isVisible(k2);

  const confirmed = (key) => allRelMap[key] === RELIABILITY_TIERS.CONFIRMED;

  const v = (key) => opp[key] ?? 0;
  const style = opp.style ?? "";

  const statTags = [];

  // ── Strength tags ──
  // Elite [stat] power if primary stat > 80
  if (isVisible("str") && v("str") > 80) {
    statTags.push({ label: THREAT_LABELS.str_elite, tone: confirmed("str") ? "red" : "gold" });
  } else if (isVisible("str") && v("str") >= 65) {
    statTags.push({ label: THREAT_LABELS.str_strong, tone: confirmed("str") ? "red" : "gold" });
  }

  if (isVisible("spd") && v("spd") > 80) {
    statTags.push({ label: THREAT_LABELS.spd_elite, tone: confirmed("spd") ? "red" : "gold" });
  } else if (isVisible("spd") && v("spd") >= 65) {
    statTags.push({ label: THREAT_LABELS.spd_strong, tone: confirmed("spd") ? "red" : "gold" });
  }

  if (isVisible("leg") && v("leg") > 80) {
    statTags.push({ label: THREAT_LABELS.leg_elite, tone: confirmed("leg") ? "red" : "gold" });
  } else if (isVisible("leg") && v("leg") >= 65) {
    statTags.push({ label: THREAT_LABELS.leg_strong, tone: confirmed("leg") ? "red" : "gold" });
  }

  if (isVisible("wre") && v("wre") > 80) {
    statTags.push({ label: THREAT_LABELS.wre_elite, tone: confirmed("wre") ? "red" : "gold" });
  } else if (isVisible("wre") && v("wre") >= 65) {
    statTags.push({ label: THREAT_LABELS.wre_strong, tone: confirmed("wre") ? "red" : "gold" });
  }

  if (isVisible("gnd") && v("gnd") > 80) {
    statTags.push({ label: THREAT_LABELS.gnd_elite, tone: confirmed("gnd") ? "red" : "gold" });
  } else if (isVisible("gnd") && v("gnd") >= 65) {
    statTags.push({ label: THREAT_LABELS.gnd_strong, tone: confirmed("gnd") ? "red" : "gold" });
  }

  if (isVisible("sub") && v("sub") > 75) {
    statTags.push({ label: THREAT_LABELS.sub_elite, tone: confirmed("sub") ? "red" : "gold" });
  } else if (isVisible("sub") && v("sub") >= 65) {
    statTags.push({ label: THREAT_LABELS.sub_strong, tone: confirmed("sub") ? "red" : "gold" });
  }

  // Dangerous striker: avg(STR, SPD) > 70 — both must be visible
  if (isVisibleBoth("str", "spd") && (v("str") + v("spd")) / 2 > 70) {
    statTags.push({ label: "Dangerous striker", tone: (confirmed("str") && confirmed("spd")) ? "red" : "gold" });
  }

  // Heavy clinch: STR > 60 AND style in {Muay Thai, Wrestler}
  if (isVisible("str") && v("str") > 60 && (style === "Muay Thai" || style === "Wrestler")) {
    statTags.push({ label: "Heavy clinch", tone: confirmed("str") ? "red" : "gold" });
  }

  // ── Weakness tags (tone: "green") ──
  if (isVisible("str") && v("str") < 35) {
    statTags.push({ label: THREAT_LABELS.str_weak, tone: "green" });
  }

  if (isVisible("wre") && v("wre") < 35) {
    statTags.push({ label: THREAT_LABELS.wre_weak, tone: "green" });
  }

  if (isVisible("wre") && v("wre") < 30) {
    statTags.push({ label: "Low takedown defence", tone: "green" });
  }

  if (isVisible("spd") && v("spd") < 30) {
    statTags.push({ label: THREAT_LABELS.spd_weak, tone: "green" });
  }

  // Weak ground game: avg(GND, SUB) < 30 — both must be visible
  if (isVisibleBoth("gnd", "sub") && (v("gnd") + v("sub")) / 2 < 30) {
    statTags.push({ label: "Exploitable ground game", tone: "green" });
  }

  // Exploitable chin
  if (isVisible("chn") && v("chn") < 35) {
    statTags.push({ label: THREAT_LABELS.chn_weak, tone: "green" });
  }

  // Append stat tags, cap total at 4
  for (const t of statTags) {
    if (tags.length >= 4) break;
    tags.push(t);
  }

  return tags.slice(0, 4);
}

// ── describeOffer ─────────────────────────────────────────────────────────────
/**
 * @param {object} offer
 * @param {object} fighter  player fighter object (needs overallRating)
 * @returns {{ ovrGap, finishes, lastThree, winStreak, specialType, giantKiller }}
 */
export function describeOffer(offer, fighter) {
  const opp = offer.opponent ?? {};
  const ctx = offer.context ?? {};
  const fightHistory = opp.fightHistory ?? [];

  const ovrGap = (opp.overallRating ?? 0) - (fighter?.overallRating ?? 0);

  // Finishes from fightHistory wins
  const wins = fightHistory.filter((f) => f.result === "win");
  const ko = wins.filter((f) => f.method === "KO/TKO").length;
  const sub = wins.filter((f) => f.method === "Submission").length;
  const finishes = wins.length > 0 ? { ko, sub } : null;

  const lastThree = ctx.lastThree ?? [];
  const streak = ctx.streak ?? null;
  const winStreak = streak && streak.result === "win" ? streak.count : 0;

  let specialType = null;
  if (offer.type === "TitleShot") specialType = "title";
  else if (offer.isCallout) specialType = "callout";
  else if (offer.nemesisMeta) specialType = "nemesis";

  const giantKiller = ovrGap >= 10;

  return { ovrGap, finishes, lastThree, winStreak, specialType, giantKiller };
}

// ── buildCardModel ────────────────────────────────────────────────────────────
/**
 * Orders offers into up to 4 card slots.
 *
 * Variants: easy / even / hard / title / callout / nemesis
 * Rules:
 * - The backend can attach nemesisMeta to ANY standard slot (Easy/Even/Hard).
 *   The slot is re-skinned to the "nemesis" variant in place — no extra card.
 * - Variant resolution per slot: callout > nemesis (when no title) > base difficulty.
 * - When a TitleShot is present the nemesis is NOT promoted (stays its plain
 *   difficulty) so Title can occupy the 4th slot and total stays ≤ 4.
 * - Title is appended as the 4th card when present.
 * - MAX 4 cards; no opponent rendered twice (each offer occupies exactly one slot).
 *
 * @param {Array} offers
 * @returns {Array<{ variant: string, offer: object }>}
 */
export function buildCardModel(offers) {
  if (!offers || offers.length === 0) return [];

  const easyOffer  = offers.find((o) => o.type === "Easy");
  const evenOffer  = offers.find((o) => o.type === "Even");
  const hardOffer  = offers.find((o) => o.type === "Hard");
  const titleOffer = offers.find((o) => o.type === "TitleShot");

  const hasTitle = !!titleOffer;

  /**
   * Resolve the display variant for a standard (Easy/Even/Hard) offer.
   * - isCallout always wins (callout + nemesis at once: callout banner shown,
   *   nemesis record/stakes still rendered by OfferCard because nemesisMeta is present).
   * - nemesisMeta promotes to "nemesis" variant only when no TitleShot exists
   *   (keeping the 4th slot free for the title card).
   */
  function resolveVariant(offer, baseDifficulty) {
    if (!offer) return baseDifficulty;
    if (offer.isCallout) return "callout";
    if (offer.nemesisMeta && !hasTitle) return "nemesis";
    return baseDifficulty;
  }

  const cards = [];

  if (easyOffer) cards.push({ variant: resolveVariant(easyOffer, "easy"), offer: easyOffer });
  if (evenOffer) cards.push({ variant: resolveVariant(evenOffer, "even"), offer: evenOffer });
  if (hardOffer) cards.push({ variant: resolveVariant(hardOffer, "hard"), offer: hardOffer });

  // Title appended as the 4th card
  if (hasTitle) cards.push({ variant: "title", offer: titleOffer });

  // Cap at 4 (defensive — standard payload is 3 + optional title)
  return cards.slice(0, 4);
}
