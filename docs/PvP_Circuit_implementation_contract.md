# Implementation Contract — "The Circuit" PvP Hub (v1.1 + v1.2)

Behavior source: `docs/PvP_Hub_Design_The_Circuit.md`. Binds that design onto the shipped code. Where design and code diverge, these bindings win.

## Assumptions
1. No `/api` prefix — all new endpoints mount under `/pvp`; viewer = `req.user.fighterId`; envelope `{message,code}` (validation) / `{message:"Internal server error"}` (500).
2. BullMQ jobs are inline in `modules/scheduler.js` (Queue+Worker+`onFailed`/`onError`+nightly repeat), batch bodies in `pvpService.js`.
3. `isPvpBot` exists. Bots are valid bounty TARGETS + streak/contract fodder, but cannot POST bounties and never receive season rewards.
4. Iron field = `fighter.iron`. Notoriety via `notorietyService.applyNotorietyDelta(fighter, delta, {code, reason, meta})` (caller persists).
5. `fighter.userId` distinguishes real players from bots (collusion checks key on userId, fall back to `_id`).
6. `calcDelta` = +1/+2 win, −1/−2 loss, 0 draw — division bands tuned to this scale.
7. The hub is a VIEW restructure of the existing 8 `frontend/src/components/pvp/` components.

**Decided (encode, don't re-litigate):** season = 4 weeks; divisions = view-layer on the single global ladder; bounties = real iron (escrow + 10% post-burn + 20% expiry-burn, min 250, max ≤ 1× target-tier signingFee, 7-day expiry); soft-reset ×0.6; revenge +15% fame (×gapFactor, via applyNotorietyDelta, under PvE's +30%); titles cosmetic-only; belt stays live fight-only + separate Season Champion honor; all new iron/fame down-weighted, capped, never shortcut PvE.

---

# PHASE v1.1 — Hub, Rivalries, Streaks/Titles, Ticker, Contracts
Computed over existing `pvpfights` + `pvp` subdoc. ZERO economy risk (no iron sources; fame down-weighted/capped via applyNotorietyDelta). Ships without any v1.2 work.

## 1. Data model additions (v1.1)
### 1.1 Fighter `pvp` subdoc additions (`models/fighterModel.js`, snake_case) — ALSO add to `defaultPvp()` AND the snapshot capture/apply (Risk 1):
```
current_streak: Number=0   // signed; mirrors computeCurrentStreak, written in processPvpResult
best_streak:    Number=0   // max positive streak ever
titles:         [String]=[]   active_title: String=null   // cosmetic, zero stat effect
attack_wins:        Number=0   // wins as attacker (the_hunter ≥10)
giant_slayer_wins:  Number=0   // wins vs higher-ranked (giant_slayer ≥5)
top10_defenses:     Number=0   // defenses while ladder_rank≤10 (gatekeeper ≥5)
former_champion:    Boolean=false   // set on first belt loss (old_money)
nemesis_pvp:        ObjectId ref Fighter = null
fame_today: Number=0   fame_day_key: String=null   // daily fame cap (Risk 8)
fame_lifetime: Number=0   // PvP-only lifetime fame tally (Risk 3)
contracts: { daily_key:String=null, weekly_key:String=null,
  daily:[{id:String, goal:Number, progress:Number=0, claimed:Boolean=false}],
  weekly:[{id:String, goal:Number, progress:Number=0, claimed:Boolean=false}] }
```
`app.js`: add a SECOND `updateMany({ "pvp.contracts": { $exists: false } }, { $set: <new sub-fields> })` next to the existing backfill.

### 1.2 `rivalries` collection — `models/rivalryModel.js`
```
pair_key: String unique  // `${minIdStr}:${maxIdStr}` sorted so (A,B)===(B,A)
fighter_a/fighter_b: ObjectId  a_wins/b_wins/draws/total_fights: Number=0
heat: Number=0 min 0  leader_id: ObjectId|null
last_fought_at: Date  last_winner_id: ObjectId|null  last_method: String|null
heat_last_decay_at: Date   // {timestamps:true}
```
Indexes: `{pair_key:1}` unique, `{fighter_a:1,heat:-1}`, `{fighter_b:1,heat:-1}`, `{heat:1,heat_last_decay_at:1}`.

### 1.3 Ticker — NO collection (lazy aggregation over `pvpfights`). 1.4 Contracts — per-fighter in `pvp.contracts`; static defs in `consts/pvpConfig.PVP_CONTRACT_POOL`. 1.5 No new Redis; heat-decay is a nightly job (contracts rotate lazily on read).

## 2. Mechanics — server logic, all hook `processPvpResult` (pvpService ~431). Insert new side-effects before step 10 (PvpFight.create); rivalry upsert after.
> **RISK 1 (highest):** every new `pvp.*` field MUST be added to `captureFighterPvpSnapshot`/`applyFighterPvpSnapshot` (pvpService ~684/698) or it's dropped on a concurrent-save retry.

### A — Rivalries/Revenge
- Upsert `Rivalry` by `pair_key` (`findOneAndUpdate upsert`, NOT via saveWithVersionRetry — separate collection): `total_fights+1`, increment a_wins/b_wins/draws, set last_*; recompute leader_id (null if tied); `heat+1`, +1 more if leader flipped (net +2).
- Nemesis: if the other fighter leads head-to-head by ≥2 → `loser.pvp.nemesis_pvp = winnerId`; clear when deficit ≤0. Write on both fighters' pvp.
- Revenge bonus: if attacker LOST the prior fight in this pair within 72h and just WON, multiply attacker fame by `PVP_REVENGE_FAME_MULT=1.15` (folded into the PvP_WIN applyNotorietyDelta, stays ×gapFactor, counts the daily fame cap). No extra iron.
- Grudge = heat≥4 (read-time, Gazette-eligible).
- Reads: `getRivalries(viewerId)` → rows sorted heat desc, opponent name, viewer-perspective head-to-head, revenge_available (opp won last <72h ago AND attackable).
- Gazette: `buildPvpRivalryStory` + templates `pvp_grudge`/`pvp_revenge`.

### D — Streaks/Titles
- Both fighters: derive `current_streak` incrementally O(1) (`win→ prev≥0?prev+1:1; loss→ prev≤0?prev-1:-1; draw→0`); `best_streak=max`.
- Milestone fame at current_streak ∈ {3,5,10,15} (positive) via applyNotorietyDelta(code `PVP_STREAK`, `PVP_STREAK_FAME[streak]`), capped.
- Title counters: attack_wins, giant_slayer_wins (opp ladder_rank < mine), top10_defenses (defender win while rank≤10), former_champion (on belt loss).
- `evaluateTitles(pvp)` → keys satisfied: the_hunter(attack_wins≥10), giant_slayer(≥5), untouchable(best_streak≥10), gatekeeper(top10_defenses≥5), old_money(former_champion), iron_collector(bounties_collected≥5 — v1.2). New unlocks appended to `pvp.titles`, each pays a one-time `PVP_TITLE_FAME` (idempotent on transition).
- `POST /pvp/title` sets `pvp.active_title` (must be in titles).
- Gazette: `buildPvpStreakStory`/`buildPvpTitleStory` + templates.

### E — Ticker (read-only). `getTicker(viewerId,{limit})`: newest PvpFight where viewer participates OR involves rivals/nemesis OR `belt_changed:true`, sorted fought_at desc, ~20; map to `{id,kind,text,fought_at,actor:{fighterId,name},action}`; batch-resolve names. kinds: you_attacked/you_were_attacked/rival_fight/belt_change/streak_break(omit in v1.1).

### F — Contracts
- Lazy rotation `ensureContractsState(fighter)` (mirror ensurePvpDailyState): new daily_key→pick 2 from pool (seeded RNG `${fighterId}:${dayKey}`); new weekly ISO-week→pick 1. Called in initiatePvpAttack + hub read.
- Progress hook in processPvpResult (ATTACKER only): win_1, finish_someone (KO/Sub win), beat_higher_ranked (win vs lower ladder_rank), weekly_win_4, weekly_collect_bounty (v1.2). Clamp to goal.
- Claim `POST /pvp/contracts/:id/claim` → validate complete+unclaimed → applyNotorietyDelta(`PVP_CONTRACT`), fame-only in v1.1; counts daily fame cap.

## 3. API (v1.1) — under `/pvp`, JWT, `{message,code}`
### 3.1 `GET /pvp/hub` (one Yard feed)
`{ identity:{fighterId,name,active_title,division:null,record,win_pct,ladder_rank,rank_points,is_champion,belt_defenses,ranks_from_challenge_zone,current_streak,best_streak,ko_rate,finish_rate,pvp_fame_lifetime,bounty_on_head:0,rivals_active}, revenge_cards:[{fighterId,name,ovr,style,last_method,last_fought_at,attackable,block_reason}], ticker:[{id,kind,text,fought_at,actor,action}], contracts:{daily:[{id,label,goal,progress,claimed,claimable,reward:{fame}}],weekly:[...],daily_resets_at,weekly_resets_at} }`. revenge_cards = ≤3 rivalries where opp won last <72h ago AND attackable (reuse `blockReasonFor`). Errors 401/500.
### 3.2 `GET /pvp/rivalries?limit` → `{rows:[{fighterId,name,ovr,style,head_to_head:{my_wins,their_wins,draws},leader:"me"|"them"|"tied",heat,is_grudge,is_nemesis,last_method,last_fought_at,revenge_available,attackable,block_reason}]}`
### 3.3 `POST /pvp/contracts/:contractId/claim` → `{contractId,claimed,reward:{fame},fame_after}`. Errors: 404 contract_not_found, 400 contract_incomplete/contract_already_claimed/contract_cap_reached.
### 3.4 `POST /pvp/title` body `{title|null}` → `{active_title}`. 400 invalid_title.
### 3.5 Ticker ships inside `/pvp/hub.ticker` (no standalone endpoint in v1.1).
### 3.6 Additive enrichments: `GET /pvp/ladder/:fighterId` adds `pvp.head_to_head` + `pvp.titles`/`active_title`; `GET /pvp/history` adds per-row `tags:{revenge,streak,rivalry_heat}`. Non-breaking.

## 4. Jobs (v1.1) — inline scheduler, `onFailed`/`onError` mandatory
`pvp-rivalry-heat-decay` (nightly): `runRivalryHeatDecayBatch()` — rivalries heat>0 & heat_last_decay_at >7d → `heat=max(0,heat-weeks)`, bulkWrite chunked, per-record try/catch.

## 5. Frontend hub IA (v1.1) — `frontend/src/components/pvp/`
- `PvpTab.jsx` rewrite: persistent identity header + 4 sub-tabs Yard(default)/Ladder/Bounties(placeholder)/History; fetch `GET /pvp/hub` once.
- New: `PvpIdentityHeader.jsx` (Your Fight Card from hub.identity; reuse fr-ovr-block/STYLE_COLORS; division pill hidden until v1.2; bounty-on-head chip dark), `PvpYard.jsx` (revenge board + ticker + contracts), `PvpRevengeBoard.jsx`, `PvpTicker.jsx`, `PvpContracts.jsx`, `PvpRivalsList.jsx`.
- Reuse: `PvpChallengeFlow` is the shared challenge entry (revenge/ticker open it with defenderId; accept `context="revenge"` to light the REVENGE chip in PvpStakeChips from profile head_to_head/revenge_available). `PvpLadder` adds division-placeholder + rivals filter. `PvpHistory` renders per-row tags.
- `api.js`: `getPvpHub`, `getPvpRivalries`, `claimPvpContract`, `setPvpTitle`.

---

# PHASE v1.2 — Seasons & Divisions, Bounties (new persistence + real-iron economy; ships after v1.1)

## 6. Seasons & Divisions
### 6.1 `models/pvpSeasonModel.js`: `{season_number unique, status:"active"|"ended", starts_at, ends_at(=+4w), champion_id, rolled_over_at}`. Index `{status:1}`,`{season_number:-1}`.
### 6.2 Fighter pvp season fields (+ defaultPvp + snapshot): `division:String=null, season_start_points:Number=0, season_titles:[String]=[], season_number_seen:Number=0, bounties_collected:Number=0`.
### 6.3 Divisions = view-layer; `divisionFor(pvp)` by rank_points: Champion's Circle (ladder_rank≤10 OR rp≥60), Diamond [40,60), Gold [22,40), Silver [8,22), Bronze (<8). Denormalize `pvp.division` at rollover + each fight.
### 6.4 `pvp-season-rollover` (nightly, acts when now≥ends_at): `runSeasonRolloverBatch()` — capture belt holder as season.champion_id + season_${n}_champion title (belt does NOT reset); bulkWrite `rank_points=floor(old×0.6)`, `season_start_points=new`, recompute division; reward grants down-weighted/capped/division-gated/bots-excluded (fame via applyNotorietyDelta `PVP_SEASON_REWARD` + flair title + iron ≤Diamond=1× signingFee); create next season doc, end old. Gazette `buildPvpSeasonStory` + templates.
### 6.5 `GET /pvp/season` → `{season_number,ends_at,starts_at,my_division,champion|null,ended_results:null|{division,rewards,placement}}` (ended_results non-null only when `season_number_seen<season_number`; reading/`POST /pvp/season/seen` marks seen).
### 6.6 UI: `PvpSeasonBadge`, countdown in header, division toggle on ladder, `PvpSeasonResultsModal` (once via season_number_seen).

## 7. Bounties (mirror mainEventService stake→debit→settle; net iron sink)
### 7.1 `models/bountyModel.js`: `{target_id,poster_id,amount_posted,escrow_amount(90%),method_required:any|KO|Submission|Decision,status:open|collected|expired|refunded,expires_at(+7d),collected_by,collected_fight_id,posted_at,resolved_at}`. Indexes `{target_id:1,status:1}`,`{poster_id:1,status:1}`,`{status:1,expires_at:1}`,`{status:1,target_id:1,collected_by:1}`.
### 7.2 Post `POST /pvp/bounties` `postBounty(posterId,targetId,amount,methodRequired)`: validations bounty_self/fighter_not_found/target_not_attackable/bounty_forbidden(bot)/bounty_below_min(<250)/bounty_above_max(>1× target-tier signingFee)/insufficient_iron/bounty_duplicate(one open per poster,target). Debit poster.iron; escrow=round(amount×0.9), 10% burned; create open bounty +7d. → `{bountyId,target_id,amount_posted,escrow_amount,expires_at,iron_after}`.
### 7.3 Collect — wired into processPvpResult (attacker WON, before return): `tryCollectBounties` finds open bounties on defender matching method+in-bracket+legit; for each, atomic `findOneAndUpdate({_id,status:"open"},{collected...})` (compare-and-set guards double-pay) — only credit `attacker.iron += escrow` if it flipped; apply iron BEFORE captureFighterPvpSnapshot; `attacker.pvp.bounties_collected++`. Add `bounty_collected:{count,total_iron,items}` to the §3.3 attack payload.
### 7.4 Expiry `pvp-bounty-expiry` (nightly): open & expires_at≤now → refund poster.iron += round(escrow×0.8) (20% burned), status:"refunded"; saveWithVersionRetry on poster; onFailed.
### 7.5 Anti-abuse: can't collect own bounty; (poster,target,collector) triangle ≤ once per N days; diminishing ×1.0/0.6/0.3/→0 on repeat head-to-head (bounty payout remainder burned + caps revenge/streak fame keyed on head-to-head count); existing attackable_after repeat-hit throttle; one open bounty per (poster,target).
### 7.6 Read `GET /pvp/bounties?scope=collectable|posted|on_me` → rows w/ target/poster/amounts/method/expiry/status; collectable filtered by blockReasonFor.
### 7.7 UI: `PvpBounties` tab (Collectable/Posted/On-my-head), `PvpPostBountyModal` (min250/max=signingFee, method, escrow+burn preview), bounty tags on ladder/profile + camp stake chip + summary "bounty collected" line. api: getPvpBounties, postPvpBounty, getPvpSeason.

---
## 8. Economy summary
New fame (all via applyNotorietyDelta, down-weighted, daily-capped): PVP_REVENGE_WIN(1.1), PVP_STREAK(1.1), PVP_TITLE_UNLOCK(1.1, one-time ≤0.5× signingFee-fame), PVP_CONTRACT(1.1), PVP_SEASON_REWARD(1.2). Iron only in v1.2 (bounties) — escrow+burns = net sink, never creates iron. None touch fighter.record/ranking/promotionTier/title-shot/tier gates. Titles cosmetic. Division display-only.

## 9. File placement & task split — see contract §9; backend = models/pvpService/gazette/controller/routes/app.js/scheduler/config; frontend = api.js + components/pvp/*. Order: (B) models+config+defaultPvp+snapshot → processPvpResult hooks + heat-decay job → endpoints → gazette; (F) header/Yard shell → wire after hub endpoint → history/ladder last. v1.1 ships fully independent of v1.2.

## 10. Risks
1. **Snapshot drop (highest):** every new pvp.* field + bounty iron credit must be in captureFighterPvpSnapshot/applyFighterPvpSnapshot.
2. Rivalries denormalized (start-empty, no historical backfill for beta). Streaks incremental O(1) (don't re-query computeCurrentStreak per fight).
3. `fame_lifetime` counter incremented alongside every PvP fame award (in snapshot).
4. Divisions band-based (not quota) for O(1) rollover — STAKEHOLDER NOTE: accept band-based (recommended) vs true percentile quotas.
5. Season rollover bulkWrite-chunked; reward grants per-doc saveWithVersionRetry, idempotent on season state flip.
6. Bounty double-pay: atomic compare-and-set on status:"open" + credit before snapshot.
7. Bots are valid bounty targets (fine — poster iron already sunk); bots can't post.
8. One shared daily fame cap (`fame_today`/`fame_day_key`) across revenge+streak+contract so one win can't farm the cap.
9. ISO-week key for weekly contracts (server-local, consistent with daily key).
10. Keep three places in lockstep per field: schema, defaultPvp(), snapshot capture/apply.
