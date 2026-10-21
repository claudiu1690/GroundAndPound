# Contract: GCS title shot (top-tier belt and defenses)

Bug: a GCS fighter can never get a title shot. `checkPromotion` uses `TIER_LADDER`
(built from `TIER_ORDER.slice(0, -1)`), so GCS never gets `pendingPromotion`, and
the title slot, the dashboard and the frontend all treat `!!pendingPromotion` as
"is a contender". JavaScript throughout. No em dashes in any new code, comment or
copy. Do not touch existing em dashes in unrelated strings.

## Design (approved)

- GCS eligibility: top 5 + 3 wins while top 5 (`TITLE_SHOT_BY_TIER.GCS.titleWins`)
  + `titleShotCooldown` 0. No OVR gate at GCS.
- First GCS title win: +200 fame, GCS Champion badges (legacy "Champion" in
  `fighter.badges` and ledger `champ_gcs`), 1.75x purse (already live via
  `OFFER_PURSE_MULT.TitleShot`), 3 Energy Drinks (the existing promotion grant).
- Repeat GCS title win (title defense): +100 fame, 1.75x purse, no new badge, no drinks.
- GCS title loss: unchanged (cooldown 2, existing loss handling).
- On a GCS win: `topFiveWinsInTier = 0`, `titleShotCooldown = 0`. Do NOT reset
  `ranking`, `winsInCurrentTier` or `pendingPromotion`. No promotion.
- The NPC GCS champion stays rank 1 and `isChampion`. The player's belt is a
  career record (`gcsTitleWins`), shown as a marker on the player's own row in
  the Rankings tab.

## Core decision: a derived contender helper, NOT a "GCS -> GCS" ladder sentinel

`checkPromotion` has one caller (resolve), so a sentinel would only appear after a
fight, needs a backfill, and every promotion reader would misfire (rank reset,
"GCS -> GCS" overlays, drinks on every defense). Instead, in
`services/fightService.js` next to `checkPromotion`:

```js
const TOP_TIER = TIER_ORDER[TIER_ORDER.length - 1]; // "GCS"
/** Contender = waiting on a belt fight in the current tier: a pending promotion, or being in the top tier (GCS defends forever). */
function isTitleContender(fighter) {
    return fighter.promotionTier === TOP_TIER || !!fighter.pendingPromotion;
}
```

Export `TOP_TIER` and `isTitleContender`. `TIER_LADDER` stays
`TIER_ORDER.length - 1` long. `pendingPromotion` keeps its meaning (destination
tier) and is never set to "GCS". No migration: every GCS fighter is a contender at
deploy.

## Model

`models/fighterModel.js`: `gcsTitleWins: { type: Number, default: 0 }` (GCS belt
wins, first win plus defenses; never reset). `pendingPromotion` has no enum; no change.

## Backend changes (by reader)

| # | Where | Change |
|---|---|---|
| B3 | `fightService.pickOfferSlots` title slot (~358-361) | `if (isTitleContender(fighter))` instead of `if (fighter.pendingPromotion)`. The OVR-drop guard (~349-356) stays keyed on `pendingPromotion` (never applies at GCS). |
| B4 | `fightService.hydrateOffers` titleShotMeta (~420) | `{ targetTier: fighter.pendingPromotion ?? null, tier: fighter.promotionTier, titleDefense: fighter.promotionTier === TOP_TIER && (fighter.gcsTitleWins ?? 0) > 0, gcsTitleWins: fighter.gcsTitleWins ?? 0 }` |
| config | `TITLE_SHOT_BY_TIER` (~82-87) | GCS entry gains `defenseFame: 100`: `"GCS": { titleWins: 3, beltFame: 200, defenseFame: 100, beltBadge: "Champion" }` |
| B7 | resolve title win (~1238-1282) | extract pure exported `applyTitleShotWin(fighter, { fightId })` (see below) and call it |
| B8 | resolve drinks (~1284-1291) | `if (promoted \|\| (beltWon && !titleDefense))` grant 3 drinks; keep summary key `drinksGranted.promotion` |
| B9 | badge ctx (~1409-1411) | `beltWonForTier: beltWon ? beltTier : null` (today `promoted.from`, which is null at GCS so `champ_gcs` never fires) |
| B11 | `TITLE_WON` log (~1564-1566) | today dereferences `promoted` and THROWS at GCS after `fighter.save()` (request 500s with state already saved). Lower tiers: text unchanged. GCS first: `Won the GCS ${weightClass} Title`, meta `{ tier: "GCS", weightClass, defense: false, gcsTitleWins: 1, drinksGranted, fightId }`. GCS repeat: `Defended the GCS ${weightClass} Title (x${n})` with n = gcsTitleWins - 1 (number of defenses), meta `defense: true`. Never dereference `promoted` inside `if (beltWon)`. |
| B12 | `TITLE_SHOT_ELIGIBLE` (~1569-1576) | `isTitleContender(fighter)` instead of `fighter.pendingPromotion` |
| B13 | `newBadges` (~1578-1581) | today `getTitleShotConfig(promoted.from)` THROWS at GCS. Use `if (beltWon && !titleDefense) { const wonBadge = getTitleShotConfig(beltTier).beltBadge; ... }` |
| B14 | resolve summary (~1655-1661) | add `titleDefense` (boolean), `beltTier` (string or null; the tier whose belt was fought for, null when not a title win), `gcsTitleWins` (number after increment; 0 outside GCS). `promoted` is null on a GCS win; `beltWon` true. |
| B15 | `awardCtx.titleFightWin / titleDefenceWin` (~1085-1102) | LEAVE FALSE. Setting `titleDefenceWin` would make `notorietyService` add a flat +300 TITLE_DEF on top of the +100. Add a comment saying so. |
| B16 | `offerBoardService.boardFingerprint` (~107-113) | the pendingPromotion segment becomes the contender token: `const pending = fightService.isTitleContender(f) ? (f.pendingPromotion ?? fightService.TOP_TIER) : "-"`. One-time board regeneration for each GCS fighter on first read, stable afterwards. `gcsTitleWins` must NOT be in the fingerprint. |
| B17 | `dashboardService.buildRanking` (`ovrMet: !!fighter.pendingPromotion`) | `ovrMet: fightService.isTitleContender(fighter)` |
| B18 | `dashboardService.buildTitleShotProgress` | mode: `tier === TOP_TIER` -> "title"; else ladder entry -> NO_CHAMPION ? "autoPromote" : "title"; else "none" (now means unknown tier only). GCS gives mode "title", ovrMet true, ovrTarget null. Add `gcsTitleWins: fighter.gcsTitleWins ?? 0` to `ranking.titleShot`. Update the JSDoc section 6 and `tests/services/dashboardService.titleShot.test.js` (GCS mode "none" becomes "title"; key list gains gcsTitleWins; assert ovrMet true with pendingPromotion null at GCS). |
| B19 | `dashboardService.buildNudge` | `const contender = fightService.isTitleContender(fighter); const isGcs = fighter.promotionTier === fightService.TOP_TIER; const isPro = fighter.pendingPromotion === "Regional Pro";` Ready branch at GCS: "Your GCS title shot is ready. Go take the belt." Grinding branch at GCS: when gcsTitleWins > 0 `GCS Champion. Bank ${need} more top-5 ${win|wins} for your next title fight.`, else `Win ${need} more ${fight|fights} to earn your GCS title shot.` Cooldown branch unchanged. Keep the unranked branch and top-5 cutoff wording added by the strip follow-up. |
| B20 | `dashboardService.computeHeroAction` (~334-342) | when the unlocked title offer has `titleShotMeta.titleDefense`: `{ label: "Defend the Belt", sublabel: "Your GCS title defense is on the table. Take it." }`; confirm the hero receives raw board offers with titleShotMeta. |
| B21 | `fighterService.toPublicFighter` (owner payload) | `out.titleContender = require("./fightService").isTitleContender(fighter);` (lazy require, avoids the cycle). `gcsTitleWins` ships via toObject. Do NOT add either to `toPublicProjection`. |
| B22 | `controllers/rankingController.getRankings` | add `gcsTitleWins` to the player `.select(...)` and `titleWins: fighter.gcsTitleWins ?? 0` to `playerRow` |

### applyTitleShotWin(fighter, { fightId } = {})

Pure in-memory mutation, no save, no stateful imports. Returns
`{ promoted, beltTier, titleDefense, fameAwarded, badgeAwarded }`.

- `beltTier = fighter.promotionTier`; `cfg = getTitleShotConfig(beltTier)`.
- If `beltTier === TOP_TIER`: `gcsTitleWins += 1`; `titleDefense = gcsTitleWins > 1`;
  `topFiveWinsInTier = 0`; `titleShotCooldown = 0`; fame = titleDefense ?
  `cfg.defenseFame` : `cfg.beltFame` via `applyNotorietyDelta(fighter, fame, { skipFreezeBlock: true, code: "BELT_WON", reason: titleDefense ? "Defended the GCS belt" : "Won the GCS belt", meta: { fightId, tier: "GCS", defense: titleDefense } })`
  (match how the lower-tier branch applies belt fame today); badge pushed only when
  `!titleDefense` (and only if absent); `promoted = null`.
- Else: exactly today's lower-tier behaviour (promote to pendingPromotion, zero
  both win counters, resetRankingForNewTier, `promoted = { from, to, viaTitleShot: true }`,
  beltFame, badge push), `titleDefense = false`.

## API changes (fields only, no new endpoints, errors unchanged)

- `GET /fighters/:id` (owner): `+ titleContender: boolean`, `+ gcsTitleWins: number`.
- Offer board (GET offers, reroll, dashboard list via board): TitleShot `titleShotMeta: { targetTier: string|null, tier: string, titleDefense: boolean, gcsTitleWins: number }`.
- Resolve: `summary + { titleDefense, beltTier, gcsTitleWins }`; `promoted` null on a GCS win.
- Dashboard: `ranking.titleShot.mode` "title" at GCS, `ovrMet` true, `ovrTarget` null, `+ gcsTitleWins`.
- Rankings `GET /rankings/:tier?weightClass&fighterId`: `player + { titleWins: number }`.

## Frontend changes (`frontend/src`)

| # | File | Change |
|---|---|---|
| F1 | `App.jsx` TierProgress (~247-255, ~301-315) | `const pending = fighter.titleContender; const wins = fighter.topFiveWinsInTier ?? 0;` (today uses winsInCurrentTier: a bug). Replace the `!pending && !next` "GCS Champion, top tier reached" line with: when `fighter.gcsTitleWins > 0` show `layout.tierProgress.gcsBeltHolder` "GCS Champion (x{n})". |
| F2 | `App.jsx` ContenderModal trigger (~719-759) | `const target = fighter.titleContender ? (fighter.pendingPromotion ?? fighter.promotionTier) : null;` storage key per (fighterId, target), so GCS fires once; add `fighter?.titleContender` to deps. |
| F3 | `App.jsx` belt overlay queue (~1228-1235) | `if (summary.beltWon) queue.push({ type: "belt", from: summary.beltTier, to: summary.promoted?.to ?? null, titleDefense: summary.titleDefense, gcsTitleWins: summary.gcsTitleWins, weightClass })`. Pass the new props to BeltWonOverlay. Never a Tier Up for a GCS win. |
| F4 | `components/fights/TierUpOverlay.jsx` BeltWonOverlay | props `titleDefense`, `gcsTitleWins`; omit the from/to row when `toTier` is null; title "TITLE DEFENDED" when titleDefense; GCS hint "You hold the GCS belt. Bank 3 top-5 wins for your next title fight." |
| F5 | `components/fights/FightSummary.jsx` | header "TITLE DEFENDED" on defense; notices "GCS Champion. +200 fame, GCS Champion badge." / "Title defended (x{n}). +100 fame." when `beltWon && beltTier === "GCS"`; drinks label "Championship reward: +{label}" when `beltWon && !promoted`. |
| F6 | `components/fights/OfferCard.jsx` (~154-167, ~293-307) | remove the `targetTier ?? "National"` fallback; branch on `offer.titleShotMeta?.tier === "GCS"`: header "GCS Title Fight"; sub "Win: +200 fame, GCS Champion badge, 1.75x purse" or on defense "Title defense: +100 fame, 1.75x purse"; no "Promote to" stake; fame stake +200 / +100. A missing titleShotMeta keeps the lower-tier layout. |
| F7 | `components/fights/FightOffers.jsx` (~298-306) | `if (!fighter.titleContender) return false; const wins = fighter.topFiveWinsInTier ?? 0;` (today winsInCurrentTier: a bug) |
| F8 | `components/fights/ContenderChecklist.jsx` | gate on `fighter.titleContender`; at GCS header "Path to the GCS belt", rating row "GCS fighter" (met), footers "Your GCS title shot is ready. It's on your fight board." / "Win {n} more in the top 5 to unlock your GCS title fight." Also: if it computes top 5 as `rank <= 5` on a display rank, use the dashboard/server top-5 flag or cutoff instead (QA found display #5 is not top 5). |
| F9 | `components/fights/ContenderModal.jsx` | GCS: heading "You are a GCS title contender.", body "{champ} holds the GCS belt. Beat them and it is yours. Win it again to defend it.", closer "When both are met, a GCS Title Fight card appears on your fight board." |
| F10 | `components/rankings/RankingsTab.jsx` | small trophy icon after the YOU badge when the player row has `titleWins > 0`, title attr "GCS Champion (x{n})". |
| F11 | `components/dashboard/homeModel.js` titleShotStep + `TitleShotStrip.jsx` + `tiles/RankingsTile.jsx` | titleShotStep also returns `gcs: ranking.division === "GCS"` and `champion: (ts.gcsTitleWins ?? 0) > 0`; order unchanged. Strip label "GCS title shot" at GCS; ready "Your GCS title shot is ready. Go take the belt."; winTop5 with champion "GCS Champion. Bank {n} top-5 wins for your next title fight." (singular variant for 1). RankingsTile OVR condition reads "GCS fighter" at GCS. |
| i18n | `locales/en.json` | every new string under its existing namespace; no em dashes. |

## Tests

Backend (node:test, stubbed statics):
- `tests/services/fightService.titleContender.test.js`: isTitleContender true for GCS with pendingPromotion null and for Regional Pro pending National; false for National null and GCS Contender null; checkPromotion at GCS returns null and leaves pendingPromotion null; TIER_LADDER length is TIER_ORDER.length - 1.
- extend `tests/services/fightService.offerSlots.test.js`: GCS fighter with pendingPromotion null gets the TitleShot slot (stub championService.getChampion); hydrateOffers titleShotMeta at GCS (titleDefense false at 0 wins, true at gcsTitleWins 2); lower tier unchanged.
- `tests/services/fightService.applyTitleShotWin.test.js`: GCS first win (tier, ranking, winsInCurrentTier untouched; topFiveWinsInTier 0; cooldown 0; gcsTitleWins 1; fame 200; badge once; promoted null; titleDefense false); second win (gcsTitleWins 2; fame 100; titleDefense true; no new badge; badgeAwarded null); lower tier regression (promoted, ranking reset, counters 0, pending null).
- extend `tests/services/offerBoardService.test.js`: GCS fingerprint has the GCS token, is stable across reads, unaffected by gcsTitleWins.
- adjust/extend `tests/services/dashboardService.titleShot.test.js` and `tests/services/titleShotConfig.nudge.test.js` (GCS copy; defenseFame 100); extend `tests/services/dashboardService.titleShotStepGates.test.js` if it sweeps tiers.
- extend `tests/services/badgeService.test.js`: beltWonForTier "GCS" awards champ_gcs once.

Frontend (`tests/frontend/homeModel.test.js`): GCS ready gives `{ key: "ready", gcs: true }`; GCS champion grinding gives `{ key: "winTop5", champion: true }`; mode "none" still hidden.

## Docs (after QA)

- GDD: section 5.1 (~144) GCS belt rules; blockquote ~146-147 and section 20.2 (~1312): GCS Champion badge is earned only by winning the GCS title, not tier-derived; section 8 (~933-940) GCS exception list.
- `docs/offer-board-contract.md`: fingerprint segment is now the contender token; titleShotMeta shape.
- Library: `champions-and-title-shots`, `promotion-tiers`, `rankings` articles.
- Changelog: folded into the unreleased `2.2` entry (2026-10-21: every change not yet in production ships as 2.2).

## Risks

- A request 500 after state is saved if any `promoted.*` dereference survives in the beltWon path.
- Fame stacking if `awardCtx.titleDefenceWin` is set.
- One-time offer board regeneration for every GCS fighter (bounded, intended).
- Each GCS weight class must have an NPC champion (staging verified 2026-10-20: one champion per division).
