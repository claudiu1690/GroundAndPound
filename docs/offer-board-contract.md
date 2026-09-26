# Contract: Persisted Fight Offer Board + Home "Athlete Page"

Source of truth for the offer-board backend and the Home tab rebuild (variant C of
`mockups/home-ufc-redesigns.html`). Backend lives at the repo root (services/, routes/,
controllers/, models/, consts/, tests/). Frontend is the Vite React SPA in `frontend/src`.
The codebase is JavaScript. No em dashes in any code, comment or string.

## Assumptions and decisions

1. **Invalidation uses a fingerprint, not an invalidate helper.** The fields that drive offers are only written in three places: `fightService.resolveFightAndApply`, `calloutService.createCallout/cancelCallout`, and generation itself (stale-nemesis and `pendingPromotion` cleanup). `fighter.lastFightDate` is stamped in exactly one place (`fightService.js` ~line 1077, PvE resolve only), so it is the "fight resolved" signal. With the fingerprint, no mutating service needs a code change.
2. **Callout is a live overlay, not a stored slot.** It is left out of the fingerprint on purpose. If callouts regenerated the board, the player would get unlimited free rerolls: `createCallout` spends fame, `cancelCallout` refunds it in full, and each call would produce a new board. Instead, `calloutService.injectIntoOffers` runs at every read on top of the stored picks. Setting a callout swaps it into the Hard slot right away. Cancelling brings the original Hard pick back.
3. **Title-shot lock state is derived live at read time.** `titleShotCooldown` and `topFiveWinsInTier` are therefore not in the fingerprint. They only change inside resolve anyway, which bumps `lastFightDate`. `pendingPromotion` is in the fingerprint because it decides whether a TitleShot slot exists.
4. **Blocking injury.** A read that finds a blocking injury (and no accepted fight) returns an empty list and clears any stored board with a compare-and-set. Once the injury clears, the next read generates a fresh board. Nothing is persisted while blocked.
5. **Client `offerType` is accepted and ignored.** It is not validated against the board. This keeps old clients and the e2e helper working during deploy skew. The type always comes from the board.
6. **Reroll avoids the previous picks.** It passes the old Easy/Even/Hard ids as a soft exclusion so the player does not pay 20% of a purse to get the same three back. Thin divisions can still backfill with them.
7. **Stored slots hold only `{offerType, opponentId}`.** Everything else (context, nemesis meta, champion boost, display rank, beef/respect, title lock) is hydrated live. The slot key is `offerType`, not `type`, to avoid the Mongoose `type` key gotcha.
8. **Home portrait: initials monogram, no BannerPreview.** The monogram sits on the fighter's banner background (`PIECES_BY_ID[fighter.banner.backgroundId].css`). Opponents use the mockup's CSS silhouette (`.ap-sil`).
9. **Stats tile shows all 8 stats.** Bar width is the stat value (0 to 100). The XP line goes in the tooltip.
10. **Next-fight third metric: the opponent's streak** (`W3` / `L2` / `-`). The mockup's "+N rank pts" is dropped.
11. **Last fight comes from a new `lastFight` dashboard block.** One indexed ActivityLog query.
12. **Purse & fame is one merged tile** (MoneyFameTile + SponsorTile). The Proving Ground summary becomes lines in the Last fight tile. CareerFeedTile and GazetteTile are deleted: the Last fight tile covers the latest feed item and a Gazette line that opens GazetteModal.
13. **Callout row on Home opens CalloutModal in place.**
14. API helpers live in `frontend/src/api.js`.

---

## 1. Data model: `models/fighterModel.js`

Add at top level, next to `activeCallout`:

```js
offerBoard: {
    type: new mongoose.Schema({
        slots: {
            type: [new mongoose.Schema({
                offerType:  { type: String, enum: ["Easy", "Even", "Hard", "TitleShot"], required: true },
                opponentId: { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", required: true },
            }, { _id: false })],
            default: [],
        },
        generatedAt:   { type: Date, required: true },
        expiresAt:     { type: Date, required: true },   // generatedAt + OFFER_BOARD_TTL_HOURS
        rerollUsed:    { type: Boolean, default: false },
        promotionTier: { type: String, required: true }, // informational; liveness uses fingerprint
        weightClass:   { type: String, required: true }, // informational
        fingerprint:   { type: String, required: true },
    }, { _id: false }),
    default: null,
},
```

- Slot order: Easy, Even, Hard (ascending OVR, as generated), then TitleShot when present. The callout is never stored.
- Indexes: none. Migration: none (legacy docs read `null`, first read generates).
- New file `consts/offerBoardConfig.js`: `module.exports = { OFFER_BOARD_TTL_HOURS: 24, OFFER_REROLL_COST_FRAC: 0.2 };`
- No Redis, no BullMQ. Expiry is checked lazily on read.
- Writes only through `Fighter.updateOne` with a compare-and-set filter and `{ runValidators: true }`. Never `fighter.save()` on a doc with a modified `offerBoard`.

---

## 2. Board service: `services/offerBoardService.js` (new)

`fightService` keeps the matchmaking rules. `offerBoardService` owns the board lifecycle: persistence, liveness, reroll and slot resolution.

Dependencies: top-level requires `Fighter`, `fightService`, `analyticsService`, `offerBoardConfig`, `PROMOTION_TIERS`, `isFightBlocked` from `utils/injuryUtils`. `fightService` requires `offerBoardService` lazily inside `createOffer` and `acceptOffer` (existing lazy-require pattern), so no load-time cycle.

### Fingerprint and liveness

```js
function boardFingerprint(fighter) // -> string
// `${promotionTier}|${weightClass}|${nemesis?.opponentId ?? "-"}|${pendingPromotion ?? "-"}|${lastFightDate ? lastFightDate.getTime() : 0}`
```

Plain joined string, not a hash. Compute it AFTER `pickOfferSlots` runs, because generation can clear a stale nemesis or `pendingPromotion`.

```js
function isBoardLive(board, fighter, now = new Date()) // -> boolean
// board != null && board.slots.length > 0 && now < board.expiresAt && board.fingerprint === boardFingerprint(fighter)
```

### Exports

| Function | Signature | Behaviour |
|---|---|---|
| `getBoard` | `(fighterId) => Promise<{ offers: BoardOffer[], meta: OfferBoardMeta }>` | Algorithm below. Throws `"Fighter not found"`. |
| `rerollBoard` | `(fighterId, userId) => Promise<{ offers, meta, cashAfter }>` | Algorithm below. |
| `resolveBoardOffer` | `(fighterDoc, opponentId) => Promise<BoardOffer>` | Checks in order: `acceptedFightId` set -> `FIGHT_ALREADY_BOOKED`. Blocked -> `FIGHT_BLOCKED_INJURY`. Board not live -> `OFFER_NOT_ON_BOARD` (never generates). Hydrate; missing opponent -> `OFFER_NOT_ON_BOARD`. Find the offer whose `opponent._id` equals `opponentId` (includes the callout overlay) or -> `OFFER_NOT_ON_BOARD`. TitleShot with `locked` -> `TITLE_SHOT_LOCKED`. |
| `boardFingerprint`, `isBoardLive` | pure | exported for tests |
| `rerollCostFor` | `(tier) => number|null` | `Math.round(PROMOTION_TIERS[tier].signingFee * 0.2)`. Amateur 100, Regional Pro 150, National 440, GCS Contender 1200, GCS 2400. |
| `emptyBoardMeta` | `(tier) => OfferBoardMeta` | `{generatedAt:null, expiresAt:null, rerollUsed:false, rerollCost:rerollCostFor(tier), canReroll:false, rerollBlockedBy:"no_board", frozen:false, blockedReason:null, blockedCode:null}` |

### `getBoard` algorithm

1. `fighter = Fighter.findById(id)` (hydrated doc).
2. Frozen (`fighter.acceptedFightId`): no generation and no clearing. If a board exists, hydrate it and set `acceptable:false` on every offer (even if expired or stale). Otherwise `offers:[]`. `meta.frozen = true`. `blockedReason` filled if an injury blocks.
3. Blocked (`isFightBlocked`): if a board exists, `Fighter.updateOne({_id, "offerBoard.generatedAt": board.generatedAt}, {$set:{offerBoard:null}})`. Return `offers:[]`, `blockedCode:"INJURY"`, `blockedReason: fightService.fightBlockedMessage(injury)`.
4. Live (`isBoardLive` true): `hydrateOffers(fighter, slots)`. If `missing`, fall through to 5.
5. Generate: `slots = await fightService.pickOfferSlots(fighter)`. If empty: do not persist; return `offers:[]`, `blockedCode:"POOL_EMPTY"`, `blockedReason:"No opponents are available in your division right now. Check back soon."`. Otherwise `board = {slots, generatedAt:now, expiresAt:now+24h, rerollUsed:false, promotionTier, weightClass, fingerprint: boardFingerprint(fighter)}`. Compare-and-set: `Fighter.updateOne({_id, acceptedFightId:null, "offerBoard.generatedAt": seenGeneratedAt ?? null}, {$set:{offerBoard:board}}, {runValidators:true})`. If `modifiedCount === 0`, reload the fighter and return its board if live, else return the local board unpersisted. Hydrate.
6. `acceptable = !frozen && !(type === "TitleShot" && locked)` on each offer.

### `rerollBoard` algorithm

1. Load the fighter.
2. Guards in order: `acceptedFightId` -> `OFFER_BOARD_FROZEN`; blocked -> `FIGHT_BLOCKED_INJURY`; board not live -> `OFFER_BOARD_STALE`; `rerollUsed` -> `REROLL_USED`; `iron < cost` -> `NOT_ENOUGH_CASH`.
3. `slots = pickOfferSlots(fighter, { avoidOpponentIds: previous Easy/Even/Hard ids except the nemesis id })`. Empty -> `OFFER_POOL_EMPTY` (no charge).
4. Atomic charge and swap in one write:
   ```js
   Fighter.updateOne(
     { _id, acceptedFightId: null, iron: { $gte: cost },
       "offerBoard.generatedAt": prev.generatedAt, "offerBoard.rerollUsed": false },
     { $inc: { iron: -cost },
       $set: { offerBoard: { ...newBoard, rerollUsed: true, generatedAt: now, expiresAt: now + 24h,
                             fingerprint: boardFingerprint(fighter) } } },
     { runValidators: true })
   ```
   If `modifiedCount === 0`, re-read and map to `REROLL_USED` / `NOT_ENOUGH_CASH` / `OFFER_BOARD_FROZEN` / `OFFER_BOARD_STALE`.
5. `analyticsService.track(userId, "offers_rerolled", { tier, cost }, { fighterId })` fire-and-forget. No activity-feed entry.
6. Return hydrated board plus `cashAfter`.

Money is only moved by the single conditional write, after generation has succeeded (`saveWithVersionRetry` is not a mutex).

### Errors

Built with `boardError(code, message, status)`, same shape as `campError` in `homeCampCoachService.js`.

| code | status | message (exact) |
|---|---|---|
| `OFFER_NOT_ON_BOARD` | 409 | `That bout is no longer on your board.` |
| `FIGHT_ALREADY_BOOKED` | 409 | `You already have a fight booked.` |
| `TITLE_SHOT_LOCKED` | 400 | `Your title shot is still locked.` |
| `FIGHT_BLOCKED_INJURY` | 400 | `fightBlockedMessage(injury)` (existing text) |
| `OFFER_BOARD_FROZEN` | 409 | `You can't reroll while a fight is booked.` |
| `REROLL_USED` | 409 | `You've already rerolled this set.` |
| `OFFER_BOARD_STALE` | 409 | `Your offers changed. Load the new set first.` |
| `NOT_ENOUGH_CASH` | 400 | `Not enough cash (a reroll costs $${cost})` |
| `OFFER_POOL_EMPTY` | 409 | `No other opponents are available right now.` |

### Typedefs (single source of truth: JSDoc at the top of `offerBoardService.js`)

- `OfferBoardMeta`:
  ```
  { generatedAt: ISO|null, expiresAt: ISO|null, rerollUsed: boolean, rerollCost: number|null,
    canReroll: boolean,
    rerollBlockedBy: "frozen"|"blocked"|"no_board"|"used"|"cash"|null,   // first match in this order
    frozen: boolean, blockedReason: string|null, blockedCode: "INJURY"|"POOL_EMPTY"|null }
  ```
  `canReroll === (rerollBlockedBy === null)`. Cash check uses `fighter.iron` at read time.
- `BoardOffer`: exactly the element shape `generateOffers` returns today, plus `acceptable: boolean`:
  ```
  { type, opponent (full lean Opponent + displayRank), context:{record,streak,lastThree},
    nemesisMeta?, isCallout?, calloutMeta?, titleShotMeta?, locked?, cooldownRemaining?,
    winsNeeded?, rankNeeded?, currentRank?, beefMatch?, respectMatch?, acceptable }
  ```

---

## 3. API contract

`ownFighterParam("fighterId")` is added to all four routes below (403 with existing messages).
Error body everywhere: `{ message: string, code?: string }`. 500 always `{ message: "Internal server error" }`, logged server-side.

### GET `/fights/offers/:fighterId`
- 200 `{ offers: BoardOffer[], board: OfferBoardMeta }`
- 404 `{message:"Fighter not found"}`
- Behaviour change: blocked or empty used to be 400/500, now 200 with `offers:[]` and `board.blockedReason`. Top level changes from array to object.

### POST `/fights/offers/:fighterId` (create offer)
- Request `{ opponentId: string (ObjectId, required), offerType?: any (ignored) }`.
- 201 the Fight document, `offerType` from the board slot.
- 400 `OFFER_INVALID_INPUT` ("opponentId is required") when missing / not a string / not a valid ObjectId; `FIGHT_BLOCKED_INJURY`; `TITLE_SHOT_LOCKED`.
- 404 `Fighter not found`. 409 `OFFER_NOT_ON_BOARD`, `FIGHT_ALREADY_BOOKED`.
- Old "Opponent not found", "Weight class mismatch", "Promotion tier mismatch" errors are removed.

### POST `/fights/accept/:fighterId/:fightId`
- 200 the Fight.
- 400 `FIGHT_NOT_ENOUGH_ENERGY` (existing), `FIGHT_BLOCKED_INJURY`, `TITLE_SHOT_LOCKED`.
- 404 `Fight not found or not available` (also for invalid ObjectId, was a 500), `Fighter not found`.
- 409 `OFFER_NOT_ON_BOARD` (slot left the board, or slot type differs from `fight.offerType`), `FIGHT_ALREADY_BOOKED`.

### POST `/fights/offers/:fighterId/reroll` (new)
- 200 `{ offers, board, cashAfter }`
- 400 `NOT_ENOUGH_CASH`, `FIGHT_BLOCKED_INJURY`. 404 `Fighter not found`. 409 `OFFER_BOARD_FROZEN`, `REROLL_USED`, `OFFER_BOARD_STALE`, `OFFER_POOL_EMPTY`.

### GET `/fighters/:id/dashboard`: changed blocks only (every existing field keeps its shape)

```
offers: {
  count: number,               // offers with acceptable === true
  best: {offerType, opponentName, opponentOvr, isTitleShot, purse} | null,   // among acceptable only
  list: Array<OfferCard>,      // every board slot incl. locked TitleShot and frozen slots; max 4; board order
  generatedAt, expiresAt, rerollUsed, rerollCost, canReroll, rerollBlockedBy,
  frozen, blockedReason, blockedCode        // = OfferBoardMeta spread
}
```

`OfferCard`: all 14 existing keys, plus
```
acceptable: boolean
isCallout: boolean
nemesisLossCount: number|null              // offer.nemesisMeta?.lossCount
opponentRank: number|null                  // rankingService.toDisplayRank(opponent.displayRank ?? null); null for champion/unranked
titleLock: {cooldownRemaining, winsNeeded, rankNeeded} | null   // only on a locked TitleShot
```
`opponentId` is now the accept handle for the lifetime of the board.

`heroBout`: existing keys, plus
```
opponentStyle: string|null, opponentRank: number|null, streak: {result,count}|null,
offerType: "Easy"|"Even"|"Hard"|"TitleShot"|null, isCallout: boolean, nemesisLossCount: number|null
```
Accepted branch: from `fight.offerType`, `fight.isCallout`; `streak` from `buildOfferContext(opp)`; `opponentRank = toDisplayRank(displayRankForNpc(opp.fixedRank, rawFighter.ranking.rank))`. Offer branch: `pickBestOffer` over acceptable offers only.

`lastFight` (new top-level key, nullable):
```
lastFight: { result:"win"|"loss"|"draw", opponentName, outcome, isTitleFight, fightId, at: ISO } | null
```
Source: `ActivityLog.findOne({fighterId, type:{$in:["FIGHT_WIN","FIGHT_LOSS","FIGHT_DRAW"]}}).sort({createdAt:-1}).lean()`. Values from `meta.opponentName`, `meta.outcome`, `meta.isTitleFight`, `meta.fightId`, `createdAt`. Degrades to `null`.

Degrade: if `getBoard` throws, the offers block is `summariseOffers([], tier, emptyBoardMeta(tier))`, never a literal.

---

## 4. Backend files

| File | Change |
|---|---|
| `models/fighterModel.js` | Add `offerBoard` (section 1). |
| `consts/offerBoardConfig.js` | New. |
| `services/fightService.js` | Split `generateOffers` into two exported functions and delete `generateOffers`. **`pickOfferSlots(fighter, { avoidOpponentIds = [] } = {}) => Promise<Array<{offerType, opponentId}>>`**: current generation logic minus decoration. Keeps the stale-nemesis `fighter.save()` and the `pendingPromotion` OVR-drop `fighter.save()`. `avoidOpponentIds` goes into `$nin` on the three window `$sample` queries only; backfill keeps its current `exclude`. Adds `{offerType:"TitleShot", opponentId: champion._id}` when `pendingPromotion` is set and a champion exists. No callout injection and no injury check (caller checks). **`hydrateOffers(fighter, slots) => Promise<{ offers, missing }>`**: one `Opponent.find({_id:{$in}}).lean()` re-mapped to slot order; missing opponent -> `missing:true`. Nemesis meta live (matches `fighter.nemesis.opponentId`). Then `calloutService.injectIntoOffers` (difficulty slots only, BEFORE the title is appended), then the title slot (OVR x1.05, live `locked/cooldownRemaining/winsNeeded/rankNeeded/currentRank` from new helper `titleShotEligibility(fighter)`), then `context = buildOfferContext(opponent)` recomputed for EVERY offer after the overlay, then `displayRank` and beef/respect as today. Exports added: `pickOfferSlots`, `hydrateOffers`, `buildOfferContext`, `fightBlockedMessage`, `titleShotEligibility`. **`createOffer(fighterId, opponentId)`** (third param removed): load fighter -> `offerBoardService.resolveBoardOffer` -> `isCallout` as today -> Fight with `offerType: offer.type`. **`acceptOffer`**: load fighter -> load Fight -> `resolveBoardOffer(fighter, fight.opponentId)` which must match `fight.offerType` else `OFFER_NOT_ON_BOARD` -> atomic claim `Fighter.updateOne({_id, acceptedFightId:null}, {$set:{acceptedFightId: fight._id, trainingCampActions:0}})`, 0 modified -> `FIGHT_ALREADY_BOOKED` -> `deductEnergy`; on throw, `updateOne({_id, acceptedFightId: fight._id}, {$set:{acceptedFightId:null}})` and rethrow -> status, `createCamp`, analytics unchanged. **`resolveFightAndApply`**: no logic change; add a one-line comment where `lastFightDate` is stamped that the offer-board fingerprint depends on it. |
| `services/offerBoardService.js` | New (section 2). |
| `services/calloutService.js` | Comment only: `injectIntoOffers` is used by `fightService.hydrateOffers`; its copied `context` is overwritten by hydrate. |
| `services/dashboardService.js` | `buildOffers(id, tier)` calls `offerBoardService.getBoard(id)` and returns `{ offers, meta, summary: summariseOffers(offers, tier, meta) }`. `countedOffers` becomes `o && o.acceptable`. `offerListItem` gains the 5 fields. `summariseOffers(offers, tier, meta)` spreads `meta`. `buildHeroBout(fighter, offersData, rawFighter)` gains the new fields. `computeHeroAction` receives `offers.filter(o => o.acceptable)`. New `buildLastFight(id)` joins the `Promise.all`. Delete `recordFromHistory` (use `fightService.buildOfferContext(opp).record`). JSDoc header: document the offers block as `{count, best, list, ...OfferBoardMeta}` pointing to offerBoardService; list the new OfferCard, heroBout and `lastFight` fields; replace the "opponentId IS NOT A DURABLE HANDLE" warning with the accept-handle rule; replace "No new writes" with "reads may persist a newly generated board (one conditional updateOne on a miss) or clear it on a blocked read; both inside offerBoardService"; update COST (board hit = 1 Fighter PK read + 1 Opponent `$in` + callout findById + champion findOne; generation only on a miss; + 1 ActivityLog findOne); update DEAD FIELDS (Home no longer renders BannerPreview). |
| `services/fighterService.js` | `toPublicFighter`: `delete out.offerBoard;`. |
| `controllers/fightController.js` | Add codes to `FIGHT_ERROR_CODES`: `OFFER_INVALID_INPUT`, `OFFER_NOT_ON_BOARD`, `FIGHT_ALREADY_BOOKED`, `TITLE_SHOT_LOCKED`, `FIGHT_BLOCKED_INJURY`, `OFFER_BOARD_FROZEN`, `REROLL_USED`, `OFFER_BOARD_STALE`, `NOT_ENOUGH_CASH`, `OFFER_POOL_EMPTY`. Shared mapper: `err.code && err.status` -> `res.status(err.status).json({message, code})`. `getOffers` -> `{offers, board: meta}`. `createOffer` validates `opponentId` and drops `offerType`. `acceptOffer` validates `fightId` with `mongoose.isValidObjectId` -> 404. New `rerollOffers(req,res)` -> `offerBoardService.rerollBoard(req.params.fighterId, req.user.id)`. Remove the dead `"Cannot fight:"` mapping from `getOffers`. |
| `routes/fightRoutes.js` | Add `ownFighterParam("fighterId")` on GET/POST `/offers/:fighterId` and POST `/accept/:fighterId/:fightId`. Add `router.post("/offers/:fighterId/reroll", ownFighterParam("fighterId"), fightController.rerollOffers)`. Update swagger blocks. |

---

## 5. Frontend

### Files

Add: `components/dashboard/AthleteHero.jsx`, `NextFightCard.jsx`, `BookingsList.jsx`, `tiles/FighterStatsTile.jsx`, `tiles/ConditionTile.jsx`, `tiles/LastFightTile.jsx`, `tiles/PurseFameTile.jsx`, `hooks/useOfferBoard.js`, `hooks/useAcceptOffer.js`.

Delete: FightNightHero, UndercardRow, HomeGrid, PvpSeasonCountdown, and in `tiles/`: IdentityTile, VitalsTile, InjuryTile, FightCampTile, MyCampTile, StatsTile, MoneyFameTile, SponsorTile, ProvingGroundTile, CareerFeedTile, GazetteTile.

Keep and restyle: TitleShotStrip (`hn-*` -> `ap-*`); RankingsTile (drop `span`, restyle, content unchanged); HomeTile (`ap-tile`, drop `span`, keep `index`); `homeModel.js`: remove `heroCopy`, `rivalFighter`, `splitName`, `RIVAL_BANNER`, `gazetteResultPill`, `defenseTitle` and the `@/lib/i18n` import (file becomes node-testable). Keep `formatEta`, `feedDate`, `relativeTime`, `titleShotProgress`, `formatPurse`. Add the helpers below.

### New helpers in `homeModel.js` (pure, return keys and params, no strings)

- `formatTimeLeft(iso, now = Date.now())`: `"18h"` or `"45m"`, or `null` if past/invalid.
- `fighterStreak(fighter)`: `{key:"win"|"loss"|"none", n}` from `winStreak` / `consecutiveLosses`.
- `oppStreak(streak)`: same shape from `{result,count}`.
- `vitalsModel(fighter)`: `{energy:{cur,max,pct,eta,low}, health:{value,pct,eta,state}}` (moves VitalsTile logic out of the component).
- `rerollButtonState(offers)`: `{visible, disabled, reasonKey: "used"|"cash"|null, cost}`. Hidden for `frozen`, `blocked`, `no_board`.
- `titleLockKey(titleLock)`: `{key:"lockedCooldown"|"lockedRank"|"lockedWins"|"lockedDefault", n}`.
- `bookingRowFlags(item, heroBout)`: `{isMain, isSigned}`. `isMain` when this is the offer-branch hero bout. `isSigned` when `heroBout.source==="accepted"` and opponent ids match.

### Component tree and props

```
DashboardTab {fighter, onNavigate, onOpenCareerProfile, refreshKey, gymsRetired, onAcceptOffer, onRefreshFighter, onMessage}
  owns: useDashboard, useOfferReroll, useAcceptOffer, gazetteOpen, calloutOpen, bookingsRef, entrance effect (unchanged logic, ap-anim, data-ap-entrance)
  TitleShotStrip {ranking, onNavigate}
  AthleteHero {fighter, ranking, loading, onOpenCareerProfile, dataTut:"dashboard-hero", children}
     identity block inline (data-tut="dashboard-identity"): monogram portrait, nickname, first name + surname, division line, 4 numbers
     NextFightCard {heroBout, heroAction, offers, loading, acceptingId, onAccept(opponentId), onNavigate, onOtherBouts}
  div.ap-cols: FighterStatsTile {statRows, onTrain} . ConditionTile {fighter, injuries, camp, homeCamp, loading, onNavigate}
  BookingsList {offers, heroBout, loading, acceptingId, onAccept, reroll:{state, rerolling, error, onReroll}, activeCallout, onCallout, onReload, sectionRef}
  div.ap-grid: RankingsTile {ranking, weightClass, loading, onNavigate} . LastFightTile {lastFight, feed, gazette, pvp, pvpDefense, loading, onOpenGazette, onNavigate} . PurseFameTile {fighter, resources, sponsorship, homeCamp, loading, onNavigate}
  GazetteModal (unchanged) . CalloutModal {open, fighter, onClose, onCalledOut, onCancelled, onMessage} . InjuryWarnModal {...injuryModal}
```

- Keep `data-tut="dashboard-root"` on the root, `dashboard-hero` on the hero, `dashboard-identity` on the identity block.
- Identity numbers: record `W-L-D` from `fighter`; division rank from `data.ranking.rank` (`NR` when null, skeleton until loaded); OVR; `fighterStreak`.
- CalloutModal `onCalledOut` / `onCancelled` -> `onRefreshFighter(fighter._id)` and `reload()`.

### NextFightCard states

| State | Eyebrow / sub | CTA |
|---|---|---|
| `heroBout.source==="offer"` | `home.next.eyebrow`, `home.next.booked` with `formatTimeLeft(offers.expiresAt)` (`bookedExpired` when null) | Accept -> `onAccept(heroBout.opponentId)`, disabled while `acceptingId`; plus Other bouts -> `onOtherBouts` |
| `source==="accepted"` | `home.next.eyebrowSigned`, `home.next.signed` | `heroAction.label` -> `onNavigate(heroAction.linkTarget)` |
| `heroBout==null`, `offers.blockedReason` | eyebrow, body = `blockedReason` | heroAction CTA |
| `heroBout==null`, `offers.frozen` | eyebrow, `home.next.frozen` | heroAction CTA |
| `heroBout==null` otherwise | eyebrow, `home.next.none` | heroAction CTA |

Chips: difficulty from `offerType`, nemesis (`nemesisLossCount`), callout, title. Metrics: purse (gold), rounds, streak (`oppStreak`).

### BookingsList

- Header: `home.book.title`, `sub` / `subOne` / `subNone` from `offers.count`, `newSetIn` from `expiresAt`. Past expiry: `newSetReady` plus a Refresh button -> `onReload`. Hidden when frozen or blocked; when frozen show `frozenNote`.
- Rows: one per `offers.list` item as in the mockup. Accept is ghost unless `isMain`; disabled when `!acceptable || acceptingId`. Locked TitleShot row greyed with `titleLockKey` text instead of Accept. `isSigned` row shows `home.book.signed`.
- Callout row: dashed, always last, opens CalloutModal. Copy is `calloutManage*` when `fighter.activeCallout` is set.
- Reroll: follows `rerollButtonState`. Two-step inline confirm (first click shows `rerollConfirm`, second fires, clicking elsewhere cancels). Success -> `reload()` and `onRefreshFighter`. Error -> inline `rerollFailed` or server message; `reload()` on `OFFER_BOARD_STALE`.
- States: loading shows 3 `.ap-skel` rows; `blockedReason` shows one message row plus the callout row.

### Hooks

- `useDashboard`: unchanged.
- `useOfferBoard.js` exports `useOfferReroll(fighterId) -> { reroll(): Promise<{ok:true, cashAfter, offers, board} | {ok:false, code, message}>, rerolling, rerollError, clearError }` and `useOfferBoard(fighterId, { refreshKey } = {}) -> { offers, board, loading, error, reload, reroll, rerolling, rerollError }`. GET on mount and when `fighterId`/`refreshKey` change, same cancel-signal pattern as `useDashboard`. Composes `useOfferReroll`, applies offers/board from a successful reroll, calls `reload()` on `OFFER_BOARD_STALE`.
- `useAcceptOffer.js`: `useAcceptOffer({ fighter, onAcceptOffer, onStale }) -> { requestAccept(opponentId), acceptingId, injuryModal:{open, injuries, onCancel, onConfirm} }`. Moves the non-blocking-injury confirmation out of FightOffers so Home and the Hub share it. Calls `onStale()` when the result code is one of `OFFER_NOT_ON_BOARD`, `FIGHT_ALREADY_BOOKED`, `TITLE_SHOT_LOCKED`, `OFFER_BOARD_STALE`. Mounted-ref guard (Home unmounts on success).

### Accept from Home: exact sequence

1. `requestAccept(id)`. If non-blocking injuries (`!inj.cannotFight`), open InjuryWarnModal. Cancel stops here.
2. Set `acceptingId = id`, disable every Accept.
3. `await onAcceptOffer(id)` runs `App.handleAcceptOffer`: `POST /fights/offers/:fid {opponentId}` -> 201 Fight -> `POST /fights/accept/:fid/:fightId` -> `getCampReport` + `getCampState` -> face-off overlay -> `loadFighter` -> `setActiveTab("fights")`. Identical to the Fights tab flow.
4. On `{ok:false}`: clear `acceptingId`. App already shows `setMessage` / `maybeShowBlockPopup`. For stale codes call `reload()`.

### App, api and tutorial changes

- `App.jsx`: delete the `offers` state, `handleGetOffers` and every `setOffers`. `handleAcceptOffer(opponentId)` sends `{ opponentId }` and returns `{ok:true}` or `{ok:false, code:e.code, message}`. `<FightOffers fighter onAcceptOffer onRefreshFighter onMessage />`. `<DashboardTab ... onAcceptOffer={handleAcceptOffer} onRefreshFighter={loadFighter} onMessage={setMessage} />`.
- `api.js`: `getOffers` returns `{offers, board}`; `createOffer(fighterId, { opponentId })`; add `rerollOffers: (fighterId) => request(`/fights/offers/${fighterId}/reroll`, { method: "POST" })`.
- `FightOffers.jsx`: use `useOfferBoard` and `useAcceptOffer({ onStale: reload })`. Remove the Request Offers and Refresh Offers buttons and all fetch-on-click code. Loading -> `fights.board.loading`. Error -> `loadFailed` plus Retry. If `offers.length === 0` or `board.blockedReason`: render the FightHub panel (no request button; `blockedReason` as a danger alert; keep Call out). Otherwise: standing banner + grid + a new footer with `expiresIn`, the reroll button (same state helper, same two-step confirm) and Call out. `ContenderChecklist` unchanged. CalloutModal callbacks also call `reload()`.
- `OfferCard.jsx`: `onAccept(opp._id)`. Hide Accept when `offer.acceptable === false`.
- `constants/tutorialSteps.js`: delete the `request-offers` phase from `fight_offer`; `offer-card` follows `nav-fights`.

### CSS: replace the contents of `home.css`

Keep the `.home` root (variables, `container-type:inline-size` plus its comment) and the entrance mechanics (`is-armed` / `is-in` / `is-instant`, last in file), the reduced-motion block and the skeleton shimmer. Port the mockup's `.c-*` and shared rules to `.ap-*`:

| Mockup | App |
|---|---|
| `c-hero` | `ap-hero` |
| `c-id` | `ap-id` |
| `c-next` | `ap-next` |
| `c-cols` | `ap-cols` |
| `c-stats` | `ap-stats` |
| `c-book` | `ap-book` |
| `c-brow` (`.main` / `.callout`) | `ap-brow` (`--main` / `--callout` / `--locked` / `--frozen`) |
| `c-grid` | `ap-grid` |
| `c-last` | `ap-last` |
| `tile` | `ap-tile` |
| `chip` | `ap-chip` (`is-easy` / `is-even` / `is-hard` / `is-title` / `is-nem` / `is-callout`) |
| `btn` | `ap-btn` (`is-red` / `is-ghost` / `is-sm`) |
| `bar` | `ap-bar` |
| `kv` | `ap-kv` |
| `sil` | `ap-sil` (`is-red` / `is-blue`) |
| `eyebrow` | `ap-eyebrow` |
| (new) | `ap-mono`, `ap-anim`, `ap-skel`, `ap-strip*` |

`@container (max-width:1000px)`: `.ap-grid` 2 columns, last tile `1/-1`. `@container (max-width:720px)`: port the mockup's `.phone .c-*` rules (hero 1 column, `.ap-cols`/`.ap-grid` 1 column, `.ap-brow` `44px 1fr` with the button in column 2) plus 44px tap targets. DOM order equals mobile order, no `order` overrides. Delete the `pvp-countdown-mini` rules.

### i18n (`locales/en.json`)

Add `home.athlete`: `record` "W-L-D", `rank` "Division", `unranked` "NR", `ovr` "Overall", `streak` "Streak", `streakWin` "W{n}", `streakLoss` "L{n}", `streakNone` "-", `division` "{weightClass} · {tier} · {style}", `careerLink` "View career".

Add `home.next`: `eyebrow` "Next fight", `eyebrowSigned` "Your next fight", `booked` "Booked by the matchmaker · {time}", `bookedExpired` "Booked by the matchmaker · new set ready", `signed` "Signed. Camp is open.", `frozen` "Your fight is booked. The board reopens after fight night.", `none` "No bout on the table right now.", `line` "{record} · OVR {ovr}", `lineRank` "{record} · OVR {ovr} · #{rank} {weightClass}", `chipEasy` "Easy", `chipEven` "Even", `chipHard` "Hard", `chipTitle` "Title fight", `chipCallout` "Callout", `chipNemesisOne` "Nemesis · beat you once", `chipNemesisMany` "Nemesis · beat you {n} times", `purse` "Purse", `rounds` "Rounds", `streak` "Streak", `accept` "Accept", `accepting` "Signing...", `otherBouts` "Other bouts".

Add `home.book`: `title` "Bookings", `sub` "{n} bouts on the table", `subOne` "1 bout on the table", `subNone` "No bouts on the table", `newSetIn` "New set in {time}", `newSetReady` "New set ready", `refresh` "Refresh", `frozenNote` "Locked while your fight is booked", `signed` "Signed", `purse` "purse", `accept` "Accept", `nemesisTag` "Nemesis", `calloutTag` "Callout", `calloutTitle` "Call someone out", `calloutSub` "Pick a ranked fighter and set the terms", `calloutManageTitle` "Manage your callout", `calloutManageSub` "{name} is in your Hard slot", `calloutCta` "Call out", `lockedCooldown` "Win {n} more to earn a rematch", `lockedRank` "Reach the top 5 to unlock", `lockedWins` "Win {n} more in the top 5", `lockedDefault` "Title shot locked", `reroll` "Reroll set · {cost}", `rerollConfirm` "Spend {cost} to reroll?", `rerollUsed` "Rerolled already", `rerollCash` "Need {cost} to reroll", `rerolling` "Rerolling...", `rerollFailed` "Reroll failed. Try again.".

Add `home.statsTile`: `title` "Fighter stats", `trainCamp` "Train at camp", `trainGym` "Train at the gym".

Add `home.condition`: `title` "Condition", `energy` "Energy", `energyValue` "{cur} / {max}", `fullIn` "full in {eta}", `health` "Health", `healthValue` "{value} / 100", `injury` "Injury", `injuryNone` "None", `injuryValue` "{label} · {hours}h", `cannotFight` "Can't fight", `fightCamp` "Fight camp", `fightCampNone` "No fight booked", `fightCampValue` "Session {used} of {max}", `fightCampFinalised` "Camp finalised", `homeCamp` "Home camp", `homeCampNone` "No camp yet", `homeCampValue` "{tier} · {condition}% · {coach}", `mentalReset` "Mental reset required".

Add `home.last`: `title` "Last fight", `win` "W", `loss` "L", `draw` "D", `vs` "vs {name}", `meta` "{outcome} · {when}", `none` "No fights yet. Your debut is on the board.", `gazette` "Gazette", `gazetteRead` "Read the latest issue", `feed` "Feed", `feedNone` "Nothing yet", `pg` "Proving Ground", `pgDefenseOne` "1 defense report", `pgDefenseMany` "{n} defense reports", `pgRank` "#{rank} of {total}", `pgNotPlayed` "Not entered yet", `pgUpcoming` "Opens in {days}d", `pgNone` "No season running".

Add `home.purse`: `title` "Purse & fame", `cash` "Cash", `fame` "Fame", `fameValue` "{score} · {tier}", `frozen` "Frozen", `decaying` "Decaying", `purseBonus` "Purse bonus", `purseBonusValue` "+{pct}%", `sponsor` "Sponsor", `sponsorNone` "None signed", `wages` "Camp wages", `wagesValue` "{amount} in {days}d", `wagesNone` "No wages due".

Add `fights.board`: `loading` "Loading your bookings...", `loadFailed` "Couldn't load your bookings.", `retry` "Retry", `expiresIn` "New set in {time}", `expiresReady` "New set ready", `reroll` "Reroll set ({cost})", `rerollConfirm` "Spend {cost} to reroll?", `rerollUsed` "Rerolled already", `rerollCash` "Need {cost} to reroll", `rerolling` "Rerolling...", `rerollFailed` "Reroll failed. Try again.".

Change `fights.offers.activeCalloutBanner` -> "Callout active: {name} takes your Hard slot with full intel."

Remove `fights.hub.requestOffers`, `fights.hub.refreshOffers`, `app.loadingOffers`, `app.offersReady`, `app.noOffers`, and any `home.*` group left with zero references after the rewrite (grep each group first). Never remove `home.strip`, `home.rankings`, `home.error`, `home.gazette`.

---

## 6. Task ordering

Backend and frontend run in parallel. Backend touches only root folders; frontend touches only `frontend/`.

Backend: 1 schema + config, 2 fightService split, 3 offerBoardService, 4 createOffer/acceptOffer, 5 controller + routes, 6 dashboardService + JSDoc, 7 toPublicFighter, 8 tests.

Frontend: 1 api.js + hooks, 2 homeModel helpers, 3 App wiring + tutorialSteps, 4 FightOffers/OfferCard, 5 Home components + CSS, 6 i18n.

Shared types: `OfferBoardMeta` and `BoardOffer` defined once in the `offerBoardService.js` JSDoc; the dashboard payload shape stays in the `dashboardService.js` JSDoc and references them. Frontend reads both, does not redefine.

Deploy: backend and frontend ship together (GET offers response changes from array to object).

---

## 7. Tests (node:test, stubbed statics, no DB, following `tests/services/dashboardService.homeTab.test.js`)

`tests/services/offerBoardService.test.js`: fingerprint changes on tier, weightClass, nemesis id, pendingPromotion, lastFightDate; NOT on activeCallout, titleShotCooldown, topFiveWinsInTier. isBoardLive false on null, expired, mismatch, empty slots. getBoard generates once and reuses (pick call count 1). Expired regenerates. Each fingerprint field change regenerates. Callout change does not regenerate but swaps the Hard slot. Frozen: no pick call, all acceptable:false, frozen:true; frozen with no board returns []. Blocked: offers [], blockedCode INJURY, no persist, stored board cleared via generatedAt compare-and-set. Pool empty: no persist, POOL_EMPTY. Lost compare-and-set returns the stored board. Missing opponent regenerates. resolveBoardOffer: off-board -> OFFER_NOT_ON_BOARD; expired -> OFFER_NOT_ON_BOARD and no pick call; locked title -> TITLE_SHOT_LOCKED; callout opponent allowed; frozen -> FIGHT_ALREADY_BOOKED; injured -> FIGHT_BLOCKED_INJURY. Reroll: cost table for 5 tiers; updateOne filter has iron $gte, rerollUsed:false, generatedAt, acceptedFightId:null; $inc is -cost, new board rerollUsed:true and reset expiresAt; second reroll REROLL_USED; NOT_ENOUGH_CASH makes no pick call; frozen/injured/stale each return their code; pool empty no charge; avoidOpponentIds equals previous difficulty picks minus nemesis.

`tests/services/fightService.offerSlots.test.js`: slots ordered Easy, Even, Hard by OVR; avoidOpponentIds in window $match but not backfill; nemesis forced into its slot; TitleShot slot added when pendingPromotion set and champion exists; hydrateOffers: context recomputed from current fightHistory; callout overlay gets its own context; title OVR x1.05 and lock fields live; missing opponent sets missing:true.

`tests/services/fightService.createOffer.board.test.js`: offerType from the board, client input ignored; off-board opponent rejected; acceptOffer re-validates slot and type; atomic claim returns FIGHT_ALREADY_BOOKED when modifiedCount 0; deductEnergy throw rolls back the claim.

`tests/controllers/fightController.offers.test.js`: every code maps to status and body; GET shape {offers, board}; reroll 200 includes cashAfter; OFFER_INVALID_INPUT for bad opponentId.

`tests/routes/fightRoutes.ownership.test.js`: router stack has ownFighterParam on GET/POST offers, reroll and accept.

`tests/services/dashboardService.homeTab.test.js` (update): stub offerBoardService.getBoard instead of generateOffers; list-item key set (19 keys); offers block carries meta keys on success and when degraded; count and best consider acceptable only; frozen puts heroBout on the accepted branch; computeHeroAction receives acceptable only; lastFight shape and null when degraded.

`tests/frontend/homeModel.test.js`: load with `await import(pathToFileURL(...))`; cover formatTimeLeft, rerollButtonState (every rerollBlockedBy value), titleLockKey, bookingRowFlags, oppStreak, fighterStreak.

---

## 8. Risks

Fixed by this work (on the contract's path): forged title shot via client offerType; double accept (no acceptedFightId check); wrong callout record from copied context.

Flagged, NOT fixed here: `PUT /fighters/:id` is mass assignment with no ownFighter guard (`controllers/fighterController.js` ~line 47, `routes/fighterRoutes.js` ~line 117). Separate fix-bug run.

Other: compare-and-set races on `offerBoard.generatedAt`; stale injury on the Fight Hub until the next fighter refresh (accepted); leftover "offered" Fight docs on failed accepts (pre-existing); createCamp failure after the claim (pre-existing); clock skew on the client countdown (server expiresAt authoritative); mixed rank spaces between OfferCard and Home (pre-existing, flagged); E2E suite in `E:\Projects\ground-and-pound-e2e` clicks "Request Offers" in 6 places and needs updating after merge; Mongoose: slot key is `offerType`, updateOne needs runValidators; dashboard gets cheaper, keep the JSDoc COST current; tutorial `request-offers` phase removal is safe, confirm `offer-card` anchor appears for a new fighter; docs step 6 mandatory (GDD, Library, changelog).
