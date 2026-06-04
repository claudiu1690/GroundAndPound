# Ground & Pound — PvP System v1 (Beta): Implementation Contract

**Author:** architect agent. **Status:** ready for backend-dev + frontend-dev.
**Source of truth for behavior:** `docs/PvP_System_Spec_v1_revised.md`. This document maps that spec onto the real code and is the binding contract; where the two diverge, this document's bindings win and the divergence is flagged in §8.

## Assumptions (stated because the spec assumed code that differs)

1. **Route mount has no `/api` prefix.** Verified in `app.js` (`app.use("/fighters", authMiddleware, fighterRoutes)`). Every spec path `/api/pvp/...` is bound to **`/pvp/...`**, mounted as `app.use("/pvp", authMiddleware, pvpRoutes)`.
2. **`fighterId` comes from the JWT, not the URL.** `authMiddleware` sets `req.user.fighterId`. The attacker is always `req.user.fighterId`; we do NOT take attacker id from the client. (PvP is more sensitive than PvE — you spend energy and damage a second player — so the actor must be server-trusted.)
3. **`saveWithVersionRetry` does not exist.** It must be **created** as a new util (§4.0).
4. **`jobs/` and `workers/` directories do not exist.** All BullMQ queues/workers are declared inline in `modules/scheduler.js`, with batch bodies in services (e.g. `notorietyService.runNotorietyDecayBatch`). The two PvP jobs follow THIS pattern, not the CLAUDE.md `jobs/`+`workers/` layout (CLAUDE.md is stale here; code is binding).
5. Constants live in `consts/gameConstants.js`, `consts/notorietyConfig.js`, `consts/injuryDefinitions.js` (all verified present).
6. **No `isPremium` flag exists.** Daily cap uses `PVP_DAILY_CAP_FREE = 5` / `PVP_DAILY_CAP_PREMIUM = 7` + an `isPremium(fighter)` helper that **returns false in v1** (uniform cap = 5), with a marked extension point.
7. **`resolveFight` returns `{ outcome, winner, rounds, playerHealthAfter, ... }`** where `winner ∈ {"player","opponent","draw"}`. It does NOT return `opponentHealthAfter`. Correct binding: `attackerWon = result.winner === "player"`. Defender HP is applied via the method table, not read from the engine.

---

## 1. Scope & non-goals

**In scope (v1):** `pvp` subdoc + `PvpFight` collection; ladder (rank points → win% → recency); onboarding shield (<3 fights = not attackable); ±8 OVR bracketing; offensive-only attack flow (defender = persisted stats/OVR/health); energy cost = tier `fightEnergyCost`; daily cap (5); defender HP via method table + both roll injuries; loser `attackable_after` cooldown (KO 12h / Sub 6h / Dec 3h); down-weighted rewards (iron 45/25/15%, fame 40% × `gapFactor`); rank points via reused `calcDelta`; belt = #1 flag + top-10 gate + decay/interim nightly job; lazy reposition + nightly authoritative recalc; 2 Gazette belt stories + `/pvp/pending`; 5 endpoints; PvP tab (Ladder + History).

**OUT (`[v1.1 — deferred]`) — do NOT build:** defensive camp (no `pvp.defensive_camp` path, no auto-firing sessions, no two-sided `resolveFight`, no `opponentHealthAfter`); `GET/PATCH /pvp/defensive-camp` + Defensive Camp UI; defender-result & belt-under-pressure Gazette stories; any change to PvE records/ranking/tier/title-shot from PvP.

---

## 2. Data model

### 2.1 Fighter `pvp` subdocument — add to `models/fighterModel.js` (snake_case keys, load-bearing)
```js
pvp: {
    wins:          { type: Number, default: 0 },
    losses:        { type: Number, default: 0 },
    draws:         { type: Number, default: 0 },
    total_fights:  { type: Number, default: 0 },
    rank_points:   { type: Number, default: 0, min: 0 },
    ladder_rank:   { type: Number, default: null },   // null until 3 fights
    is_champion:   { type: Boolean, default: false },
    attackable_after: { type: Date, default: null },  // set on every loss; null = attackable
    last_pvp_fight_at: { type: Date, default: null },
    attacks_today:     { type: Number, default: 0 },
    attack_day_key:    { type: String, default: null },  // toDateString() idiom
    belt_defenses: { type: Number, default: 0 },
    belt_won_at:   { type: Date, default: null },
    belt_lost_at:  { type: Date, default: null },
    belt_challenge_floor: { type: Number, default: 10 },  // widens to 20
    interim_booked:       { type: Boolean, default: false },
    // [v1.1 — deferred] defensive_camp: { type: [String], default: [] }  // DO NOT IMPLEMENT
},
```
Do NOT add `is_untouchable` / `untouchable_reason`.

### 2.2 New model `models/pvpFightModel.js` (collection `pvpfights`)
```js
{
    attacker_id:  { type: ObjectId, ref: "Fighter", required: true, index: true },
    defender_id:  { type: ObjectId, ref: "Fighter", required: true, index: true },
    attacker_camp: { type: [String], default: [] },
    defender_camp: { type: [String], default: [] },   // [v1.1] empty in v1
    result: {
        winner_id: { type: ObjectId, ref: "Fighter", default: null }, // null on draw
        method:    { type: String, enum: ["KO", "Submission", "Decision", "Draw"], required: true },
        round:     { type: Number, default: null },
    },
    belt_changed:               { type: Boolean, default: false },
    attacker_points_delta:      { type: Number, default: 0 },
    defender_points_delta:      { type: Number, default: 0 },
    attacker_iron_earned:       { type: Number, default: 0 },
    defender_iron_earned:       { type: Number, default: 0 },
    attacker_notoriety_earned:  { type: Number, default: 0 },
    defender_notoriety_earned:  { type: Number, default: 0 },
    attacker_ovr_at_fight:      { type: Number, default: 0 },
    defender_ovr_at_fight:      { type: Number, default: 0 },
    gap_factor:                 { type: Number, default: 1 },
    fought_at:                  { type: Date, default: Date.now },
    seen_by_attacker:           { type: Boolean, default: true },
    seen_by_defender:           { type: Boolean, default: false },
}
// schema option: { timestamps: true }
```
**Method normalization:** reuse `rankingService.buildFightResultFromOutcome(outcome).method` (`"KO"|"SUB"|"DEC"`), map `SUB→"Submission"`, `KO→"KO"`, `DEC→"Decision"`, `"Draw"` when `outcome === "Draw"`.

### 2.3 Indexes
`pvpFightModel.js`: `{ attacker_id:1, fought_at:-1 }`, `{ defender_id:1, fought_at:-1 }`, `{ seen_by_defender:1 }`.
`fighterModel.js` (append): `{ "pvp.rank_points":-1, "pvp.wins":-1 }`, `{ "pvp.is_champion":1 }`, `{ "pvp.attackable_after":1 }`, `{ "pvp.last_pvp_fight_at":1 }`.

### 2.4 Migration / backfill
Add `backfillPvpSubdocForLegacyFighters()` to `app.js` (mirror `backfillTutorialForLegacyFighters`); call in the `mongoose.connect().then()` block. `updateMany({ pvp: { $exists: false } }, { $set: { pvp: { ...full default object... } } })`. Backend-dev territory.

### 2.5 Redis / BullMQ
No new Redis keys (energy reuse only). Daily cap is Mongo-backed (`pvp.attacks_today` + `pvp.attack_day_key`), NOT Redis. Two new BullMQ queues in `modules/scheduler.js`: `pvp-ladder-recalc`, `pvp-belt-decay`.

---

## 3. API contract

Mounted at `app.use("/pvp", authMiddleware, pvpRoutes)`. All require JWT. Attacker identity = `req.user.fighterId`.
**Error envelope:** `{ message, code }` for all validation errors (frontend reads `data.code`). Internal: `res.status(500).json({ message: "Internal server error" })` (no code/leak).

### 3.1 `GET /pvp/ladder`
Ranked players (`pvp.total_fights >= 3`), sorted rank_points desc → win% desc → last_pvp_fight_at desc.
- Query: `page` (1), `limit` (25, max 100), optional `search` (name substring, case-insensitive).
- 200:
```json
{
  "page": 1, "limit": 25, "total": 137,
  "champion": { "fighterId": "...", "name": "...", "ladder_rank": 1, "ovr": 71, "style": "Boxer", "record": "12-3-0", "rank_points": 48 },
  "me": { "fighterId": "...", "ladder_rank": 14, "ovr": 55, "rank_points": 12, "attacks_today": 2, "attack_cap": 5, "is_ranked": true },
  "rows": [
    { "fighterId": "...", "ladder_rank": 2, "name": "Jane \"Hammer\" Doe", "ovr": 70, "style": "Wrestler",
      "record": "10-2-1", "rank_points": 41, "is_champion": false, "is_me": false,
      "in_challenge_zone": true, "attackable": true, "block_reason": null }
  ]
}
```
`block_reason` per row: `"out_of_bracket"` if `|myOvr − rowOvr| > 8`; `"target_recovering"` if `attackable_after > now`; `"self"` if caller. `attackable = block_reason === null`. Unranked players never appear as rows.
- Errors: 401, 500.

### 3.2 `GET /pvp/ladder/:fighterId`
- 200:
```json
{
  "fighterId": "...", "name": "...", "nickname": "The Reaper", "ovr": 55, "style": "Boxer", "promotionTier": "Regional Pro",
  "rank_points_preview": { "on_win": 3, "on_loss": -1 },
  "pvp": { "wins": 8, "losses": 4, "draws": 1, "total_fights": 13, "rank_points": 12, "ladder_rank": 14,
           "is_champion": false, "belt_defenses": 0, "belt_challenge_floor": 5, "current_streak": -2,
           "is_attackable_now": true, "attackable_after": null }
}
```
HP and injuries NEVER returned. Fight Night additions:
- `nickname` (top-level): `f.nickname || null`.
- `rank_points_preview` (top-level): what the VIEWER (`req.user.fighterId`, passed by the controller) would gain/lose attacking this target. `{ on_win, on_loss }` are signed ints (`calcDelta({isWin/isLoss, method:"DEC"}, viewerRank, targetRank)`). **Fallback to `{ on_win: null, on_loss: null }` when the viewer has no `ladder_rank` yet** (unranked viewer) — `calcDelta` does not throw on a null self-rank but coerces it to `0`, producing a misleading upset `on_loss`; frontend renders "—".
- `pvp.belt_challenge_floor`: int (`?? PVP_BELT_FLOOR_DEFAULT`).
- `pvp.current_streak`: signed int. +N current win streak, −N current loss streak, 0 if the latest fight was a draw or there's no history (newest-20, leading run, draw breaks the run).
- Errors: `404 { message:"Fighter not found", code:"fighter_not_found" }`, 500.

### 3.3 `POST /pvp/attack/:defenderId`
- Body: `{ "offensive_camp": ["SESSION_ID", ...] }` (max = attacker-tier `CAMP_SLOT_CONFIG` normal slots; empty allowed).
- Attacker = `req.user.fighterId`.
- Validation order (each → 400 `{message,code}` unless noted):

| Check | Condition | HTTP | code |
|---|---|---|---|
| Self-attack | `attackerId === defenderId` | 400 | `cannot_attack_self` |
| Defender exists | not found | 404 | `fighter_not_found` |
| Onboarding shield | `defender.pvp.total_fights < 3` | 400 | `target_not_attackable` |
| Cooldown | `defender.pvp.attackable_after > now` | 400 | `target_recovering` |
| Attacker injured | `isFightBlocked(attacker)` truthy | 400 | `attacker_injured` |
| OVR bracket | `abs(attackerOvr − defenderOvr) > 8` | 400 | `out_of_bracket` |
| Daily cap | `attacks_today >= cap` (after `ensurePvpDailyState`) | 400 | `daily_pvp_cap_reached` |
| Energy | `deductEnergy` throws "Not enough energy" | 400 | `insufficient_energy` |
| Camp size | `offensive_camp.length > maxSlots` | 400 | `invalid_camp` |

Energy deducted LAST (after all non-energy checks). Cap counter increments only on successful resolution.
- 200:
```json
{
  "result": { "outcome": "KO/TKO", "winner": "attacker", "method": "KO", "round": 2, "rounds": [], "commentary": ["..."] },
  "belt": { "changed": true, "newChampion": true },
  "rank": { "attacker_points_delta": 4, "attacker_rank_points_after": 16, "attacker_ladder_rank_after": 9, "attacker_ladder_rank_before": 13 },
  "rewards": { "iron_earned": 720, "notoriety_earned": 96, "gap_factor": 0.8 },
  "energy": { "current": 85, "max": 100 },
  "defender": {
    "name": "Rico \"The Wall\" Vega", "nickname": "The Wall", "ovr": 53, "style": "Wrestler",
    "record_after": "10-6-1", "ladder_rank_after": 11, "is_champion_after": false, "rank_points_after": 8
  },
  "health": {
    "attacker": { "before": 100, "after": 78 },
    "defender": { "before": 92, "after": 41 }
  },
  "campBreakdown": {
    "rating": "B",
    "sessions": [
      { "label": "Takedown Defence Drilling", "sessionType": "TAKEDOWN_DEFENCE", "matchStatus": "MATCHED", "triggered": true, "triggerCount": 2, "description": "..." }
    ],
    "wildcard": null
  },
  "streak": { "attacker_current": 5, "milestone": 5 },
  "cooldowns": { "attacker": null, "defender": "2026-06-03T18:00:00.000Z" },
  "defenderConsequencesApplied": true,
  "fighter": { /* toPublicFighter(attacker) */ },
  "pvpFightId": "..."
}
```
`winner` remapped engine `"player"/"opponent"/"draw"` → `"attacker"/"defender"/"draw"`. Fight Night additions:
- `rank.attacker_ladder_rank_before`: attacker `pvp.ladder_rank` captured BEFORE consequences (`?? null`).
- `defender` block: captured AFTER all mutation inside `processPvpResult` (record/rank/belt already applied). `record_after` = `recordString(defender.pvp)`; `ladder_rank_after` (`?? null`); `is_champion_after`; `rank_points_after`.
- `health`: `{ attacker:{before,after}, defender:{before,after} }`. `before` captured pre-engine in `initiatePvpAttack`; attacker `after` = `result.playerHealthAfter` clamped ≤100; defender `after` = post-`applyHpLoss`. **Bot-defender guard:** a bot defender skips `applyHpLoss` and is pinned at 100, so `defender.before === after === 100` even on a KO — frontend suppresses the defender HP bar in that case.
- `campBreakdown`: `{ rating, sessions[], wildcard }`. `rating` from shared `campService.gradeOffensiveCamp` (same formula as PvE). `sessions` mapped from engine `result.sessionBonuses` (with `triggered`/`triggerCount`), exactly like PvE. `wildcard` is **always `null` in v1** (attack passes `wildcard:null`).
- `streak`: `{ attacker_current: signed int, milestone: number|null }`. `attacker_current` is the attacker's PvP streak computed (via the same `computeCurrentStreak` walk as §3.2) AFTER this fight is persisted, so a 5th straight win reads `5`. `milestone` = `attacker_current` when it is a positive win streak that just hit `{3,5,10,15}`, else `null` (powers the "5-fight win streak!" notice).
- `cooldowns`: `{ attacker: ISO string|null, defender: ISO string|null }`. The loser's `pvp.attackable_after` set THIS fight (gated on outcome, not the persisted field, so a stale prior cooldown isn't surfaced); the winner and both draw participants are `null`. When the attacker wins, `defender` is set (lets the summary's Rematch button disable-with-timer); when the attacker loses, `attacker` is set ("recovering for ~Nh").
- Errors: all codes above; 401; 500.

### 3.4 `GET /pvp/history`
- Query: `page` (1), `limit` (20, max 50).
- 200:
```json
{ "page": 1, "limit": 20, "total": 31,
  "rows": [ { "pvpFightId": "...", "role": "attacker", "opponent": { "fighterId": "...", "name": "..." },
              "outcome": "win", "method": "KO", "round": 2, "rank_points_delta": 4, "iron_earned": 720,
              "notoriety_earned": 96, "belt_changed": true, "fought_at": "2026-06-03T12:00:00.000Z" } ] }
```
`role` + per-perspective fields computed by comparing caller id to attacker_id/defender_id.
- Errors: 401, 500.

### 3.5 `GET /pvp/pending`
Unseen results where caller was the **defender**. Read-only; does NOT mark seen.
- 200:
```json
{ "count": 2, "rows": [ { "pvpFightId": "...", "attacker": { "fighterId": "...", "name": "..." },
                          "outcome": "loss", "method": "KO", "belt_changed": true, "fought_at": "..." } ] }
```
- Errors: 401, 500.
- **Mark-seen:** `pvpService.markPendingSeen(defenderId)` sets `seen_by_defender = true`, called from `gazetteService.dismissGazette`. Do NOT mark seen in `GET /pvp/pending`.

---

## 4. Service layer — `services/pvpService.js`

### 4.0 New util `utils/saveWithVersionRetry.js` (create)
Save a mongoose doc, catch `err.name === "VersionError"`; on conflict optionally reload by `_id` + re-apply mutations, else retry; throw after `maxRetries` (default 3). Used by PvP saves + lazy reposition.

### 4.1 `gapFactor(ovrDiff)` = `clamp01(1 - Math.max(0, ovrDiff)/15)` where `ovrDiff = attackerOvr - defenderOvr`. Applied to iron AND fame, NOT rank points.

### 4.2 `ensurePvpDailyState(fighter)` — mirror `fightService.ensureDailyFightTierState` (`new Date().toDateString()`): if `attack_day_key !== today`, reset `attacks_today=0`, set key. Mutates in place.

### 4.3 `initiatePvpAttack(attackerId, defenderId, offensiveCampSessions)`
Loads both fighters; runs §3.3 validations in order. Build engine call:
- Camp bonuses via NEW `campService.buildOffensiveBonuses(sessionIds, attackerStyle, defenderStyle)` → returns `sessionBonuses` array (matched/unmatched per `STYLE_SESSION_MAP`) WITHOUT a `Fight`/`Opponent` doc (see §8 #1).
- `resolveFight(attackerStats, defenderStats, { playerStrategy, sessionBonuses, wildcard:null, playerName, opponentName, ctx:{ playerStyle, opponentStyle, tier, playerOvr, opponentOvr } })` — attacker is `player`, defender is `opponent`; `defenderStats` from persisted defender + current `defender.health`.
- `await processPvpResult(...)`; return §3.3 payload.
- Energy via `fighterService.deductEnergy(attackerId, cost)` (the PvE wrapper, keeps snapshot consistent), then `attacks_today += 1`.

### 4.4 `processPvpResult(attacker, defender, result, gapFactor, attackerCamp)`
1. `attackerWon = result.winner === "player"`, `isDraw = result.winner === "draw"`, `defenderWon = result.winner === "opponent"`.
2. `method` normalized (§2.2).
3. Records: increment wins/losses/draws + total_fights both; `last_pvp_fight_at = now` both; draw → both draws++.
4. Rank points (reuse `calcDelta`):
   ```js
   const aRes = { isWin: attackerWon, isLoss: defenderWon, isDraw, method };
   const dRes = { isWin: defenderWon, isLoss: attackerWon, isDraw, method };
   const aDelta = calcDelta(aRes, attacker.pvp.ladder_rank, defender.pvp.ladder_rank);
   const dDelta = calcDelta(dRes, defender.pvp.ladder_rank, attacker.pvp.ladder_rank);
   ```
   `calcDelta` null-guards `opponentRank` (unranked defender → no upset bonus). **Add delta directly** to `rank_points` (higher=better; do NOT route through `updatePlayerRank`/`clampRank`). Floor at 0.
5. Loss cooldown on loser only: `attackable_after = now + {KO:12h, Submission:6h, Decision:3h}[method]`. Draw → none.
6. Defender HP (method table §6.1): attacker HP from `result.playerHealthAfter` (clamp ≤100); defender HP subtract rolled % within band keyed on method + win/loss:
   - Decision: winner −5..10%, loser −15..25%; Submission: winner −5..10%, loser −20..30%; KO/TKO: winner −0..5%, loser −30..50%.
   Reset `healthLastRegenAt = now` for both (matches PvE post-fight).
7. Injuries (both): `rollForFightInjury(fighter.fiq, PROMOTION_TIERS[tier].injuryRiskMult)`, honor `injuryGraceActive`, use `buildInjury`/`applyInjuryToFighter` like `fightService`. KO/Sub loser may take concussion (subject to grace).
8. Rewards (shared pools, down-weighted): `base = PROMOTION_TIERS[tier].signingFee`. Iron: win `round(base*0.45*gapFactor)`, draw `round(base*0.25)` both, loss `round(base*0.15)`. Notoriety (wins only; losses neutral): `notorietyService.applyNotorietyDelta(fighter, round(baseFightNotoriety(tier,method)*0.40*gapFactor), {...})`. Defender perspective uses `gapFactor(defenderOvr-attackerOvr)`.
9. Belt: `isBeltFight = defender.pvp.is_champion && attacker.pvp.ladder_rank != null && attacker.pvp.ladder_rank <= defender.pvp.belt_challenge_floor`.
   - belt fight + attacker won: attacker champion (belt_won_at, reset floor=10/interim=false), defender not champion (belt_lost_at), `belt_changed=true`.
   - belt fight + defended: `defender.belt_defenses += 1`; pay defense bonus (50% × standard PvP win iron & notoriety).
10. Persist `PvpFight` with all deltas/earned/ovr/gap_factor, `attacker_camp`, `seen_by_attacker:true`, `seen_by_defender:false`.
11. `attacker.pvp.attacks_today += 1`.
12. `repositionTwoOnLadder(attacker, defender)`.
13. Save both via `saveWithVersionRetry` (+ `markModified("pvp")`).

### 4.5 `repositionTwoOnLadder(attacker, defender)`
For each with `total_fights >= 3`: assign/recompute `ladder_rank` = `countDocuments({ "pvp.total_fights":{$gte:3}, "pvp.rank_points":{$gt: theirPoints} }) + 1`. O(1)-write optimization; nightly recalc is authoritative.

### 4.6 Query helpers
`getLadder({page,limit,search,viewer})` (aggregation: match total_fights≥3, optional name regex, computed winPct, sort rank_points desc → winPct desc → last_pvp_fight_at desc, skip/limit; decorate rows with block_reason/attackable vs viewer; champion fetched separately). `getPvpProfile`, `getHistory`, `getPending`, `markPendingSeen`.

### 4.7 `isPremium(fighter)` → false in v1. `PVP_DAILY_CAP_FREE=5`, `PVP_DAILY_CAP_PREMIUM=7` (in `consts/pvpConfig.js`). `cap = isPremium(f) ? 7 : 5`.

---

## 5. Jobs — inline in `modules/scheduler.js` (Queue + Worker + repeat, batch bodies in `pvpService`)

### 5.1 `pvp-ladder-recalc` (nightly, jobId `pvp-ladder-recalc`)
`pvpService.runLadderRecalcBatch()`: load all `{ "pvp.total_fights":{$gte:3} }` sorted rank_points desc → winPct desc → last_pvp_fight_at desc; `bulkWrite` `ladder_rank = i+1` (avoid save storm). Set top fighter `is_champion=true` ONLY if no champion currently exists (never silently reassign the belt otherwise).

### 5.2 `pvp-belt-decay` (nightly, jobId `pvp-belt-decay`)
`pvpService.runBeltDecayBatch()`: champion `inactiveDays = daysSince(max(pvp.last_pvp_fight_at, champ.updatedAt))` (no lastLogin field; `updatedAt` is the v1 activity proxy). `>=21` → floor=20, interim=true; `>=14` → floor=20, interim=false; else floor=10, interim=false.

### 5.3 `onFailed` for both: `worker.on("failed", ...)` + `worker.on("error", ...)`; per-record try/catch in batch. Register `.add(...)` in `startEnergyIncrementScheduler`; export queues/workers.

---

## 6. File placement & task ordering

### Backend-dev (server-side only; never `frontend/`)
| File | New/edit | Purpose |
|---|---|---|
| `models/fighterModel.js` | edit | `pvp` subdoc + 4 indexes |
| `models/pvpFightModel.js` | new | PvpFight model + 3 indexes |
| `utils/saveWithVersionRetry.js` | new | optimistic-concurrency save |
| `consts/pvpConfig.js` | new | caps, cooldown hours, HP bands, reward fractions, gap divisor |
| `services/pvpService.js` | new | all logic §4 + batch bodies §5 |
| `services/campService.js` | edit | `buildOffensiveBonuses(...)` decoupled from Fight/Opponent |
| `services/gazetteService.js` | edit | `buildPvpBeltStory`; `dismissGazette` → `pvpService.markPendingSeen` |
| `consts/gazetteTemplates.js` | edit | `pvp_belt_won`, `pvp_belt_lost` templates |
| `controllers/pvpController.js` | new | 5 thin handlers, `{message,code}` envelope |
| `routes/pvpRoutes.js` | new | 5 routes |
| `app.js` | edit | import + mount `/pvp`; add + call `backfillPvpSubdocForLegacyFighters` |
| `modules/scheduler.js` | edit | 2 queues + 2 workers + 2 repeats + onFailed |

### Frontend-dev (`frontend/` only; never server)
| File | New/edit | Purpose |
|---|---|---|
| `frontend/src/api.js` | edit | 5 `api.pvp*` helpers (§7.1) |
| `frontend/src/App.jsx` | edit | add `{ id:"pvp", label:"PvP", ... }` to `NAV_ITEMS` + `{activeTab === "pvp" && <PvpTab/>}` render block |
| `frontend/src/components/pvp/PvpTab.jsx` | new | container: Ladder + History sub-tabs |
| `frontend/src/components/pvp/PvpLadder.jsx` | new | ladder table, row states, Challenge buttons |
| `frontend/src/components/pvp/PvpHistory.jsx` | new | history list |
| `frontend/src/components/pvp/PvpChallengeFlow.jsx` | new | reuse `fights/FightCamp.jsx`+`FighterReport.jsx` (offensive camp), `FightSummary.jsx` (result), belt-transfer overlay (reuse `TierUpOverlay.jsx`) |

### Build sequence
1. Backend models + util + config. 2. `campService.buildOffensiveBonuses`. 3. `pvpService`. 4. controller + routes + app.js mount + migration. 5. Gazette story + templates + markPendingSeen. 6. scheduler jobs (parallel with 5). 7. Frontend: api helpers → PvpTab shell → Ladder/History → ChallengeFlow (can start against §3 once step 4 merges).

### Load-bearing field names the frontend depends on
`pvp.ladder_rank`, `pvp.rank_points`, `pvp.is_champion`, `pvp.attackable_after`, `pvp.total_fights`, `me.attacks_today`/`me.attack_cap`, per-row `attackable`/`block_reason`/`in_challenge_zone`, and the error `code` strings in §3.3.

---

## 7. Frontend contract

### 7.1 `api.js` helpers (under `// ── PvP ──`)
```js
getPvpLadder: (params) => request(`/pvp/ladder?${new URLSearchParams(params)}`),
getPvpProfile: (fighterId) => request(`/pvp/ladder/${fighterId}`),
pvpAttack: (defenderId, offensiveCamp) =>
  request(`/pvp/attack/${defenderId}`, { method: "POST", body: JSON.stringify({ offensive_camp: offensiveCamp }) }),
getPvpHistory: (params) => request(`/pvp/history?${new URLSearchParams(params)}`),
getPvpPending: () => request("/pvp/pending"),
```
No `fighterId` sent for attack/history/pending — server reads it from the JWT.

### 7.2 Tab structure (v1: Ladder + History only)
- **Ladder**: paginated table (rank, name, record, points, OVR, style, belt marker). Champion pinned top (gold + CHAMPION). Own row blue (YOU) via `me.fighterId`. Search box → `search`. Daily-cap banner when `me.attacks_today >= me.attack_cap`.
- **History**: chronological rows — outcome (W/L/D color), opponent, method, round, rank delta, iron. Mandatory loading/empty/error states.

### 7.3 Ladder row states (consume `block_reason`/`attackable`)
Champion (`is_champion`) gold+badge; Own (`is_me`) blue+YOU, no Challenge; Recovering (`block_reason==="target_recovering"`) greyed + tooltip; Out of band (`"out_of_bracket"`) greyed + "Outside your range (±8 OVR)"; Challenge zone (`in_challenge_zone`) gold left border; Attackable (`attackable===true`) active Challenge.

### 7.4 Challenge → camp → result (`PvpChallengeFlow.jsx`)
1. Tap Challenge (attackable row) → open with `defenderId`. 2. `getPvpProfile` → show OVR/style/PvP record (HP/injuries absent). 3. Reuse `FightCamp.jsx` (attacker-tier slots) + `FighterReport.jsx`; selection → `offensive_camp` ids. 4. Fight → `api.pvpAttack`; handle loading; map `err.code` to messages; `insufficient_energy`/`daily_pvp_cap_reached` → banner. 5. On success: if `belt.changed && belt.newChampion`, full-screen belt overlay (reuse `TierUpOverlay`) BEFORE result; then `FightSummary.jsx` with rank-delta line from `rank.attacker_points_delta`. 6. Refresh fighter from `response.fighter` (one hop).

---

## 8. Risks & resolutions

1. **CRITICAL — camp flow bound to `Fight`/`Opponent`, not `Fighter`.** `campService.getFighterReport`/`createCamp` require a persisted `Fight` whose `opponentId` populates an `Opponent`; a PvP defender is a `Fighter`. **Resolution:** v1 does NOT create a `Fight`/`FightCamp` for PvP. Add `campService.buildOffensiveBonuses(sessionIds, attackerStyle, defenderStyle)` returning the `sessionBonuses` array (reuse `getMatchStatus`/`STYLE_SESSION_MAP` vs defender style) with no DB doc. Attack is a single stateless `POST`. Frontend camp picker runs in local-selection mode and submits session ids. Trade-off: no resume-after-refresh of a half-built PvP camp (acceptable for v1 beta).
2. **`resolveFight` returns only `playerHealthAfter`.** Defender HP via §6.1 table; defender injuries via `rollForFightInjury`. `attackerWon = result.winner === "player"`.
3. **`PROMOTION_TIERS` fields verified present:** `fightEnergyCost` (10/15/18/20/20), `signingFee` (400/2000/10000/25000/50000), `injuryRiskMult` (2/2/2/3/3), `dailyFightCap`. Bind directly.
4. **No `isPremium`.** Ship `isPremium()→false` (cap 5 for all) + `PVP_DAILY_CAP_PREMIUM=7` wired for later. Uniform 5/day in beta.
5. **`saveWithVersionRetry` missing.** Create it (§4.0) — needed for concurrent mutual-attack + reposition.
6. **No `lastLogin`.** Belt-decay uses `max(pvp.last_pvp_fight_at, fighter.updatedAt)` as activity proxy.
7. **Error envelope.** PvP controllers return `{message,code}` (additive; frontend already reads `err.code`).
8. **`/pvp/pending` mark-seen.** GET is read-only; `gazetteService.dismissGazette` → `pvpService.markPendingSeen`. (Alt: dedicated `POST /pvp/pending/seen`.)
9. **`jobs/`+`workers/` dirs don't exist.** PvP jobs go inline in `modules/scheduler.js`. CLAUDE.md folder doc is stale.
10. **Belt story needs names.** `buildPvpBeltStory` reads the latest belt-changing `PvpFight` for the viewer + `Fighter.findById(other).select("firstName lastName")`. One extra lookup per compose (acceptable).
11. **Rank-point sign convention.** `calcDelta` is "positive=better"; PvP `rank_points` higher=better, so add delta directly, floor at 0, no `updatePlayerRank`/`clampRank`.
