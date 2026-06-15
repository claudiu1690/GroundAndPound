I now have all grounding I need. Here is the complete implementation contract.

---

# GROUND & POUND — "The Proving Ground" PVP System: Implementation Contract

## Assumptions (stated up front; resolved from code, not invented)

1. **`/api/pvp` prefix conflict (BLOCKING-IF-IGNORED, resolved here).** The brief writes endpoints as `/api/pvp/...`, but this codebase mounts every router at root with **no `/api` prefix** (`app.use("/events", …)`, `app.use("/fighters", …)` in `D:\Projects\GroundAndPound\app.js:62-72`). The frontend `request()` helper (`frontend/src/api.js:25`) prepends only `VITE_API_URL`. **Decision: mount at `/pvp` to match every other router.** All paths below use `/pvp/...`. The frontend `api.js` methods call `/pvp/...`. If the user truly wants `/api/pvp`, that is a one-line mount change but would be inconsistent with the whole app — flagged, not done.
2. **`playerId` = Fighter `_id`** (one account = one fighter). Confirmed `models/fighterModel.js`. The authenticated fighter is `req.user.fighterId` (set by `middleware/authMiddleware.js:41`). Write endpoints derive the actor from `req.user.fighterId` and **ignore any client-supplied attacker id**.
3. **Currency mapping:** brief "cash" → `fighter.iron` (Number, `fighterModel.js:64`). "fame" → `notorietyService.applyNotorietyDelta(fighter, delta, {code,reason,meta})` (signature confirmed `fightService.js:966`). "energyDrinks" → **`fighter.inventory.energyDrinks`** (Number, `fighterModel.js:324`), granted via `shopService.grantEnergyDrinks(fighter, n)` (used at `fightService.js:937`) — there is a top-level `energyDrinks` referenced in the brief but the canonical field is `inventory.energyDrinks`; use the shop helper which clamps.
4. **Energy:** `fighter.energy.current` (object, `fighterModel.js:59-63`). Deduct 15 at resolution via the same path `fightService` uses (`fighterService.deductEnergy`) or direct decrement inside the transaction — see §6. Read-check `fighter.energy.current >= 15` before resolving.
5. **OVR** = `fighter.overallRating` (`fighterModel.js:52`). `weightClass` enum = `WEIGHT_CLASSES` from `consts/gameConstants.js`; brief lists `featherweight|lightweight|middleweight|heavyweight` — these must be a subset of `WEIGHT_CLASSES`. **Backend-dev: verify `consts/gameConstants.js` WEIGHT_CLASSES contains exactly these 4 keys (lowercase). If casing differs, the season seed + `fighter.weightClass` filter must match the stored casing.** This is a launch-blocking data-match check.
6. **Fight engine reuse:** use the **pure `resolveFight(player, opponent, opts)`** from `utils/fightResolution.js` (return shape confirmed `:804-840`: `{ outcome, winner, playerHealthAfter, commentary, rounds, scorecard }`). This is the same pure simulator `fightService.resolveFightAndApply` wraps. Do **not** reuse `mainEventService.simulate` (pure-OVR coin-flip, no stats) — the brief's gameplan stat-weighting requires the stat-driven engine. Rationale in §6.
7. **`lastFightAt` vs `lastActiveAt`:** `lastFightAt` = timestamp of the player's last PVP fight (attacker or defender), drives **decay eligibility**. `lastActiveAt` = last time the player viewed/touched their PVP record (set on any authed PVP read that returns their own record, and on decay touch). Decay reads `lastFightAt`; matchmaking displays `lastActiveAt`. Both default to `createdAt`.

---

## 1. Mongoose Models

All under `D:\Projects\GroundAndPound\models\`. Shared config in `D:\Projects\GroundAndPound\consts\pvpConfig.js`.

### `consts/pvpConfig.js` (single source of truth — imported by services AND frontend gets a parallel const; see §7 shared-types note)

Exports:
- `WEIGHT_CLASSES_PVP = ["featherweight","lightweight","middleweight","heavyweight"]`
- `DIVISIONS` ordered array:
  ```
  [
   { key:"prospect",   floor:0,    promoteAt:300,  ovrMin:10, ovrMax:20, color:"#888"    },
   { key:"contender",  floor:300,  promoteAt:1200, ovrMin:18, ovrMax:30, color:"#93C5FD" },
   { key:"challenger", floor:1200, promoteAt:2500, ovrMin:25, ovrMax:40, color:"#C4B5FD" },
   { key:"elite",      floor:2500, promoteAt:5000, ovrMin:35, ovrMax:55, color:"#5EEAD4" },
   { key:"champion",   floor:5000, promoteAt:null, ovrMin:50, ovrMax:null,color:"#C8102E"},
  ]
  ```
- `DP = { WIN_BASE:120, LOSS_ATTACKER:-55, LOSS_DEFENDER:-28, BELT_BONUS:50, RIVALRY_BONUS:25, BRACKET_10_PCT:0.10, BRACKET_25_PCT:0.25, STREAK_MULT:1.25, STREAK_MIN:3, REPEAT_2ND:0.5, REPEAT_3RD:0.25, MIN_WIN_GAIN:1, MAX_LOSS:-100 }`
- `TWISTS` — keyed enum with effect descriptors:
  ```
  iron_circuit:  { name:"Iron Circuit",  effect:null },
  blood_sport:   { name:"Blood Sport",   methods:["ko","submission"], pct:0.25 },
  the_contenders:{ name:"The Contenders", streakFrom:3 },
  ground_war:    { name:"Ground War",    methods:["submission"], pct:0.30 },
  iron_fist:     { name:"Iron Fist",     methods:["ko"], pct:0.30 },
  the_marathon:  { name:"The Marathon",  methods:["decision"], pct:0.20 },
  ```
  Note `the_contenders` lowers the streak threshold to 3 (already the brief default `STREAK_MIN:3`, so it is a no-op vs the base rule **unless** base streak min is read from twist — implement streak-min as `twist.streakFrom ?? DP.STREAK_MIN`).
- `GAMEPLAN_WEIGHTS`:
  ```
  aggressive: { str:1.3, spd:1.2, chn:0.9, fiq:0.9 },
  balanced:   {},  // identity
  counter:    { fiq:1.3, chn:1.2, str:0.9, spd:0.9 },
  ```
- `REWARDS` keyed by division + `beltHolder`:
  ```
  prospect:   { iron:500,   fame:500,   drinks:0, badge:null },
  contender:  { iron:1200,  fame:1200,  drinks:0, badge:null },
  challenger: { iron:2500,  fame:2500,  drinks:0, badge:"challenger" },
  elite:      { iron:5000,  fame:5000,  drinks:2, badge:"elite" },
  champion:   { iron:10000, fame:10000, drinks:5, badge:"champion" },
  beltHolder: { iron:15000, fame:15000, drinks:7, badge:"belt" },  // REPLACES champion
  ```
- `SOFT_RESET` map: `{ prospect:"prospect", contender:"prospect", challenger:"contender", elite:"challenger", champion:"contender" }` (target division; dp = that division's floor).
- `SEASON_LENGTH_DAYS = 70`, `DECAY_AFTER_DAYS = 7`, `DECAY_AMOUNT = 10`, `INACTIVITY_DECAY_SKIP = "prospect"`, `MIN_FIGHTS_FOR_REWARD = 1`, `MATCHMAKE_COUNT = 5`, `MATCH_OVR_STEPS = [5,10,15,20]`.

**Helpers (pure, exported from `pvpConfig.js`):**
- `divisionForDp(dp)` → division key (highest division whose `floor <= dp`). **This is the authoritative derivation — division is never trusted from storage on writes; recompute on every dp change.** (PVPRecord stores `division` only as a denormalized read cache for ladder/matchmaking queries; it is rewritten on every fight.)
- `divisionFloor(divKey)`, `divisionMeta(divKey)`, `nextDivision(divKey)`.
- `bracketTier(attackerOvr, defenderOvr)` → `"none"|"plus10"|"plus25"` by |gap| (6–10 → plus10, 11–20 → plus25, else none).
- `badgeIdFor(divKey, seasonNumber, weightClass)` → e.g. `pvp_challenger_s3`; belt → `pvp_belt_s3_featherweight`.

### `models/seasonModel.js`
```
{ seasonNumber:Number(req), name:String(req), twist:{enum:Object.keys(TWISTS),default:"iron_circuit"},
  weightClass:{enum:WEIGHT_CLASSES_PVP,req}, startDate:Date(req), endDate:Date(req),
  status:{enum:["upcoming","active","ended"],default:"upcoming"}, beltHolderId:{ObjectId ref Fighter,default:null},
  createdAt }  // timestamps:true
```
Indexes:
- `{ weightClass:1, seasonNumber:1 }` unique (one season per WC per cycle).
- `{ status:1, startDate:1 }` (transition sweep: find upcoming whose start passed).
- `{ status:1, endDate:1 }` (transition sweep: find active past endDate).

### `models/pvpRecordModel.js`
```
{ playerId:{ObjectId ref Fighter,req}, seasonId:{ObjectId ref Season,req}, weightClass:{enum,req},
  division:{enum:DIVISION_KEYS,default:"prospect"}, dp:{Number,default:0,min:0}, peakDp:{Number,default:0},
  wins:{default:0}, losses:{default:0}, winStreak:{default:0}, longestStreak:{default:0},
  defenseGameplan:{enum:["aggressive","balanced","counter"],default:"balanced"},
  promotionShield:{Number,default:0,min:0,max:3},
  lastFightAt:{Date,default:null}, lastActiveAt:{Date,default:Date.now}, createdAt }
```
Indexes:
- `{ playerId:1, seasonId:1 }` **unique** (record lookup; one per player per season — weightClass is functionally determined by season but include `weightClass` in the doc for query convenience).
- `{ seasonId:1, weightClass:1, dp:-1 }` (ladder pagination, and Champion-division belt-holder = first in this sort filtered to division=champion).
- `{ seasonId:1, weightClass:1, division:1, overallRating?... }` — OVR is **not** on the record; matchmaking needs OVR. **Decision: store a denormalized `overallRating` snapshot on PVPRecord, refreshed on every fight resolution + on record read-through.** Add field `overallRating:{Number,default:0}` and index `{ seasonId:1, weightClass:1, overallRating:1 }` for the matchmaking OVR-bracket query. (Joining to the Fighter collection per-candidate is the alternative; the snapshot avoids an N+1 and is refreshed every fight — staleness window ≤ one opponent fight, acceptable for matchmaking. Documented as a denormalization with a single refresh home.)
- `{ seasonId:1, lastFightAt:1 }` (decay batch scan).

### `models/pvpFightModel.js`
```
{ seasonId:{req}, weightClass:{enum,req}, attackerId:{req}, defenderId:{req},
  attackerGameplan:enum, defenderGameplan:enum, winnerId:{ObjectId,null}, loserId:{ObjectId,null},
  method:{enum:["decision","ko","submission","draw"]},  // draw included; see §6 note
  attackerDpChange:Number, defenderDpChange:Number,
  attackerDpBefore,attackerDpAfter,defenderDpBefore,defenderDpAfter:Number,
  attackerDivisionBefore,attackerDivisionAfter,defenderDivisionBefore,defenderDivisionAfter:String,
  dpBreakdown:{ base,rivalryBonus,beltHolderBonus,bracketBonus,streakMultiplier,repeatPenalty:Number },
  isRivalryFight:Bool, isRivalryResolved:Bool, isBeltHolderFight:Bool, wasDefenseWhileOffline:Bool,
  defenderSeen:{Bool,default:false},  // for GET /pvp/defense-results unread feed
  commentary:[String],  // optional, from engine
  fightAt:{Date,default:Date.now} }
```
Indexes:
- `{ attackerId:1, defenderId:1, seasonId:1, fightAt:1 }` (repeat-penalty ISO-week count).
- `{ defenderId:1, defenderSeen:1, fightAt:-1 }` (unread defense results).
- `{ seasonId:1, fightAt:-1 }` and `{ attackerId:1, fightAt:-1 }` (history endpoint).
- `{ seasonId:1, winnerId:1, loserId:1 }` (rivalry win-count).

### `models/pvpRivalModel.js`
```
{ seasonId:{req}, player1Id:{req}, player2Id:{req}, wins:{Number,default:0},
  status:{enum:["active","resolved"],default:"active"}, resolvedAt:{Date,null} }
```
Index: `{ seasonId:1, player1Id:1, player2Id:1 }` unique (one directional rival per pair per season).
Plus `{ seasonId:1, player2Id:1 }` for "am I someone's rival target" lookups in matchmaking flags.

### `models/hallOfFameModel.js`
```
{ seasonId:{req}, seasonNumber:Number, weightClass:{enum}, beltHolderId:{ObjectId},
  finalDp:Number, record:{wins:Number,losses:Number}, createdAt }  // timestamps
```
Index: `{ weightClass:1, seasonNumber:-1 }`, `{ beltHolderId:1 }`.

---

## 2. Service Layer

All under `D:\Projects\GroundAndPound\services\`. Controllers contain **zero** game logic.

### `services/pvpConfigService.js` — thin re-export of `consts/pvpConfig.js` helpers if any runtime shaping needed. (Optional; helpers can live directly in the const file.)

### `services/pvpRecordService.js`
- `getOrCreateRecord(fighterId, season)` → loads (or creates) the PVPRecord for the active season of the fighter's weight class. On create: division `prospect`, dp 0, snapshot `overallRating`. **Does not** create records for ended seasons.
- `getRecord(playerId, seasonId)` → lean record or null (public read).
- `shapeRecord(record, fighter?)` → response DTO (see §3).
- `getHistoryForCareer(playerId)` → last 3 seasons + current active record, each `{ seasonId, seasonNumber, seasonName, weightClass, division, dp, color, isActive, hof? }`. Used by Career Profile card.
- `touchActive(record)` → set `lastActiveAt=now` (mutation only, caller saves).
- `refreshOvrSnapshot(record, fighter)` → sync `record.overallRating` + `record.division=divisionForDp(record.dp)`.

### `services/pvpSeasonService.js`
- `getCurrentSeason(weightClass)` → active Season doc for that WC (or upcoming if none active). Resolves the "current season" the hub/record endpoints key on.
- `getSeasonById(seasonId)`.
- `seedSeason(seasonNumber, weightClass, twist, startDate, status)` → idempotent create (unique index guards). Used by launch script + N+1 in-job.
- `seedAllForCycle(seasonNumber, twist, startDate, status)` → 4 docs (one per WC). Season 1 forces `twist="iron_circuit"`.
- `runSeasonTransitionSweep()` → batch fn called by the worker. Two phases:
  1. **End due seasons:** `Season.find({status:"active", endDate:{$lte:now}})`. For each, call `pvpRewardService.finalizeSeason(season)`.
  2. **Start due seasons:** `Season.find({status:"upcoming", startDate:{$lte:now}})` → set `status:"active"`.
  Returns `{ ended, started }`. Idempotent: each phase re-queries by status, so a re-run after partial completion only touches still-pending docs. `finalizeSeason` is itself idempotent (guards on `status==="ended"` early-return and on existing HoF entry).

### `services/pvpRewardService.js`
- `finalizeSeason(season)`:
  1. Guard: if `season.status==="ended"` return (idempotent).
  2. Find ladder for this WC: `PVPRecord.find({seasonId,weightClass}).sort({dp:-1})`.
  3. Belt holder = highest-dp record **in `division==="champion"`** with `wins+losses>0` (min-fight rule) — may be null (belt unclaimed). Set `season.beltHolderId`.
  4. If belt holder: create `HallOfFame` entry (guard on existing), award `REWARDS.beltHolder` (REPLACES champion rewards), badge `pvp_belt_s{N}_{wc}`, feed `pvp_belt_won`.
  5. For every other **eligible** record (`wins+losses>0`): award `REWARDS[finalDivision]` (iron via `fighter.iron+=`, fame via `notorietyService.applyNotorietyDelta`, drinks via `shopService.grantEnergyDrinks`, badge via the synthesized-badge path §9). Feed `pvp_season_end`.
  6. Records with **0 fights** get nothing (skip).
  7. `season.status="ended"`, save.
  8. Call `softReset(season)` then seed N+1 for this WC (`pvpSeasonService.seedSeason(seasonNumber+1, weightClass, …, status:"upcoming")` with start = old endDate, twist chosen by `pickTwistForSeason(seasonNumber+1)` — deterministic rotation or config; Season 1 already iron_circuit).
  - **All fighter mutations batched per-fighter** (load fighter once, apply iron+fame+drinks+badge, save once) to avoid version conflicts.
- `softReset(season)`: for each finished record, compute target division via `SOFT_RESET`, create a **new** PVPRecord for season N+1 (same WC) with reset division/dp(=floor), copy `defenseGameplan`, zero `wins/losses/winStreak/longestStreak/promotionShield/peakDp/lastFightAt`, snapshot current OVR. **Do NOT delete the old record.** Guard against duplicate creation (unique `{playerId,seasonId}` — wrap create in try/catch dup-key → skip).

### `services/pvpDpService.js` (pure, unit-testable — the heart, isolated for QA)
- `computeDp({ isWin, isDraw, isAttacker, method, attackerStreak, isBeltHolderFight, isRivalryResolved, bracketTier, twist, repeatCount })`
  → `{ dpChange:int, breakdown:{ base, rivalryBonus, beltHolderBonus, bracketBonus, streakMultiplier, repeatPenalty } }`.
  **Exact ordered algorithm (matches brief §DP CALC):**
  1. `base` = win `+120`; loss `-55` (attacker) / `-28` (defender); draw `0`.
  2. **Losses skip all positive modifiers.** Modifiers 1–5 apply to the **win** branch only (attacker). Then:
  3. Start `val = base`. (Track each modifier into breakdown.)
  4. `beltHolderBonus`: if win && isBeltHolderFight (defender is belt holder) → `val += 50`, breakdown.beltHolderBonus=50.
  5. `rivalryBonus`: if win && isRivalryResolved → `val += 25`, breakdown.rivalryBonus=25.
  6. `bracketBonus`: if win && bracketTier!=="none" → `pct = .10|.25`; `bonus = round((val)*pct)`; `val += bonus`; breakdown.bracketBonus=bonus. *(Bracket multiplies the running subtotal AFTER flat bonuses — confirm with QA against brief order "3) bracket … +10%"; brief lists bracket as step 3 before twist, so it multiplies base+flats. Documented.)*
  7. `twist`: if win && twist applies to this method → `val = round(val * (1+pct))`; record multiplier in `streakMultiplier`? No — twist has no dedicated breakdown field; fold into base/bracket display. **Decision: add twist effect into `bracketBonus`? No.** The breakdown schema lacks a twist slot. Store twist contribution implicitly (val grows) and expose `twistApplied:bool` + `twistName` on the fight DTO instead. (Flag: brief's `dpBreakdown` omits a twist line; FE shows twist via season banner, so no per-fight twist line needed.)
  8. `streakMultiplier`: if win && attackerStreak ≥ (twist.streakFrom ?? 3) → `val = round(val*1.25)`; breakdown.streakMultiplier=1.25 (else 1).
  9. `repeatPenalty`: if win && repeatCount===1 (this is 2nd fight vs same opp this ISO week) → `mult=0.5`; if repeatCount≥2 (3rd+) → `mult=0.25`; `val=round(val*mult)`; breakdown.repeatPenalty=mult (else 1).
  10. **Clamps:** win → `val = max(1, val)` (MIN_WIN_GAIN). Loss → `val = max(-100, val)` (MAX_LOSS). Return int.
  - **DP floor on loss is applied by the caller** (record service), not here, because it needs current dp + division floor: `newDp = max(divisionFloor(currentDivision), dp + dpChange)`.
- `applyDpAndDivision(record, dpChange, { isWin })`:
  - `record.peakDp = max(peakDp, dp)` updates after.
  - On win: `record.dp += dpChange`. Then **promotion check**: if `nextDivision` exists and `record.dp >= currentDivision.promoteAt` → set `record.division = nextDivision`, **set `record.dp = nextDivision.floor`** (no carry), `record.promotionShield = 3`. Else recompute `record.division = divisionForDp(record.dp)` (cannot go DOWN here; clamp to current if shield>0).
  - On loss: `clamped = max(divisionFloor(record.division), record.dp + dpChange)` (dpChange ≤0). `record.dp = clamped`. **Division does not demote mid-season** — keep `record.division` (soft reset only at season end), but if shield>0 the floor already protects. Recompute division only upward never downward.
  - **Shield decrement:** after EVERY fight (win or loss), if `promotionShield>0` → `promotionShield -= 1`.
  - Returns `{ promoted:bool, newDivision, dpAfter }`.

### `services/pvpMatchmakingService.js`
- `getOpponents(fighter, season)` → array of ≤5 candidate DTOs. Algorithm:
  - Base query: `PVPRecord.find({ seasonId, weightClass, playerId:{$ne:fighter._id} })`.
  - Expand OVR window through `MATCH_OVR_STEPS [5,10,15,20]` against snapshot `overallRating`, accumulating until ≥5 or steps exhausted.
  - Sort by `abs(candidate.dp - myRecord.dp)` ascending; take 5.
  - Per candidate flag: `difficulty` (easy/even/hard by OVR vs fighter ±3), `bracketBonus` (none|plus10|plus25 via `bracketTier`), `isBeltHolder` (candidate is current #1 in champion division this season — compute once: top champion-division record), `isRival` (active PVPRival in either direction this season), `lastActiveAt`.
  - Returns however many real ones exist (no AI fill).

### `services/pvpFightService.js` — **the resolution orchestrator** (see §6 for sequencing/idempotency)
- `resolveFight(attackerFighterId, { defenderId, gameplan, seasonId, weightClass })` → fight result DTO. Validates, runs engine, writes everything in order, returns the FightResult shape (§3).
- `listDefenseResults(fighterId)` → unread (`defenderSeen:false`) PVPFights where `defenderId=fighterId`, shaped; marks them seen after read (or via explicit param — **Decision: mark seen on read**, since the screen IS the acknowledgment; pass `?ack=true` default true).
- `listFights(seasonId, fighterId, { page, limit })` → paginated history (both attacker+defender rows for that fighter in that season).
- `setDefenseGameplan(fighterId, gameplan)` → validates enum, updates the fighter's **active-season** PVPRecord `defenseGameplan`.

### `services/pvpRivalryService.js`
- `processRivalry(season, attackerId, defenderId, isWin)` → after a win, count `PVPFight.countDocuments({seasonId, winnerId:attackerId, loserId:defenderId})`. On 2nd → upsert PVPRival(active, player1=attacker). On 3rd → set existing rival `resolved`, `resolvedAt=now`, return `{ isRivalryFight:true, isRivalryResolved:true }`. Returns flags consumed by DP calc + fight doc + feed. **Must run BEFORE DP calc** so the +25 resolved bonus applies on the 3rd-win fight (brief: "3rd win → +25 DP on that fight"). Ordering handled in §6.

### `services/pvpDecayService.js`
- `runDecayBatch()` → `PVPRecord.find` joined to active seasons where `lastFightAt < now-7d` and `division!=="prospect"`. For each: `dp = max(divisionFloor, dp-10)`, `lastActiveAt=now` (do NOT touch lastFightAt). Returns count. Idempotent per-day (re-running same day re-decays — **mitigation: gate on `lastActiveAt`/a `lastDecayAt` field OR accept daily idempotency via the cron firing once/day**; since the cron is the only caller and fires once at midnight UTC, a same-day double-run would double-decay. **Decision: add `lastDecayAt` field to PVPRecord; skip if `lastDecayAt` is today (UTC).** This makes the batch idempotent within a day.)

---

## 3. API Contract

All routes mounted `app.use("/pvp", authMiddleware, pvpRoutes)`. Every endpoint authed. Actor = `req.user.fighterId`. Standard error envelope: `{ message:String, code?:String }`. 401 from auth middleware (no token / revoked). 500 → `{message:"Internal server error"}` (never leak internals — match `mainEventController` pattern).

### 3.1 `GET /pvp/ladder/:weightClass/:seasonId` — public read (within auth)
Query: `?page=1&limit=25`.
Success 200:
```json
{ "season": { "id","seasonNumber","name","twist":"iron_circuit","twistName","twistEffect","weightClass","status","beltHolderId","beltHolderName","startDate","endDate" },
  "rows": [ { "rank":1,"playerId","name","division":"champion","divisionColor":"#C8102E","dp":5240,"wins":12,"losses":3,"winStreak":4,"overallRating":58,"isBeltHolder":true,"isYou":false } ],
  "page":1,"limit":25,"total":140,"totalPages":6 }
```
Errors: 400 `{code:"bad_weight_class"}` invalid WC; 404 `{code:"season_not_found"}`.

### 3.2 `GET /pvp/record/:playerId` — public read
Success 200:
```json
{ "record": { "playerId","name","seasonId","seasonNumber","weightClass","division","divisionColor","dp","peakDp","promoteAt":1200,"divisionFloor":300,"wins","losses","winStreak","longestStreak","defenseGameplan","promotionShield","rank":14,"isBeltHolder":false,"lastFightAt","lastActiveAt" },
  "history": [ { "seasonId","seasonNumber","seasonName","weightClass","division","divisionColor","dp","isActive":true,"isBeltHolder":false } ] }
```
If no record for active season: `record:null` but still return `history`. Errors: 404 `{code:"fighter_not_found"}`.

### 3.3 `GET /pvp/opponents` — actor's own matchmaking
Query: none (weightClass+season derived from actor's fighter). Success 200:
```json
{ "season": {…as 3.1 season block…},
  "you": { "division","dp","overallRating","record":{wins,losses} },
  "candidates": [ { "playerId","name","division","divisionColor","dp","overallRating","difficulty":"even","bracketBonus":"plus10","isBeltHolder":false,"isRival":true,"lastActiveAt","wins","losses","defenseGameplan" } ] }
```
`candidates` length 0–5. Errors: 409 `{code:"season_not_active"}` if no active season for the fighter's WC.

### 3.4 `POST /pvp/fight` — initiate + resolve immediately
Body: `{ "defenderId":String, "gameplan":"aggressive|balanced|counter", "seasonId":String, "weightClass":String }`. Actor (attacker) = `req.user.fighterId`; **`attackerId` is never read from body.**
Validation: gameplan enum; defenderId ≠ self; defenderId exists + has active PVPRecord same season/WC; seasonId active; energy ≥ 15.
Success 200 (FightResult DTO):
```json
{ "fightId","winnerId","loserId","method":"ko","youWon":true,
  "attacker":{ "playerId","name","dpBefore","dpAfter","dpChange":138,"divisionBefore","divisionAfter","division","divisionColor","rankBefore":18,"rankAfter":12,"streakAfter":3,"promoted":false,"promotionShield":3 },
  "defender":{ "playerId","name","dpBefore","dpAfter","dpChange":-28,"divisionBefore","divisionAfter" },
  "dpBreakdown":{ "base":120,"beltHolderBonus":0,"rivalryBonus":0,"bracketBonus":18,"streakMultiplier":1,"repeatPenalty":1 },
  "twistApplied":false,"twistName":"Iron Circuit",
  "flags":{ "isRivalryFight":false,"isRivalryResolved":false,"isBeltHolderFight":false,"isPromotion":false },
  "energyRemaining":85, "commentary":["Round 1: …"] }
```
Errors:
- 400 `{code:"bad_gameplan"}`, `{code:"self_target"}`, `{code:"bad_weight_class"}`.
- 402 `{code:"insufficient_energy", message:"Not enough energy — PVP fights cost 15 energy."}` (energy block, exact message from brief).
- 404 `{code:"defender_not_found"}`, `{code:"season_not_found"}`.
- 409 `{code:"season_not_active"}`, `{code:"defender_not_in_season"}`.
- 429 `{code:"duplicate_in_flight"}` (idempotency guard, see §6) — optional; only if a second request lands while the first holds the lock.

### 3.5 `GET /pvp/fights/:seasonId` — actor's history
Query `?page&limit`. Success 200:
```json
{ "fights":[ { "fightId","fightAt","role":"attacker","opponentId","opponentName","youWon":true,"method":"ko","dpChange":138,"divisionAfter","isRivalryFight","isBeltHolderFight","wasDefenseWhileOffline":false } ],
  "page","limit","total","totalPages" }
```

### 3.6 `GET /pvp/defense-results` — unread defenses
Query `?ack=true` (default true → marks returned rows seen). Success 200:
```json
{ "results":[ { "fightId","fightAt","attackerId","attackerName","youWon":false,"method":"submission","dpChange":-28,"halfRate":true,"divisionAfter" } ],
  "unreadCount":3 }
```
`halfRate` always true for defense (defender loses at half rate, max -28). Empty array if none.

### 3.7 `POST /pvp/defense-gameplan`
Body `{ "gameplan":"aggressive|balanced|counter" }`. Success 200: `{ "defenseGameplan":"counter" }`. Errors 400 `{code:"bad_gameplan"}`; 409 `{code:"no_active_record"}`.

### 3.8 `GET /pvp/hof`
Query `?weightClass=&limit=20`. Success 200:
```json
{ "entries":[ { "seasonId","seasonNumber","weightClass","beltHolderId","beltHolderName","finalDp","record":{wins,losses},"createdAt" } ] }
```

### 3.9 `GET /pvp/season/current/:weightClass`
Success 200:
```json
{ "season":{…3.1 season block…}, "yourRecord":{…3.2 record or null…}, "beltUnclaimed":true, "poolCount":42 }
```
`poolCount` = count of records in the actor's division (for the empty/low-pop screen). Errors 400 bad WC.

**Pagination shape** (ladder + fights): `{ page, limit, total, totalPages }` alongside the array. `limit` capped server-side (default 25, max 100).

---

## 4. Controllers + Routes

- `D:\Projects\GroundAndPound\controllers\pvpController.js` — one handler per endpoint, thin: parse params, call service, map known service errors → status/code (pattern from `mainEventController.js:51-64`), `console.error` + 500 otherwise. Reads `req.user.fighterId` for the actor.
- `D:\Projects\GroundAndPound\routes\pvpRoutes.js`:
  ```
  router.get("/ladder/:weightClass/:seasonId", c.getLadder);
  router.get("/record/:playerId", c.getRecord);
  router.get("/opponents", c.getOpponents);
  router.post("/fight", c.postFight);
  router.get("/fights/:seasonId", c.getFights);
  router.get("/defense-results", c.getDefenseResults);
  router.post("/defense-gameplan", c.setDefenseGameplan);
  router.get("/hof", c.getHof);
  router.get("/season/current/:weightClass", c.getCurrentSeason);
  ```
- Mount in `app.js` after the other protected routes: `app.use("/pvp", authMiddleware, pvpRoutes);`. Auth middleware populates `req.user.fighterId`; no `ownFighterMiddleware` needed because the actor is taken from the token, not the URL (writes can only touch the authed fighter by construction; `/record/:playerId` and `/ladder` are intentionally public reads).

---

## 5. BullMQ Jobs (added to `modules/scheduler.js`)

Pattern strictly follows existing (`Queue`/`Worker` with `QUEUE_CONNECTION`, `concurrency:1`, repeatable via `queue.add(name,{},{repeat,jobId,removeOnComplete})`, `.on("error")` handler, registered inside `startEnergyIncrementScheduler()`).

### Job A — PVP inactivity decay
- Queue `"pvp-decay"`, worker calls `pvpDecayService.runDecayBatch()`.
- Schedule: `repeat:{ pattern:"0 0 * * *" }` (midnight UTC — server runs UTC; if not, set `tz:"UTC"` in repeat opts), `jobId:"pvp-inactivity-decay"`, `removeOnComplete:true`.
- **Idempotency:** `lastDecayAt`-today guard (§2 pvpDecayService) → safe re-run. **Retry:** rely on BullMQ default (none for repeatable) + the worker `.on("error")` logs; batch is resumable (only decays records not yet decayed today). **onFailed:** `worker.on("failed", (job,err)=>console.error("[PVP decay] failed:",err))` and `.on("error",…)`. No silent failure.

### Job B — Season transition sweep (ends due seasons + starts upcoming) — **launch-critical**
- Queue `"pvp-season-transition"`, worker calls `pvpSeasonService.runSeasonTransitionSweep()`.
- Schedule: **periodic sweep**, `repeat:{ pattern:"5 0 * * *" }` (00:05 UTC daily — offset from decay so they don't contend; season boundaries are day-granular, daily is sufficient for 70-day seasons). `jobId:"pvp-season-transition"`, `removeOnComplete:true`.
- **Why a sweep, not per-season delayed jobs (justification per the grounded note):** delayed jobs keyed to each season's `endDate` are fragile — a missed/cleared Redis job (deploy, flush, crash) silently strands a season `active` forever with no self-heal. A daily idempotent sweep that queries `status+endDate` is **self-healing**: if a run is missed, the next run still finds and ends the overdue season. It also naturally handles N+1 start-up (`status:"upcoming", startDate<=now`). Cost is one indexed query/day. This matches the existing `getCurrentEvent` lazy-resolve philosophy and the hard-delete sweep pattern already in the file.
- **Idempotency:** `finalizeSeason` guards on `status==="ended"` and existing HoF/new-record dup-key; start phase filters by `status:"upcoming"`. Partial-failure-safe.
- **Retry/onFailed:** `.on("failed")` + `.on("error")` log loudly. Because finalize mutates many fighters, wrap each fighter's reward in try/catch so one bad fighter doesn't strand the whole season; the season is only marked `ended` after the reward loop completes (a crash mid-loop leaves season `active` → next sweep re-runs finalize, which re-skips already-rewarded fighters via an idempotency marker — **add `rewardedSeasonIds` check**: tag each rewarded record with `rewardedAt` so re-finalize skips already-paid records). **This dual-idempotency (season-status guard + per-record `rewardedAt`) is the launch-blocking correctness requirement QA must verify.**

### Season seeding
- **Launch:** `D:\Projects\GroundAndPound\scripts\seedPvpSeason1.js` — connects to Mongo, calls `pvpSeasonService.seedAllForCycle(1, "iron_circuit", now, "active")` → 4 active Season docs (one per WC), all belts unclaimed, ladders empty. Idempotent (unique index). Run once manually before launch.
- **N+1:** seeded **inside** `finalizeSeason` per weight class (so each WC's next season starts as `upcoming` with `startDate=oldEndDate`); the transition sweep flips it to `active` when its start passes. Twist chosen by `pvpSeasonService.pickTwistForSeason(n)` (deterministic rotation through `TWISTS`, excluding none-special handling; Season 1 hard-coded iron_circuit).

Update the boot `console.log` summary line and the `module.exports` to include the two new queues/workers.

---

## 6. Fight-Engine Reuse Plan

**Reused function:** `resolveFight(player, opponent, opts)` from `D:\Projects\GroundAndPound\utils\fightResolution.js` (NOT `fightService.resolveFightAndApply`, which is bound to NPC fights, camps, injuries, purses, daily caps, nemesis — none apply to PVP). PVP gets its **own** orchestrator (`pvpFightService.resolveFight`) that reuses only the pure simulator, keeping PVE and PVP logic from duplicating (CLAUDE.md: "no duplicated game logic… shared logic gets one home" — the *engine* is shared; the *wrapping* is separate by necessity since the systems differ).

**Gameplan stat-weighting (where + how):**
1. Load attacker Fighter + defender Fighter docs (full stats).
2. Build **throwaway weighted stat copies** — never persisted (mirrors `fightService.js:561` `fightPlayer = {...fighter.toObject()}` pattern):
   ```
   function weightedStats(fighter, gameplan) {
     const w = GAMEPLAN_WEIGHTS[gameplan] || {};
     const copy = { ...fighter.toObject() };
     for (const k of ["str","spd","leg","wre","gnd","sub","chn","fiq"]) {
       if (typeof copy[k]==="number" && w[k]) copy[k] = Math.round(copy[k]*w[k]); // no clamp to 100 needed for sim; clamp ≥1
       copy[k] = Math.max(1, copy[k] ?? 10);
     }
     copy.stamina = copy.maxStamina ?? 100;  // stamina is fight-time
     return copy;
   }
   ```
   Attacker uses `gameplan` (from request); defender uses `defenderRecord.defenseGameplan`.
3. Call `resolveFight(weightedAttacker, weightedDefender, { playerName, opponentName, ctx:{ playerOvr, opponentOvr, ... } })`. The "player" slot = attacker (so `winner==="player"` means attacker won).

**Output → PVP enum mapping** (engine outcomes from `fightResolution.js:804-840`):
- `KO/TKO` → method `ko`, attacker win.
- `Submission` → method `submission`, attacker win.
- `Decision (unanimous)` / `Decision (split)` → method `decision`, attacker win.
- `Loss (KO/TKO)` → method `ko`, defender win. `Loss (submission)` → `submission`, defender win. `Loss (decision)` → `decision`, defender win.
- `Draw` → method `draw`, no winner. **Brief's PVPFight.method enum is decision|ko|submission and DP draw=0; add `"draw"` to the enum** (engine can produce draws via `DRAW_CHANCE`/even scorecard). Draw → both DP changes 0, no streak change, no rivalry progress, no promotion. (Flagged in §9.)

**Resolution sequence (single orchestrator call, ordered; idempotent):**
1. **Idempotency lock** (prevent async double-submit): acquire Redis lock `pvp:fight:lock:{attackerId}` with `SET NX PX 10000` before any mutation. If not acquired → 429 `duplicate_in_flight`. Release in `finally`. (Redis already wired via `lib/redis`.) Rationale: there is no "accepted fight" row to guard against like PVE; the request both creates and resolves, so the lock is the only double-apply guard.
2. Load attacker fighter; **energy check** `energy.current >= 15` else 402.
3. Load season (must be `active`), attacker record (`getOrCreateRecord`), defender fighter + defender record (must exist, same season/WC, not self).
4. Compute `repeatCount` = `PVPFight.countDocuments({attackerId, defenderId, seasonId, fightAt >= startOfIsoWeekUTC})` (count BEFORE writing this fight).
5. Determine `isBeltHolderFight` = defender is current #1 in champion division this season.
6. Run engine → outcome/method/winner.
7. **Rivalry first** (so resolved bonus applies this fight): if attacker won, `pvpRivalryService.processRivalry` AFTER we know win, but the +25 needs to be in DP calc → compute rivalry **win count + 1** (this fight) to decide `isRivalryResolved` *before* DP calc, then persist the rival doc after. (i.e., predict the 3rd-win condition: `priorWins = count(winner=att,loser=def); isRivalryResolved = isWin && priorWins===2`.)
8. `pvpDpService.computeDp(...)` for attacker; defender DP = computeDp with `isAttacker:false` (loss -28, or 0 on attacker-loss-means-defender-win → defender WIN gives defender +120? **Brief says defenderDpChange ≤0** — defender never gains DP from a defense. So: if attacker wins → attacker gains, defender loses (-28, floored). If attacker loses → attacker loses (-55, floored), defender change = 0 (defense held, no gain — brief: defenderDpChange ≤0, and "Defense held" feed has no DP). Draw → both 0.) **This is explicit: a successful defender does NOT gain DP.** Confirm with QA against brief (`defenderDpChange ≤0`).
9. Apply DP+division to both records (`applyDpAndDivision`), decrement shields, update wins/losses/streak/longestStreak/peakDp, set `lastFightAt=now`, refresh OVR snapshot + division cache.
10. Persist rival doc changes.
11. Deduct 15 energy from attacker (`energy.current -= 15`, mark/save).
12. Write `PVPFight` doc (all before/after fields, breakdown, flags, `wasDefenseWhileOffline:true` always for the defender, `defenderSeen:false`).
13. **Feed entries** via `activityLogService.log`: attacker `pvp_win`/`pvp_loss`; defender `pvp_defended` (attacker lost) / `pvp_defense_loss` (attacker won); plus `pvp_promoted`, `pvp_rivalry_set`, `pvp_rivalry_resolved` as applicable.
14. Save both fighters + both records (per-document saves; **order: records → fighters → fight doc → feed**, with feed/fight failures non-fatal like `activityLogService` already is).
15. Release lock; return DTO.

**No Mongo multi-doc transaction** is used (the rest of the codebase doesn't use sessions; `fightService` saves sequentially). The Redis lock + the fact that PVPFight is the *last* authoritative write means a mid-sequence crash leaves no PVPFight row → the fight "didn't happen" from the player's view, but records may be partially mutated. **Mitigation (documented risk §9):** write order puts record mutations close together and the lock prevents concurrent retries; accept eventual-consistency at this scale. If QA deems it unacceptable, wrap steps 9–12 in a `mongoose.startSession()` transaction (requires replica-set Mongo — verify availability before promising this).

---

## 7. Frontend Contract

Base under `D:\Projects\GroundAndPound\frontend\src\components\pvp\`. Hooks under `frontend/src/hooks/`. API methods added to `frontend/src/api.js`.

### `api.js` additions (all via existing `request()` which injects auth + base URL):
```
pvpLadder:(wc,seasonId,page=1,limit=25)=>request(`/pvp/ladder/${wc}/${seasonId}?page=${page}&limit=${limit}`),
pvpRecord:(playerId)=>request(`/pvp/record/${playerId}`),
pvpOpponents:()=>request(`/pvp/opponents`),
pvpFight:(body)=>request(`/pvp/fight`,{method:"POST",body:JSON.stringify(body)}),
pvpFights:(seasonId,page=1,limit=25)=>request(`/pvp/fights/${seasonId}?page=${page}&limit=${limit}`),
pvpDefenseResults:(ack=true)=>request(`/pvp/defense-results?ack=${ack?"true":"false"}`), // ack=false peeks (no mark-seen); used for the offline-defense nav dot/banner. ack=true marks seen — called only on "View defense report".
pvpSetDefenseGameplan:(gameplan)=>request(`/pvp/defense-gameplan`,{method:"POST",body:JSON.stringify({gameplan})}),
pvpHof:(wc)=>request(wc?`/pvp/hof?weightClass=${wc}`:`/pvp/hof`),
pvpCurrentSeason:(wc)=>request(`/pvp/season/current/${wc}`),
```

### Component tree (reference mocks: `gnp_pvp_all_screens.html`, `gnp_pvp_hub_full.html`, `gnp_pvp_season_transition.html`):
- `pvp/PvpHub.jsx` — top container, 5 tabs (Ladder / Fight / History / Season Rewards / Hall of Fame). Owns the current season (from `pvpCurrentSeason(fighter.weightClass)`) and the season-end/new-season modal trigger (first PVP visit after a season ended → mounts `SeasonEndModal` then `NewSeasonModal`). Calls `pvpCurrentSeason`.
- `pvp/tabs/LadderTab.jsx` — `pvpLadder`. Renders rows; when `poolCount < 5` in your division, mounts `pvp/EmptyState.jsx` (screen 7: real pool count, belt unclaimed, repeat-rule explainer, Fight CTA).
- `pvp/tabs/FightTab.jsx` — `pvpOpponents` → list of candidate cards → selecting one opens `pvp/PreFight.jsx`.
- `pvp/PreFight.jsx` (screen 2) — VS header (both division/OVR/DP), 3 gameplan cards (selectable, weights shown), opponent intel panel, rival/belt flags, Fight button with 15-energy cost. Submits `pvpFight({defenderId,gameplan,seasonId,weightClass})` → on success renders `pvp/FightResult.jsx`.
- `pvp/FightResult.jsx` (screen 3) — win/loss header, large DP swing + breakdown line (from `dpBreakdown`), rank before→after arrow, contextual banners (streak/rivalry/promotion via `flags`), DP history bar, actions Fight Again / Back to Ladder.
- `pvp/tabs/HistoryTab.jsx` — `pvpFights(seasonId)` paginated.
- `pvp/tabs/SeasonRewardsTab.jsx` — derived from `pvpConfigFront.REWARDS` (static, mirrors backend const) + your current division → shows what you'd earn.
- `pvp/tabs/HallOfFameTab.jsx` — `pvpHof`.
- `pvp/DefenseResults.jsx` (screen 4) — `pvpDefenseResults` (rows per unread defense, half-rate noted) + default-gameplan picker (`pvpSetDefenseGameplan`). Surfaced as a banner/badge on the hub when `unreadCount>0`.
- `pvp/SeasonEndModal.jsx` (screen 5) — placement, rewards, badge, reset explanation; View Leaderboard / Start New Season. Data from the ended season's record + HoF (via `pvpRecord` history).
- `pvp/NewSeasonModal.jsx` (screen 6) — belt-unclaimed banner, twist name+effect (`season.twistName/twistEffect`), reset summary, Enter the Ladder.
- `pvp/EmptyState.jsx` (screen 7).

### Hooks (`frontend/src/hooks/`):
- `usePvpSeason(weightClass)` — fetches current season + your record; exposes `silentRefetch`.
- `usePvpOpponents()`, `usePvpLadder(wc,seasonId,page)`, `usePvpHistory(seasonId,page)`, `usePvpDefenseResults()`.
- **Silent-refetch pattern (CLAUDE.md "no flicker"):** each hook keeps `loading` true only on the *initial* load; subsequent refetches (after a fight) set a separate `refreshing` flag and keep prior data on screen — mirror `CareerFeed.jsx:89-111` (`cancelled` guard, `loading` only when `entries.length===0`). Every hook handles loading/success/error (CLAUDE.md frontend rule).

### Nav mounting (`frontend/src/App.jsx`):
- Add to `NAV_ITEMS` (line 65): `{ id:"pvp", label:"Proving Ground", icon:<Swords … />, active:true }` (Swords already imported; pick a distinct icon if Swords is reused for Fight — e.g. `Trophy` or `Crosshair`).
- Add render branch alongside `activeTab === "events"` (App.jsx:1365): `{activeTab === "pvp" && <PvpHub fighter={fighter} onNavigate={handleNavTab} />}`.
- Mobile nav: add a `m-nav-item` entry mirroring the rankings one (App.jsx:1536).

### `PvpHistoryCard.jsx` wiring (`frontend/src/components/career/PvpHistoryCard.jsx`):
Currently a static empty state. Rewire: the Career Profile flow already has the fighter id; call `api.pvpRecord(fighterId)` (or have `useCareerProfile` include it) → render `history` rows: season name + final division (colored via `divisionColor`) + final DP or "Active"; HoF badge if `isBeltHolder`. Empty state retained when `history` is empty. **Decision: fetch inside the card with the silent-loading pattern** (it receives `fighterId`), so the Career profile payload doesn't have to change shape server-side.

### `CareerFeed.jsx` registry additions (`frontend/src/components/CareerFeed.jsx:20`):
Add 9 entries to `EVENT_CONFIG` (frontend-dev): `pvp_win`(GREEN,Trophy,"PVP Win"), `pvp_loss`(RED,X,"PVP Loss"), `pvp_defended`(GREEN,ShieldCheck,"Defended"), `pvp_defense_loss`(RED,Shield,"Defense Lost"), `pvp_promoted`(PURPLE,ArrowUp,"Promoted"), `pvp_rivalry_set`(RED,Flame,"Rivalry"), `pvp_rivalry_resolved`(PURPLE,Swords,"Rivalry"), `pvp_season_end`(GOLD,Trophy,"Season End"), `pvp_belt_won`(GOLD,Crown,"PVP Belt"). **The 9 `pvp_*` types must also be added to the `activityLogModel.js` enum** (currently fixed list, line 12-17) — see §9.

### Shared types the frontend needs from the backend:
- `consts/pvpConfig.js` values (DIVISIONS colors/thresholds, REWARDS, TWISTS, GAMEPLAN_WEIGHTS) are duplicated as a **frontend mirror `frontend/src/components/pvp/pvpConst.js`**. CLAUDE.md says "shared types defined once and imported" — but this is a Node CommonJS `consts/` file the Vite SPA cannot import across the server/frontend boundary (separate build). **Decision (documented exception):** the frontend mirrors only the *display* constants (colors, reward table, twist labels); all *authoritative* values (dp results, division derivation) come from API responses (every response already embeds `divisionColor`, `dpBreakdown`, `twistName`). The mirror is display-only and the API is the source of truth for anything that affects state — so drift can only cause cosmetic mismatch, never logic divergence. Backend response DTOs intentionally embed `divisionColor`/`twistName`/`promoteAt`/`divisionFloor` so the FE rarely needs the mirror at all.

---

## 8. Task Ordering

**Backend-dev sequence (each unblocks the next):**
1. `consts/pvpConfig.js` (+ pure helpers) — unblocks everything; **first, and unit-test the helpers + `pvpDpService` in isolation**.
2. Models (Season, PVPRecord, PVPFight, PVPRival, HallOfFame) + indexes.
3. `pvpDpService` (pure) + tests for the ordered-modifier algorithm.
4. `pvpRecordService`, `pvpSeasonService`, `pvpRewardService`, `pvpDecayService`, `pvpRivalryService`, `pvpMatchmakingService`.
5. `pvpFightService` orchestrator (depends on engine reuse + all above).
6. Controller + routes + mount in `app.js`.
7. Scheduler: add 2 queues/workers + register in `startEnergyIncrementScheduler`.
8. `scripts/seedPvpSeason1.js`.
9. `activityLogModel.js` enum extension (the 9 `pvp_*` types) — required before any feed write fires, do early.

**Frontend-dev sequence (can start in parallel after the contract above is frozen; mock-driven, no live backend needed for layout):**
1. `api.js` methods + `pvpConst.js` display mirror.
2. Hooks.
3. `PvpHub` shell + the 5 tabs (Ladder/Fight/History/Rewards/HoF) against mock-shaped data.
4. `PreFight` + `FightResult` (core loop).
5. `DefenseResults`, `EmptyState`.
6. `SeasonEndModal` + `NewSeasonModal`.
7. Nav mount in `App.jsx`; `CareerFeed.jsx` registry; `PvpHistoryCard.jsx` rewire.
**FE is blocked on real data only for integration** — endpoint shapes in §3 are the contract; build against them.

**Top QA risks (priority order):**
1. **Season-end / transition-sweep correctness (launch-critical):** belt-holder selection (#1 in champion w/ ≥1 fight), reward-replacement (belt REPLACES champion, no stack), HoF idempotency, soft-reset division mapping, N+1 seeding, dual-idempotency (`status==="ended"` + per-record `rewardedAt`) so a re-run never double-pays. **Must be tested before launch (brief mandate).**
2. **DP-calc modifier order + clamps:** ordered belt→rivalry→bracket→twist→streak→repeat, MIN_WIN_GAIN 1, MAX_LOSS -100, defender ≤0 / never gains, DP floor on loss, set-to-floor (no carry) on promotion.
3. **Promotion-shield / floor:** shield=3 on promote, decrement every fight, no demotion while shield>0, no mid-season division demotion.
4. **Repeat-penalty ISO-week counting:** correct UTC ISO-week boundary; 2nd=×0.5, 3rd+=×0.25; counts via PVPFight before writing the current row.
5. **Idempotent fight resolution / async double-submit:** Redis lock prevents two concurrent `/pvp/fight` from the same attacker double-spending energy / double-applying DP; partial-write recovery.

---

## 9. Risks / Brief-vs-Code Conflicts

1. **`/api/pvp` vs `/pvp` (resolved):** codebase has no `/api` prefix. Using `/pvp`. If the user insists on `/api/pvp`, change only the mount line — but it would be the only `/api`-prefixed router. **Flagged.**
2. **Seasonal badges can't live in `consts/badgeCatalog.js`** (static, finite). **Decision/path:** push synthesized entries directly into `fighter.badgesEarned` (the existing ledger, `fighterModel.js:133`) with deterministic ids `pvp_challenger_s3` / `pvp_belt_s3_featherweight` and `context` = season label. A **runtime resolver** `consts/pvpBadges.js` (`resolvePvpBadge(id) → {name,icon,color,description}` by parsing the id pattern) is consulted by (a) `badgeService.buildBadgeProfile` — add a branch: any `badgesEarned` id starting `pvp_` not found in the static catalog is resolved at read time and injected into a "Proving Ground" category; (b) the PVP screens. This keeps `badgesEarned` the single store and avoids unbounded static catalog growth. **`badgeService.evaluateBadges` is NOT used for these** (they're awarded imperatively by `pvpRewardService`, not condition-evaluated). Frontend badge grid must tolerate ids it doesn't recognize → fall back to the resolver.
3. **"fame" must go through `notorietyService.applyNotorietyDelta`** (not `notoriety.score` directly) — confirmed signature `(fighter, delta, {code, reason, meta})`. Use code e.g. `"PVP_SEASON_REWARD"`. Note: notoriety has a freeze mechanic (`isFrozen`) — season rewards should pass `{skipFreezeBlock:true}` so a frozen (3-loss) fighter still gets PVP fame (as `fightService` does for belt/nemesis). **Flagged for backend-dev.**
4. **`energyDrinks` field ambiguity:** brief says top-level `energyDrinks`; canonical is `fighter.inventory.energyDrinks` granted via `shopService.grantEnergyDrinks(fighter, n)` (clamps, `markModified("inventory")`). Use the shop helper. **Flagged.**
5. **`activityLogModel.js` enum is a fixed list** (lines 12-17) — the 9 `pvp_*` types **must be added** or `ActivityLog.create` will throw validation and the feed write (though swallowed) silently drops every PVP feed entry. **Backend-dev: extend the enum.** (CareerFeed registry add is the FE half.)
6. **Draw handling:** engine can return `Draw`; brief's method enum omits it but DP rules mention "Draw 0". Add `"draw"` to PVPFight.method enum; draw = both DP 0, no streak/rivalry/promotion effect. **Flagged.**
7. **Defender never gains DP** (`defenderDpChange ≤0`): a successful defense yields the defender **0** DP (feed `pvp_defended`), not a win bonus. Confirmed against brief; ensure DP service implements "attacker loss → defender change 0", not "+120". **QA-critical.**
8. **OVR snapshot staleness on PVPRecord:** matchmaking/ladder use a denormalized `record.overallRating` refreshed each fight. A player who trains up between PVP fights shows a stale OVR until their next PVP fight. Acceptable (refresh also on own-record read-through). **Documented denormalization.**
9. **Async double-submit / state leakage:** the request both creates and resolves the fight with no prior "accepted" row, so the Redis `SET NX` lock per attacker is the *only* guard against double energy-spend / double-DP. Without it, two near-simultaneous clicks resolve two fights. **Mandatory, not optional.** Also: controllers must derive attacker from `req.user.fighterId` only — never trust a body-supplied attacker — else one player could fight *as* another.
10. **No Mongo transactions in this codebase** → partial-write window in resolution (records mutated, crash before PVPFight written). Mitigated by write-ordering + lock; full ACID would need a replica-set + `startSession`. **Verify Mongo deployment is a replica set before promising transactional resolution; otherwise accept the documented window.**
11. **Weight-class casing match (launch-blocking):** the season seed `weightClass` and the `fighter.weightClass` filter must use identical casing to `consts/gameConstants.WEIGHT_CLASSES`. Backend-dev must verify the 4 PVP classes exactly match stored fighter values before the seed script runs, or matchmaking returns empty pools.
12. **Twist has no `dpBreakdown` slot:** the brief's breakdown object omits a twist line. Twist contribution is folded into the running DP value and surfaced via `twistApplied`/`twistName` on the fight DTO + season banner, not a breakdown line. **Documented.**

---

### Files this work touches (all absolute)

New backend: `D:\Projects\GroundAndPound\consts\pvpConfig.js`, `consts\pvpBadges.js`, `models\seasonModel.js`, `models\pvpRecordModel.js`, `models\pvpFightModel.js`, `models\pvpRivalModel.js`, `models\hallOfFameModel.js`, `services\pvpRecordService.js`, `services\pvpSeasonService.js`, `services\pvpRewardService.js`, `services\pvpDpService.js`, `services\pvpMatchmakingService.js`, `services\pvpFightService.js`, `services\pvpRivalryService.js`, `services\pvpDecayService.js`, `controllers\pvpController.js`, `routes\pvpRoutes.js`, `scripts\seedPvpSeason1.js`.

Modified backend: `D:\Projects\GroundAndPound\app.js` (mount `/pvp`), `modules\scheduler.js` (2 queues/workers), `models\activityLogModel.js` (enum +9), `services\badgeService.js` (pvp_* resolver branch in `buildBadgeProfile`).

Reused (read-only) backend: `utils\fightResolution.js` (`resolveFight`), `services\notorietyService.js` (`applyNotorietyDelta`), `services\shopService.js` (`grantEnergyDrinks`), `services\activityLogService.js` (`log`), `lib\redis.js`.

New frontend: `D:\Projects\GroundAndPound\frontend\src\components\pvp\` (PvpHub, PreFight, FightResult, DefenseResults, SeasonEndModal, NewSeasonModal, EmptyState, `pvpConst.js`, `tabs\LadderTab.jsx`, `tabs\FightTab.jsx`, `tabs\HistoryTab.jsx`, `tabs\SeasonRewardsTab.jsx`, `tabs\HallOfFameTab.jsx`), `frontend\src\hooks\usePvpSeason.js` (+ sibling hooks).

Modified frontend: `frontend\src\api.js` (9 methods), `frontend\src\App.jsx` (NAV_ITEMS + render branch + mobile nav), `frontend\src\components\CareerFeed.jsx` (EVENT_CONFIG +9), `frontend\src\components\career\PvpHistoryCard.jsx` (wire to `pvpRecord`).
agentId: af6892fba362d0ea4 (use SendMessage with to: 'af6892fba362d0ea4' to continue this agent)
<usage>subagent_tokens: 107037
tool_uses: 29
duration_ms: 337661</usage>