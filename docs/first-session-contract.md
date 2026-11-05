# First session: build contract

Architect brief, 2026-11-04, for `docs/first-session-spec.md` (behaviour source of truth) with the owner's decisions: single-slot Debut board; no health top-up; reveal PvE only; no session replay; legacy players get section tips OFF; version 2.4. All four spec build steps are in this one build. Backend is JS Express + Mongoose at the repo root; frontend is Vite React in `frontend/src`. No em dashes anywhere in player copy.

## Assumptions (stated once)

1. "Resolved PvE fight count" = `record.wins + record.losses + record.draws`. Verified: only `fightService.resolveFightAndApply` increments `fighter.record`; PvP uses `PVPRecord`; `mainEventService` increments NPC records only. Draws count.
2. The $500 signing bonus is paid exactly once per fighter, by the server, inside the resolve of the fighter's FIRST PvE fight. `POST /tutorial/:id/complete` no longer credits iron (spec 6: "the signing bonus is paid on the result screen of fight 1" even after End tutorial).
3. The server, not the client, marks the tutorial complete when the first PvE fight resolves. The client never calls `/complete` on the debut path; it still calls it for "End tutorial".
4. `msSinceFighterCreated` on `debut_step` is measured client side from the first time the client sees the debut flow (sessionStorage stamp), named `msSinceStart`. Fighter has no guaranteed `createdAt` on the client payload and the first load after creation is within a second of creation anyway.
5. The "health under 60" moment tip fires when the board is shown with health < 60 and an acceptable offer, not on the Accept click: the anchor (the card) unmounts on accept, and the decision moment is before the tap.
6. The Fight Camp section sequence is split: "Match status" + "Wildcard" on the camp (key `fightcamp`), "Weight cut" on the first non-debut Camp Summary (key `weightcut`). The weight-cut grid only exists in the summary modal, which opens after finalise.
7. Debut opponents live in `data/debutOpponents.json` (16: 4 per weight class) read by BOTH the seed and the Monte Carlo sim, so what is simulated is what is seeded.

---

## A. Data model changes

### A.1 Fighter (`models/fighterModel.js`)

`tutorial` subdoc, extended (old fields kept, meanings unchanged):

```
tutorial: {
  completed:           Boolean, default false     // existing. true = guided onboarding over (debut flow or legacy tour or End tutorial)
  current_step:        String,  default "debut_home"   // CHANGED default (was "profile_intro")
  started_at:          Date,    default Date.now  // existing
  completed_at:        Date,    default null      // existing
  version:             Number,  default 2         // NEW. 2 = first-session flow. Legacy docs lack it until the boot migration stamps it.
  signingBonusPaidAt:  Date,    default null      // NEW. Set exactly once when the $500 is credited.
  tipsSeen:            [String], default []       // NEW. Section and moment tip keys (consts/tutorialConfig TIP_KEYS).
}
settings: {                                       // NEW subdoc, owner-only (ships via toObject; NOT in PUBLIC_FIGHTER_KEYS)
  playFightsOut: Boolean, default true            // fight reveal on/off
  sectionTips:   Boolean, default true            // section + moment tips on/off
}
```

`offerBoard.slots.offerType` enum: add `"Debut"` → `["Easy","Even","Hard","TitleShot","Debut"]`.

### A.2 Opponent (`models/opponentModel.js`)

```
isDebut: { type: Boolean, default: false }
```
Debut opponents: `promotionTier: "Amateur"`, `fixedRank: null`, `isChampion: false`, seeded `record` and `fightHistory` (0-0 to 1-2). Add partial index `{ isDebut: 1, weightClass: 1 }` with `partialFilterExpression: { isDebut: true }` (the board query is `{ isDebut: true, weightClass }`).

### A.3 Fight (`models/fightModel.js`)

No schema change: `offerType` is a free String; `"Debut"` is stored as-is. Update the comment.

### A.4 AnalyticsEvent (`models/analyticsEventModel.js`)

Enum additions: `"fighter_created"`, `"debut_step"`, `"fight_reveal"`, `"next_goal_click"`, `"section_tip"`. Existing `fight_accepted` / `fight_resolved` metas gain `fightNumber` and `offerType` (see D).

### A.5 Boot migration (`app.js`, new `backfillFirstSession()` right after `backfillTutorialForLegacyFighters()` in the startup chain)

Raw collection writes like the existing backfills. Idempotent through the `tutorial.version` marker: every step filters `{ "tutorial.version": { $exists: false } }` and sets `"tutorial.version": 2`. Run in this order:

1. Completed legacy players (`"tutorial.completed": true`):
   `$set: { "tutorial.version": 2, "tutorial.signingBonusPaidAt": now, "settings.playFightsOut": true, "settings.sectionTips": false }`
   (They already received the $500 from `complete()`. Tips off per owner decision.)
   EXCEPT fighters with zero PvE fights: handled by step 3, so filter step 1 with `$expr: { $gte: [ { $add: ["$record.wins","$record.losses","$record.draws"] }, 1 ] }`.
2. Mid-tutorial legacy players with at least one PvE fight (`"tutorial.completed": false`, same `$expr`):
   `$set: { "tutorial.version": 2, "tutorial.completed": true, "tutorial.current_step": "complete", "tutorial.completed_at": now, "tutorial.signingBonusPaidAt": now, "settings.playFightsOut": true, "settings.sectionTips": true }, $inc: { iron: 500 }`
   (They fought but never reached the old completion modal, so they were owed the bonus.)
3. Anyone with zero PvE fights (any completed state), spec section 6 last bullet:
   `$set: { "tutorial.version": 2, "tutorial.completed": false, "tutorial.current_step": "debut_home", "tutorial.completed_at": null, "settings.playFightsOut": true, "settings.sectionTips": true }`
   Do NOT touch `signingBonusPaidAt` here: a player who completed the old tour and never fought already has the $500 (stamp it: `"tutorial.signingBonusPaidAt": { $ifNull: ["$tutorial.completed_at", null] }` is not expressible in a plain update; instead run step 3 as two filters: `completed: true` → also `$set signingBonusPaidAt: now`; `completed: false` → leave null so the debut resolve pays).
4. Log counts per step. New fighters created after deploy get `version: 2` from the schema default and are never touched.

### A.6 Redis / BullMQ

None. No new keys, no new jobs. (Analytics session dedupe key `analytics:session:<fighterId>:<day>` is unchanged.)

### A.7 Legacy step ids

`consts/tutorialConfig.js`:

```
STEP_ORDER = ["debut_home", "debut_offer", "debut_report", "debut_camp", "complete"]
LEGACY_STEP_IDS = ["profile_intro","gym_intro","training_session","fight_offer","fight_camp","fight_result","rankings_intro","events_intro","hospital_intro"]
DEFAULT_STEP = "debut_home"; FINAL_STEP = "complete"
normaliseStep(id): STEP_ORDER.includes(id) ? id : (LEGACY_STEP_IDS.includes(id) ? DEFAULT_STEP : DEFAULT_STEP)
validateStepAdvance(current, incoming): uses normaliseStep(current); incoming must be exactly the next STEP_ORDER entry. "complete" is NOT a valid advance target through this endpoint (the resolve or /complete sets it): validateStepAdvance returns false when incoming === FINAL_STEP.
TUTORIAL_IRON_REWARD = 500 (kept; now consumed by the resolve path and the migration)
TIP_KEYS = Object.freeze([...SECTION_TIP_KEYS, ...MOMENT_TIP_KEYS]) where
  SECTION_TIP_KEYS = ["camp","fight","fightcamp","weightcut","rankings","events","hospital","pvp","moves","sponsors","media"]
  MOMENT_TIP_KEYS  = ["moment_energy_low","moment_health_low","moment_first_loss","moment_first_injury"]
DEBUT_OFFER_TYPE = "Debut"  (also re-exported from consts/offerBoardConfig.js; one definition, in offerBoardConfig, tutorialConfig imports it)
```
Note there is no `debut_result` server step: step 6 is client-only analytics. Nothing persists on legacy ids after the migration, but `normaliseStep` keeps them harmless if a doc slips through, and `tutorialService.readTutorial` returns the normalised id.

---

## B. API contract

Shared shapes are defined ONCE in JSDoc at the places named below; this file is the cross-repo copy. Frontend consumes them from `frontend/src/api.js` helpers.

### B.1 Tutorial

**GET `/tutorial/:fighterId`** (existing, response extended). Source JSDoc: `services/tutorialService.js` `@typedef TutorialState`.
```
200 { completed: boolean, current_step: "debut_home"|"debut_offer"|"debut_report"|"debut_camp"|"complete", version: 2, tipsSeen: string[] }
404 { message: "Fighter not found" } | 500
```

**POST `/tutorial/:fighterId/advance`** body `{ step: string }` (existing). Validation per A.7. `"complete"` as `step` → 400 `TUTORIAL_INVALID_STEP`.
```
200 TutorialState
400 { message, code: "TUTORIAL_INVALID_STEP" } | 400 { message: "Missing step" } | 400 { message: "Tutorial already completed" } | 404 | 500
```
Implementation change: write with `Fighter.updateOne({ _id, "tutorial.completed": false }, { $set: { "tutorial.current_step": step, "tutorial.started_at": ... } })`, never a whole-doc `save()` (see G, race with the resolve).

**POST `/tutorial/:fighterId/complete`** (existing). Marks completed, credits NOTHING.
```
200 { completed: true, current_step: "complete", ironRewarded: 0, iron: number }   // ironRewarded kept for compatibility, always 0
404 | 500
```
Atomic: `Fighter.updateOne({ _id, "tutorial.completed": false }, { $set: { "tutorial.completed": true, "tutorial.current_step": "complete", "tutorial.completed_at": now } })`. Idempotent.

**POST `/tutorial/:fighterId/tips/seen`** NEW. body `{ key: string }`; `key` must be in `TIP_KEYS` (hostile input: anything else 400).
```
200 { tipsSeen: string[] }
400 { message: "Invalid tip key", code: "INVALID_TIP_KEY" } | 404 | 500
```
`Fighter.updateOne({ _id }, { $addToSet: { "tutorial.tipsSeen": key } })`, then read back.

Routes: all four in `routes/tutorialRoutes.js`. The existing three have no ownership guard (any logged-in user can advance another fighter's tutorial): flagged, not fixed here, BUT the new `tips/seen` route MUST mount `ownFighter` (the guard used in `routes/fighterRoutes.js`) and the backend dev should add it to the other three too since it is a one-line change on routes the client already calls with the owner's token.

### B.2 Fighter settings

**PATCH `/fighters/:id/settings`** NEW, `ownFighter`-guarded, in `routes/fighterRoutes.js`.
body: `{ playFightsOut?: boolean, sectionTips?: boolean }`; at least one key; every present value must be a real boolean; unknown keys 400.
```
200 { settings: { playFightsOut: boolean, sectionTips: boolean } }
400 { message: "Invalid settings" } | 403 (ownFighter) | 404 | 500
```
`fighterService.updateSettings(fighterId, patch)` → `Fighter.updateOne({_id}, {$set: {"settings.playFightsOut": ..}})`, read back `settings`.

### B.3 Offer board (changed shapes). Source JSDoc: `services/offerBoardService.js` header.

`BoardOffer.type` union becomes `"Easy"|"Even"|"Hard"|"TitleShot"|"Debut"`. A Debut offer carries the normal `opponent`, `context`, `purse` (= 500 at Amateur), `acceptable`; never `nemesisMeta`, `isCallout`, `titleShotMeta`. No new meta field; the card copy is frontend i18n keyed off `type`.

Board rule (in `fightService.pickOfferSlots`, first thing): `if (pveFightCount(fighter) === 0)` → one `$sample` over `{ isDebut: true, weightClass }`; return `[{ offerType: "Debut", opponentId }]`. If the debut pool is EMPTY, `console.error("[offerBoard] debut pool empty for <weightClass>")` and fall through to the normal three-slot logic (never strand a new player on POOL_EMPTY because a seed was not run).

Fingerprint (`offerBoardService.boardFingerprint`) gains a sixth segment: `pveFightCount(f) === 0 ? "debut" : "-"`. Every stored board regenerates once after deploy (they are 24 h boards anyway) and a legacy 0-fight fighter's live three-slot board is replaced by the Debut board on the next read.

`GET /fights/offers/:fighterId` and the dashboard `offers` block carry it unchanged otherwise. `POST /fights/offers/:fighterId` and `POST /fights/accept/:fighterId/:fightId` unchanged (type comes from the board).

### B.4 Fighter report and camp state (changed shapes)

**GET `/fights/camp/:fightId/report`** adds:
```
isDebut: boolean                          // fight.offerType === "Debut"
coachPick: string|null                    // a CAMP_SESSIONS key, only when isDebut, else null
```
**GET `/fights/camp/:fightId?fighterId=`** (getCampState) adds the same two fields.
One pure helper in `services/campService.js`: `debutCoachPick(fight, opponentStyle)` → `fight.offerType === "Debut" ? (STYLE_SESSION_MAP[opponentStyle] || [])[0] ?? null : null`. The first entry of `STYLE_SESSION_MAP` scores MATCHED by construction (`getMatchStatus`).

### B.5 Fight resolve (changed response). Source JSDoc: a `@typedef FightResolveSummary` block placed directly above the `summary` literal in `fightService.resolveFightAndApply`.

`POST /fights/resolve/:fighterId` response stays `{ fight, fighter, result, summary, breakdownView }`. `summary` adds:
```
fightNumber:   number          // lifetime PvE number of THIS fight (1 = debut)
isDebut:       boolean         // fight.offerType === "Debut"
signingBonus:  number          // 500 when this resolve credited the signing bonus, else 0
ovrBefore:     number          // fighter.overallRating captured before fightConsequenceService runs
ovrAfter:      number          // after
rankEarned:    number|null     // display rank when this fight placed the fighter in the rankings (rank was null before, set now), else null
nextGoal:      NextGoal
```
`NextGoal` (source JSDoc: `services/nextGoalService.js`):
```
{
  key: "rank" | "pvp_unlock" | "top5" | "title" | "tier" | "top",
  current: number|null,  target: number|null,   // progress n / of
  rank: number|null,                            // top5: current display rank
  tier: string|null, threshold: number|null,    // tier: next tier and its minOverall; current = OVR
  secondary: { key: "pvp_unlock", current: number, target: 3 } | null
}
```
Priority (first match), computed on the POST-resolve fighter doc:
1. `ranking.rank == null` → `rank`, current = `ranking.fightsInTier`, target = `RANKED_AFTER_FIGHTS` (3).
2. `!pvpOnboarding.unlocked` → `pvp_unlock`, current = `min(record.wins, 3)`, target 3.
3. `isTitleContender(f) && !rankingService.isTopFive(f)` → `top5`, rank = `toDisplayRank(ranking.rank)`.
4. `isTitleContender(f) && isTopFive(f) && topFiveWinsInTier < titleWins` → `title`, current = `topFiveWinsInTier`, target = `getTitleShotConfig(tier).titleWins`.
5. `TIER_LADDER.find(e => e.from === tier)` exists → `tier`, tier = `e.to`, threshold = `e.minOverall`, current = OVR, target = threshold.
6. Otherwise (GCS) → `top` (client copy: "You're at the top. Defend the belt.").
`secondary` = pvp_unlock progress whenever key is not `pvp_unlock` and PvP is still locked.

Signing bonus rule (in the resolve, before the main `await fighter.save()` at the badge block): `pveFightsBefore = pveFightCount(fighter)` captured at the top (before record increments). If `pveFightsBefore === 0 && !fighter.tutorial?.signingBonusPaidAt`: `fighter.iron += 500; fighter.tutorial.signingBonusPaidAt = now; fighter.tutorial.completed = true; fighter.tutorial.current_step = "complete"; fighter.tutorial.completed_at ??= now; fighter.markModified("tutorial"); summary.signingBonus = 500`. In-memory on purpose: the purse is credited the same way and the fight claim (`accepted → resolving` compare-and-set) already makes the resolve exactly-once; an atomic `$inc` here would be overwritten by the later `fighter.save()` calls that `$set` the hydrated `iron`.

`result.ironEarned` / `fight.ironEarned` stay the purse only; the bonus is its own summary line.

### B.6 Analytics

**POST `/fighters/:id/analytics/events`** (existing client beacon). Whitelist additions in `analyticsService.CLIENT_EVENT_SANITIZERS` (every unknown key dropped, every value validated, else 400 `invalid_event`):
```
debut_step:      { step: int 1..6, msSinceStart: int 0..2_592_000_000, device: "phone"|"desktop" }
fight_reveal:    { result: "watched"|"skipped", beatIndex: int 0..500, beatsTotal: int 0..500, speed: 1|2, fightNumber: int 1..100000 }
next_goal_click: { choice: "next_fight"|"train", fightNumber: int 1..100000 }
section_tip:     { section: one of SECTION_TIP_KEYS, result: "done"|"hidden" }
```
Server-only (rejected from the client): `fighter_created`, `fight_accepted`, `fight_resolved`.

**GET `/admin/analytics/retention`** adds a top-level `firstSession` block (see D.3 for the shape).

### B.7 Dashboard

`GET /fighters/:id/dashboard`: `heroBout.offerType` and `offers.list[].type` / `offers.best.offerType` unions gain `"Debut"`. No server logic change beyond the JSDoc union. `heroAction` stays whatever `computeHeroAction` returns (`fight_offer`); the client renders the debut hero from `heroBout.offerType === "Debut"`.

---

## C. Debut opponents

### C.1 Data and seed

`data/debutOpponents.json`: array of 16 objects, 4 per weight class:
```
{ name, nickname, weightClass, style, overallRating, str, spd, leg, wre, gnd, sub, chn, fiq,
  record: {wins,losses,draws}, fightHistory: [{result, method, round}] }
```
Local-show style names (no real people). Records 0-0, 1-0, 0-1, 1-2 spread. Stats come from the Monte Carlo (C.3), not by hand.

`scripts/seedDebutOpponents.js` (NEW; devs READ scripts, never run them from this folder):
- Connects via `config` like `seedOpponents.js`, prints the `[config] Mongo:` host and db name first.
- Refuses to run unless `LOCAL_MODE=true`, or `--allow-remote --yes` are both present (staging recipe from CLAUDE.md: `set -a; . ./.env.staging; set +a; USE_ATLAS=false LOCAL_MODE=false node scripts/seedDebutOpponents.js --allow-remote --yes`). Without `--yes` it exits before connecting.
- Idempotent upsert per entry: `Opponent.updateOne({ isDebut: true, weightClass, name }, { $set: { ...entry, isDebut: true, promotionTier: "Amateur", fixedRank: null, isChampion: false, championTier: null } }, { upsert: true })`. Never deletes, never touches non-debut docs. Logs upserted/updated counts.
- `--dry` prints the plan without writing.
- Production: only with the owner's explicit yes in chat, after staging.

### C.2 Every Opponent query, and whether it must exclude debut opponents

Audited (`Opponent.find|findOne|aggregate|countDocuments` across services/controllers/scripts):

| Site | Change |
|---|---|
| `fightService.pickOfferSlots` `base` filter (line 417) | ADD `isDebut: { $ne: true }` (covers Easy/Even/Hard `$sample` and the backfill `fillers` aggregate). |
| `fightService.pickOfferSlots` nemesis `findById` | no change (a nemesis can only be someone who beat you; a debut loss would set the debut opponent as nemesis: see below). |
| `fightService.hydrateOffers` `find({_id:{$in}})` | no change (ids come from the stored board). |
| `championService.seedNewChampion` | ADD `isDebut: { $ne: true }` (sort by OVR desc makes it unlikely, be explicit). |
| `championService.getChampion`, `fighterController.getChampions` | no change (`isChampion: true`). |
| `rankingController` roster (`fixedRank: { $ne: null }`) | no change: debut opponents have `fixedRank: null`. |
| `calloutService` (fixedRank ranges) | no change. |
| `calloutService.findById` (139, 244), `interviewService.findById` (157, callout target from client), `mediaHubService.findById` (172) | ADD a `if (opp.isDebut) throw/404` guard where the opponent id comes from the client (interviewService 157 and calloutService 139 at minimum): a debut opponent must never become a callout or beef target. |
| `mainEventService` pools | no change (`promotionTier: "GCS"`). |
| `scripts/seedOpponents.js` gap-fill `countDocuments({tier, wc}) < 4` and donors | ADD `isDebut: { $ne: true }` (edit only; do not run). |
| `scripts/migrateRankingSystem.js` (wipes ALL opponents) | ADD `isDebut: { $ne: true }` to its `deleteMany` filter, or document that `seedDebutOpponents` must be rerun after it. Edit only. |
| `scripts/migrateCampHistory.js` | no change (debut docs are seeded with fightHistory). |
| `dashboardService` | reads through `offerBoardService.getBoard` and `Fight.populate`; no change. |

Nemesis on a debut loss: `resolveNemesisOnLoss` would make the debut opponent the nemesis, and `pickOfferSlots` would then force them into a slot on the normal board (classified Easy). Rule: in the resolve, skip `resolveNemesisOnLoss` when `fight.offerType === "Debut"` (one `if`). The debut opponent is never offered again.

Media/press after a debut: `interviewService` CALLOUT target validation already requires same tier and OVR within window; add the `isDebut` reject above. Persona/media hooks only read the fought opponent's name; no change.

### C.3 Monte Carlo plan for the debut OVR (`scripts/simDebutOvr.js`, NEW)

- Pure: requires ONLY `utils/fightResolution.js` (`resolveFight(player, opponent, options)`), `utils/overallRating.js` (`calculateOverall`), `utils/startingStats.js` (NEW, see F: `buildStartingStats(style, backstory)` extracted from `fighterService` so the sim builds fighters exactly as creation does), `consts/gameConstants.js` (`STYLES`, `BACKSTORIES`), `consts/campConfig.js` (`STYLE_SESSION_MAP`, `SESSION_BONUSES`, `MATCH_STATUS_MULTIPLIERS`), and `data/debutOpponents.json`. It must NOT require `config`, any model, any service, or `lib/redis`. The backend dev verifies with `node -e "require('./utils/fightResolution')"` that nothing opens a connection. Guard at the top: `if (process.env.MONGODB_URI) { /* ignore; never read */ }` plus an explicit comment "no DB".
- Grid: 8 styles × 6 backstories × 16 debut opponents (per weight class, the fighter's weightClass is irrelevant to the engine, so use all 16) × 2 camp modes × N (default 300, `--n=`) runs. Player: `buildStartingStats`, `health 100`, `stamina 100 + maxStaminaBonus` (Easy cut: roll 0), `maxStamina` likewise, `calculateOverall` for the printed OVR. Opponent: JSON doc as-is (`strategy` null). Options: `playerStrategy: null`, `sessionBonuses`: `[]` for "no camp"; for "matched camp" the two sessions `STYLE_SESSION_MAP[opp.style].slice(0,2)` shaped as campService does (`{ sessionType, bonusType, effectiveValue: SESSION_BONUSES[s].value * MATCH_STATUS_MULTIPLIERS.MATCHED, matchStatus: "MATCHED", triggered: false, triggerCount: 0, label }`), `moveBonuses: []`, `wildcard: null`, `ctx: { playerStyle, opponentStyle, tier: "Amateur", isTitle: false }`. Win = outcome in `["KO/TKO","Submission","Decision (unanimous)","Decision (split)"]`.
- Output: overall win rate per camp mode; a style × backstory table; worst cell; per-opponent rate. `--scale=0.9` multiplies all opponent stats (clamped 1..100, OVR recomputed) to explore. Target: about 90% overall with a matched camp, no style × backstory cell under 80%, no camp not above 95% (a loss must stay possible). Iterate the JSON until it lands; commit the final JSON and the sim's summary table in the script header comment. Starting point for the JSON: target OVR 9 to 10 (regular floor is 12, new fighters are about 14 to 15), primary stats at about 0.9 × OVR, others at about 0.5 × OVR, as `seedOpponents.generateStats` does.

---

## D. Analytics

### D.1 Events

| Event | Side | Where | meta |
|---|---|---|---|
| `fighter_created` | server | `controllers/authController.js` `register` and `createGuest`, next to the existing `signup`/`guest_signup` track calls | `{ style, weightClass, backstory: string|null, guest: boolean, device: "phone"|"desktop"|"unknown", ...acquisitionMeta(acquisition) }` (`src`/`campaign` copied so the funnel splits without a join). `device` from `analyticsService.deviceFromUserAgent(req.get("user-agent"))`: `/Mobi|Android|iPhone|iPad|iPod/i` → phone, non-empty → desktop, empty → unknown. |
| `fight_accepted` | server (existing) | `fightService.acceptOffer` | ADD `fightNumber: pveFightCount(fighter) + 1`, `offerType: fight.offerType`. |
| `fight_resolved` | server (existing) | `fightService.resolveFightAndApply` | ADD `fightNumber: pveFightsBefore + 1`, `offerType`. |
| `debut_step` | client beacon | `frontend/src/utils/debutAnalytics.js` | `{ step, msSinceStart, device }`; dedupe per step per fighter in sessionStorage; only while `summary.isDebut` / fighter has 0 PvE fights. Steps: 1 debut_home phase done; 2 `fight_accepted`; 3 `fighter_report_closed`; 4 `fight_resolve_started`; 5 reveal started (or immediate commit when the reveal is off); 6 result screen left (Next fight, Train, or tab change). |
| `fight_reveal` | client beacon | FightReveal `onDone` | `{ result, beatIndex, beatsTotal, speed, fightNumber }` (every PvE fight, not only the debut). |
| `next_goal_click` | client beacon | result screen buttons | `{ choice, fightNumber }`. |
| `section_tip` | client beacon | tips engine sequence end | `{ section, result }`. |

Server-side `track()` call sites stay literal strings (the enum drift test scans call sites). `tests/services/analyticsService.clientEvents.test.js` asserts the whitelist is exactly three: update to the new seven.

### D.2 `pveFightCount`

One home: `services/fightService.js` exports `pveFightCount(fighter)` = `(record.wins||0)+(record.losses||0)+(record.draws||0)`. Used by `pickOfferSlots`, `boardFingerprint`, `acceptOffer`, `resolveFightAndApply`. Frontend mirrors it in `frontend/src/utils/fighterMath.js` `pveFightCount(fighter)` (display gating only).

### D.3 Admin retention read: `firstSession`

`analyticsService.computeFirstSession(range)` added to the `Promise.all` in `computeRetention`; response gains:
```
firstSession: {
  cohort: number,                       // fighter_created in range (distinct users)
  stages: StageCounts,                  // whole cohort
  byDevice: { phone: StageCounts, desktop: StageCounts, unknown: StageCounts },
  bySource: [ { src: string, campaign: string|null, ...StageCounts } ],   // sorted by created desc
  msToBell: { n: number, median: number|null, p75: number|null }          // debut_step step=5 msSinceStart over the cohort
}
StageCounts = { created, debutAccepted, revealWatched, revealSkipped, debutResolved, fight2Accepted, fight3Resolved, returnedD1 }
```
Definitions (distinct cohort users, events at ANY time, not only in range):
- `debutAccepted`: `fight_accepted` with `meta.fightNumber === 1`
- `revealWatched` / `revealSkipped`: `fight_reveal` with `meta.fightNumber === 1` and `meta.result`
- `debutResolved`: `fight_resolved` `fightNumber 1`; `fight2Accepted`: `fight_accepted` `fightNumber 2`; `fight3Resolved`: `fight_resolved` `fightNumber 3`
- `returnedD1`: any event on `day === addDays(createdDay, 1)` (same rule as `computeRetentionCohorts.d1`)
Implementation: one aggregate for the cohort (`fighter_created` in range → userId, day, device, src, campaign), one aggregate over `{ userId: {$in}, type: {$in: [...]} }` projecting `userId, type, day, meta.fightNumber, meta.result, meta.step, meta.msSinceStart`, tally in memory (cohort is hundreds at most). Legacy events without `fightNumber` are simply not counted; the cohort only contains post-release fighters anyway.

---

## E. Frontend

### E.1 Fight reveal

New folder `frontend/src/components/fights/reveal/`:
- `revealModel.js` (pure, unit-tested like `renderEvent.test.js`): `buildRevealScript(breakdownView, { speed })` → `{ items: RevealItem[], totalBeats }`.
  `RevealItem = { kind: "round_card"|"beat"|"finish_card", round, durationMs, damage: [p, o] (interpolated cumulative %), event?, beatIndex? }`.
  Beat selection per round, in original order after selection: always every event with `type` in `knockdown|submission|takedown|camp|finish` or `templateKey === "wildcard_fired"`; then strikes by impact rank `strike_hurt 3 > ground_pound 2 = strike_body 2 > clinch_work 1 = strike_clean 1 > ground_control_carried 0` until the round has 4 to 6 beats (min 4 fill, max 6 cap on the optional ones; forced ones are never dropped); a round with fewer than 4 events plays them all. Damage per beat = previous round cumulative + (this round cumulative − previous) × (i+1)/n. Durations at 1x: beat 1600, knockdown/camp/wildcard beat 2500, round card 1500, finish card 3000; 2x halves. Round card label from `rounds[].roundWinner`/`dominant` (`10 to 9`, `10 to 8`, "Even round"). Finish card from `breakdownView.method` + `outcome` ("split" → SPLIT DECISION) + `header.outcomeWord` + round score tally.
- `FightReveal.jsx`: full-screen portal to `document.body`, `role="dialog" aria-modal="true"`, class `fight-reveal`, covers nav and sidebar. Props: `{ breakdownView, playerName, opponentName, campSessions (labels by sessionType from summary.campBreakdown), onDone({ result, beatIndex, beatsTotal, speed }) }`. Top: names, two damage bars, `R{n} {timestamp}`. Middle: beat feed (newest slides in on top, previous 2 to 3 fade). Beat text from `renderEvent(entry, { playerName, opponentName, fightId, index })` (index = the event's index within its round's full event list, so the seeded template matches the full report). `camp_*_fired` beats get a gold `CAMP: {session label}` chip and pulse the player's bar; `wildcard_fired` a red `WILDCARD` chip. Bottom: "Skip to result" (always), "2x" toggle. Reduced motion (`window.matchMedia("(prefers-reduced-motion: reduce)")`, same check as `CampTab.jsx`): no slide/pulse, same pacing, Skip works. Timer via `setTimeout` chain in a ref; cleared on unmount; speed change recomputes remaining durations.
- `reveal.css`.

Mounting and spoiler suppression (`frontend/src/App.jsx`):
- `handleResolve` no longer applies the result. It stores `pendingResult` (the full response) and either opens the reveal (`settings.playFightsOut !== false` and `breakdownView?.legacy !== true` and `Array.isArray(breakdownView?.eventLog)`) or calls `commitResolvedResult(result)` at once.
- `commitResolvedResult(result)` does everything the current tail does: `setLastFightSummary`, `setLastFightCommentary/Breakdown`, the message bar line, badge toasts, `setOverlayQueue` (belt/tier/banner), `loadFighter`, `loadGyms`, `setFeedRefreshKey`, camp state cleanup, `tutorialBus.emit("fight_resolved")`, and writes the sessionStorage restore record (below).
- Fighter refresh gate: `revealActiveRef`. `loadFighter` checks it; while active it sets `reloadPendingRef = true` and returns. The 60 s interval and every other caller go through `loadFighter`, so one choke point. On reveal end: commit, then one `loadFighter`. The sidebar, top bar, Home and the Fights tab (which still renders FightCamp under the overlay from the stale `acceptedFightId`) are hidden by the full-screen overlay; nothing refreshes beneath it.
- `energyOffer` cannot open under the overlay (no actions possible). Nothing else to gate.
- Reload mid-reveal: at resolve time write `sessionStorage["gnp_last_result:<fighterId>"] = JSON.stringify({ fightId, at: Date.now(), summary, breakdownView, commentary })`. On boot, after `loadFighter`, if that record exists, is under 30 minutes old, `fighter.acceptedFightId == null`, then set the result state directly (no reveal) and `setActiveTab("fights")`. Remove the record on `result_dismissed` or when a new fight is accepted. The resolve and the restore are the only writers.
- `fight_resolve_started`: new `tutorialBus` event emitted in `handleBeginFight` before `api.setWeightCut`.
- PvP: nothing wired. `FightReveal` takes only `breakdownView` + names, which the PvP breakdown read already produces, so PvP can adopt later.

### E.2 Result screen (`FightSummary.jsx`, `App.jsx` result branch)

- `NextGoalCard` (new, `frontend/src/components/fights/NextGoalCard.jsx`): renders `summary.nextGoal` by key with i18n; secondary line for `pvp_unlock` when present; hidden when `nextGoal` is missing (older payload). Placed under the hero tiles, above the body grid (above the fold on a phone).
- Hero tiles: add "Signing bonus +$500" line when `summary.signingBonus > 0`; `rankEarned` line "You're ranked #{rank}. Top 5 opens the title shot."
- XP card: `statLevelUps` listed first, then an "OVR {before} to {after}" line when `ovrAfter !== ovrBefore`.
- Buttons: `Next fight` (primary, `data-tut="result-continue"` kept) → dismiss + beacon `next_goal_click next_fight`; `Train in My Camp` (secondary, `data-tut="result-train"`) → dismiss + `handleNavTab("camp")` + beacon `train`. Both emit `result_dismissed`.
- "Full fight report": `FightSummary` gets prop `reportCollapsed`; when true the `description` column renders behind a toggle button (collapsed by default after a reveal, expanded when the reveal was off).

### E.3 Debut flow (tutorial config)

`frontend/src/constants/tutorialSteps.js` replaces the old 9 steps with:
```
debut_home:   { next: "debut_offer",  phases: [{ focus: ["debut-hero-cta","nav-fights"], doneOnTab: "fights", advance: clickFocus, tooltips: [{ anchor: ["debut-hero-cta","nav-fights"], title: "Your Debut", body: "Your promoter booked your first pro fight. Tap to meet your opponent.", bodyBottomNav: "... Tap Fight at the bottom of the screen." }] }] }
debut_offer:  { next: "debut_report", phases: [{ focus: "offer-accept", tab: "fights", advance: event "fight_accepted", skipIfAbsent: true, tooltips: [{ anchor: "offer-accept", title: "Accept the Fight", body: "Accepting costs 10 energy and books the fight. Tap Accept." }] }] }
debut_report: { next: "debut_camp",   phases: [{ focus: "fighter-report", tab: "fights", advance: event "fighter_report_closed", skipIfAbsent: true, tooltips: [{ anchor: "fighter-report", title: "Know Your Opponent", body: "This is your opponent. Your coach has marked the camp session that counters their style." }] }] }
debut_camp:   { next: null, completeLocally: true, phases: [{ focus: ["camp-finalise","fight-camp","camp-summary"], tab: "fights", advance: event "fight_resolve_started", skipIfAbsent: true, tooltips: [{ anchor: ["camp-finalise","fight-camp"], title: "Fight Camp", body: "Pick your sessions, then Begin Fight." }] }] }
STEP_ORDER = ["debut_home","debut_offer","debut_report","debut_camp","complete"]
```
`TutorialOverlay.jsx` changes: unknown/legacy `initialStep` → `"debut_home"`; a step with `completeLocally` does not call `advanceTutorial` on finish, it sets local `stepId = "complete"` and renders null (the server marks completion in the resolve; the gated `loadFighter` after the reveal unmounts the overlay); "End tutorial" calls `api.completeTutorial` then `onComplete` directly (no modal); delete `TutorialCompleteModal.jsx` and `TUTORIAL_COMPLETE`; drop `lastFightOutcome`/`variantSuffix`. Extract `resolveEl`, `resolveFocalEl`, `isVisible`, `measureEl`, `sameRect`, `foreignModalOpen` into `components/tutorial/tutDom.js` so the tips engine reuses them.

Debut weight cut default: in `handleFinaliseCamp`, after `setCampSummaryData`, `setWeightCut(pveFightCount(fighter) === 0 ? "easy" : null)` so Begin Fight is enabled at once on the debut (the player can still change it).

Energy offer suppression: `useEnergyOffer({ fighterId, suppressed: !!fighter?.tutorial && !fighter.tutorial.completed })`; when suppressed, `open` is a no-op and `openFromError` returns false (callers fall through to the normal message).

Home hero: `NextFightCard` renders a debut variant when `heroBout?.offerType === "Debut"` and `source === "offer"`: eyebrow "Your debut is booked", chip `Debut` (`home.next.chipDebut`), opponent line as today, one primary button "See your opponent" with `data-tut="debut-hero-cta"` → `onNavigate("fights")`; no Accept on Home for the debut. `BookingsList` chip map gets `Debut`.

Offer board: `offerIntel.buildCardModel` returns `[{ variant: "debut", offer }]` when a Debut offer is present (it is the only one). `OfferCard`: `diffBadgeMap.debut` → "Debut", `SpecialBanner` debut line "Your promoter booked a winnable first fight.", OVR pill class easy. `FightOffers`: when the board is a single Debut card, render the muted line "More offers open after your debut." under the grid and hide the callout footer button (unranked anyway). Add `data-tut="offers-footer"` on `.fight-offers-footer`.

Fighter report / camp: `FighterReport` shows an info row "Coach's pick" with `CAMP_SESSIONS[report.coachPick].label` when `report.coachPick`; `FightCamp` passes `coachPick={campState?.coachPick ?? campReport?.coachPick}` and `CampSessionCard` renders the "Coach's pick" chip on the matching key.

### E.4 Section tips and moment tips engine

- `frontend/src/constants/sectionTips.js`: `SECTION_TIPS` keyed by section key with `{ tab, when(fighter, ctx), tips: [{ focus, anchor, title, body }] }` and `MOMENT_TIPS` keyed by moment key `{ anchor, title, body(vars) }`. Copy verbatim from spec section 5. Keys mirror server `TIP_KEYS`.
- `frontend/src/hooks/useTips.js`: inputs `{ fighter, activeTab, campState, showCampSummary, lastFightSummary, boardOffers }`. Enabled only when `fighter.tutorial?.completed === true && fighter.settings?.sectionTips !== false`. On `activeTab` change (and on `campState`/`showCampSummary` change for `fightcamp`/`weightcut`), compute the section key for the tab (`TAB_TO_SECTION`: camp→camp, fights→fight (when `pveFightCount >= 1` and no `acceptedFightId`), fights+acceptedFightId→fightcamp (when `pveFightCount >= 1`), weight cut when `showCampSummary && pveFightCount >= 1`, rankings, events, hospital, pvp (when `pvpOnboarding.unlocked`), moves, sponsors, media). If the key is not in `tipsSeen` and `when()` holds → start the sequence: optimistic add to local `tipsSeen`, `api.markTipSeen(fighterId, key)`. Moment triggers: `moment_energy_low` when on fights with offers and `energy.current < FIGHT_ENERGY_COST[tier]`; `moment_health_low` when on fights with an acceptable offer and `health < 60`; `moment_first_loss` when a result screen with `recordChange === "L"` is shown; `moment_first_injury` when `summary.injuriesSustained.length > 0` (vars from the matching entry in `fighter.injuries` after the reload: `label`, `recoveryHoursLeft`). Sequence end → beacon `section_tip { section, result }` (moment tips send no beacon). Pause when the tab changes (no paused bar; tips are quiet), resume on return within the page session; a reload drops the remainder (already marked seen). Skip a tip whose anchor never appears within 3.5 s (same `SKIP_ABSENT_MS` idea).
- `frontend/src/components/tutorial/TipsOverlay.jsx`: ring + `TutorialTooltip` reuse through `tutDom.js`. `TutorialTooltip` gains `skipLabel` (here "Hide tips") so `onSkip` → `api.updateFighterSettings(id, { sectionTips: false })` + `onFighterRefresh` + beacon `hidden`. Button label "Got it" for every card (`buttonLabel`).
- Mount in `App.jsx` next to `TutorialOverlay`, mutually exclusive: TipsOverlay only when the tutorial overlay is not mounted.

Anchors required (data-tut), each must resolve on phone AND desktop:

| Anchor | Where | Status |
|---|---|---|
| `debut-hero-cta` | NextFightCard debut button (same component both layouts) | NEW |
| `nav-fights` | sidebar + bottom nav | exists |
| `offer-accept`, `offer-card` | OfferCard | exists |
| `fighter-report` | FighterReport portal | exists |
| `camp-finalise`, `fight-camp`, `camp-sessions` | FightCamp | exists |
| `camp-summary`, `weight-cut` | CampSummary portal | exists |
| `result`, `result-continue` | FightSummary / App | exists; `result-train` NEW |
| `camp-info`, `gym-sessions`, `energy` | CampBar / CoachPanel | exist (confirm `camp-info` renders on phone CampBar) |
| `offers-footer` | FightOffers footer | NEW |
| `rankings-table`, `rankings-tab` | RankingsTab | exist |
| `event-headliner`, `event-potential` | EventsTab | exist |
| `hospital-health`, `hospital-injuries` | HospitalTab | exist |
| `pvp-hub` | PvpHub root | NEW |
| `equipped-slots` | EquippedSlots | exists |
| `sponsors-root` | sponsorship/contracts tab root | NEW |
| `media-root` | MediaHub root | NEW |
| `profile-energy`/`m-vitals`, `profile-health`/`m-vitals` | FighterProfile / mobile strip | exist (moment tips) |

### E.5 Account toggles (`frontend/src/components/account/AccountTab.jsx`)

New `GameplaySection` between Notifications and Danger Zone with two `account-switch` rows: "Play fights out" (`settings.playFightsOut`) and "Section tips" (`settings.sectionTips`). Reads from a new `fighter` prop (App passes `fighter={fighter}`), writes via `api.updateFighterSettings(fighter._id, patch)` then `onFighterRefresh(fighter._id)`.

### E.6 api.js additions

```
updateFighterSettings: (id, patch) => request(`/fighters/${id}/settings`, { method: "PATCH", body: JSON.stringify(patch) })
markTipSeen: (fighterId, key) => request(`/tutorial/${fighterId}/tips/seen`, { method: "POST", body: JSON.stringify({ key }) })
```
`trackClientEvent` unchanged (new types pass through).

### E.7 i18n (`frontend/src/locales/en.json`)

New namespaces, copy verbatim from spec section 5: `tutorial.debut.*`, `tips.<section>.<n>.title/body`, `tips.moment.*`, `tips.buttons.gotIt/hide`, `reveal.*` (skip, speed, roundTo, evenRound, chips, finish words), `fights.summary.nextGoal.*`, `fights.summary.signingBonus`, `fights.summary.rankEarned`, `fights.summary.ovrLine`, `fights.summary.fullReport`, `fights.summary.nextFight`, `fights.summary.trainCamp`, `fights.offerCard.diffDebut`, `fights.offerCard.specialDebutSub`, `fights.board.debutMore`, `home.next.chipDebut`, `home.next.debutEyebrow`, `home.next.seeOpponent`, `account.gameplay.*`. No em or en dashes.

---

## F. File placement and task ordering

### Design rationale (short)

- Debut is a BOARD rule in `pickOfferSlots` + fingerprint, not a tutorial rule: the board service already owns "which opponents are on the board" and already regenerates on fingerprint change; the tutorial only teaches.
- Signing bonus paid in the resolve, in memory, under the existing resolve claim: the claim is the exactly-once mechanism this code already trusts for the purse; a second mechanism would be a second source of truth.
- `tutorialService` writes switch to `updateOne` on `tutorial.*` paths: `fighter.save()` from a parallel request would clobber the resolve's `tutorial.completed` (the advance and the resolve are concurrent on Begin Fight).
- `nextGoalService` is a new pure module instead of more code in `fightService` (2000+ lines, flagged as oversized; not refactored here).
- `pveFightCount` and `debutCoachPick` each have one home and are reused by every caller (no duplicated game logic).
- Reveal is pure presentation of the persisted breakdown (`buildBreakdownResponse` output); no engine or server change. sessionStorage restore avoids a new endpoint for "summary of a completed fight" (which would need to rebuild non-persisted notoriety lines).
- Tips engine reuses the tutorial's DOM helpers and tooltip through a small extraction rather than a second ring implementation.
- Existing violations touched but not fixed: `tutorialRoutes` lack ownership guards (fix is one line, requested above); `fightService` size; `offerIntel.js` is a hand mirror of `campService` classification.

### BACKEND list (root dirs only), in order

1. `consts/offerBoardConfig.js`: `OFFER_PURSE_MULT.Debut = 1.0`, export `DEBUT_OFFER_TYPE`. `consts/tutorialConfig.js`: A.7.
2. `models/fighterModel.js` (A.1), `models/opponentModel.js` (A.2), `models/analyticsEventModel.js` (A.4), `models/fightModel.js` comment.
3. `utils/startingStats.js` NEW: move `buildStartingStats` out of `services/fighterService.js` (fighterService imports it; behaviour identical).
4. `app.js`: `backfillFirstSession()` (A.5), called after `backfillTutorialForLegacyFighters()`.
5. `services/fightService.js`: `pveFightCount` (export), debut branch + `isDebut: {$ne:true}` in `pickOfferSlots`, `fightNumber`/`offerType` on both analytics metas, resolve: `pveFightsBefore`, `ovrBefore/After`, `rankBefore` → `rankEarned`, skip `resolveNemesisOnLoss` for Debut, signing bonus + completion before the main save, `summary` additions, lazy-require `nextGoalService`.
6. `services/offerBoardService.js`: fingerprint segment, JSDoc union.
7. `services/nextGoalService.js` NEW (B.5).
8. `services/campService.js`: `debutCoachPick`, `getFighterReport` + `getCampState` additions.
9. `services/championService.js`, `services/interviewService.js`, `services/calloutService.js`: `isDebut` exclusions/guards (C.2).
10. `services/tutorialService.js` + `controllers/tutorialController.js` + `routes/tutorialRoutes.js`: A.7 normalisation, atomic writes, `complete` without credit, `tips/seen`, `ownFighter`.
11. `services/fighterService.js` `updateSettings`; `controllers/fighterController.js` `patchSettings`; `routes/fighterRoutes.js` `PATCH /:id/settings`.
12. `services/analyticsService.js`: sanitizers (B.6), `deviceFromUserAgent`, `computeFirstSession` (D.3). `controllers/authController.js`: `fighter_created` tracks.
13. `services/dashboardService.js`: JSDoc unions only.
14. `data/debutOpponents.json`, `scripts/simDebutOvr.js`, `scripts/seedDebutOpponents.js`; edits to `scripts/seedOpponents.js`, `scripts/migrateRankingSystem.js` filters. Run the sim (no DB) locally; run the seed on LOCAL only; staging seed via the recipe; prod only with the owner's yes.
15. Tests (`tests/` mirroring): update `analyticsService.clientEvents.test.js` (whitelist), `fightService.offerSlots.test.js` (debut path: `$sample` on `isDebut` first, pool-empty fallthrough), `offerBoardService.test.js` (fingerprint segment); add `tutorialConfig.test.js` (legacy normalisation, `complete` rejected as advance), `nextGoalService.test.js` (priority table), `analyticsService.firstSession.test.js` (tally logic with stubbed aggregate), `campService.coachPick.test.js`.

### FRONTEND list (frontend/ only), in order

1. `frontend/src/api.js` (E.6); `frontend/src/utils/fighterMath.js` (`pveFightCount`); `frontend/src/utils/layout.js` (`isPhoneLayout()`: `.m-bottom-nav` displayed); `frontend/src/utils/debutAnalytics.js`; `frontend/src/locales/en.json` keys.
2. `components/fights/reveal/revealModel.js` + `revealModel.test.js`, `FightReveal.jsx`, `reveal.css`.
3. `App.jsx`: pending result + `commitResolvedResult`, `revealActiveRef` gate in `loadFighter`, reveal mount, sessionStorage restore on boot, `fight_resolve_started` emit, debut weight-cut default, `useEnergyOffer` suppression, `result-train` button, `fighter` prop to AccountTab, TipsOverlay mount.
4. `components/fights/NextGoalCard.jsx`, `FightSummary.jsx` additions (`reportCollapsed`, signing bonus, OVR line, rankEarned).
5. `constants/tutorialSteps.js` rewrite; `components/tutorial/tutDom.js` extraction; `TutorialOverlay.jsx` changes; delete `TutorialCompleteModal.jsx`; `TutorialTooltip.jsx` `skipLabel`.
6. `components/dashboard/NextFightCard.jsx` debut variant + `data-tut`, `BookingsList.jsx` chip; `components/fights/offerIntel.js` debut variant; `OfferCard.jsx`; `FightOffers.jsx` single-card line + `offers-footer`; `FighterReport.jsx` coach row; `FightCamp.jsx` / `CampSessionCard` chip.
7. `constants/sectionTips.js`, `hooks/useTips.js`, `components/tutorial/TipsOverlay.jsx`; new anchors `pvp-hub`, `sponsors-root`, `media-root`, `offers-footer`, `result-train`.
8. `components/account/AccountTab.jsx` GameplaySection.
9. Walk the whole debut flow at phone width (375×812) and desktop before handing to QA.

Both lists build against this file; the only cross-dependency is the response shapes above. The frontend can start with mocked `summary.nextGoal` etc.

---

## G. Risks and edge cases

1. Spoilers. Anything that reads the resolve response or refreshes the fighter before the finish card leaks the result: message bar, badge toasts, `overlayQueue` (belt/tier/banner modals), `loadFighter`, `loadGyms`, the 60 s interval, `setFeedRefreshKey`, the Fights tab re-rendering (FightCamp under the overlay), the Home dashboard refresh, PersonaMomentModal. Everything must flow through `commitResolvedResult`, and `loadFighter` must be the single gated refresh. QA: resolve with a slow network and confirm the sidebar record/cash/health do not change until the finish card.
2. Double signing bonus / lost bonus. Mongoose `save()` writes `$set iron: <hydrated>`; an atomic `$inc` placed before any later `save()` in the resolve is overwritten. Pay in memory before the main save (B.5). Migration step 2 pays owed bonuses once, guarded by `tutorial.version`. `complete()` must not credit. Test: resolve twice (second is 409), bonus once; End tutorial then fight, bonus once.
3. Advance vs resolve race on Begin Fight. Old `tutorialService.advance` does load-modify-`save()` of the whole fighter; concurrent with the resolve's `save()` it can revert `tutorial.completed` or clobber `iron`. Hence `updateOne` on `tutorial.*` paths only, and the client does not call advance for the final step.
4. Debut pool empty on an environment where the seed was not run (prod on release day). `pickOfferSlots` falls through to the normal board and logs; the player still gets fights but no Debut. Release runbook: seed debut opponents BEFORE deploying the code to prod, after the owner's yes.
5. Fingerprint change regenerates every live board once. Fine (24 h boards) but the first `GET /fights/offers` after deploy writes for every active player; no load concern at 85 accounts.
6. Debut opponent leaking elsewhere: nemesis (skipped on Debut), callout/beef targets (guards), champion seeding (filter), ranking roster (fixedRank null), `seedOpponents` gap-fill and `migrateRankingSystem` wipe (edited). Grep `Opponent.` again after the build.
7. Legacy mid-tutorial fighters on old step ids: migration rewrites them; `normaliseStep` covers stragglers; the client maps unknown ids to `debut_home`. A fighter at `debut_home` with an accepted fight already (accepted before the overlay mounted): `debut_offer` has `skipIfAbsent` and the event listeners for later phases catch up (existing behaviour).
8. Legacy 0-fight completed players are pulled back into the debut flow (spec 6). They already have the $500; `signingBonusPaidAt` is stamped so no second payout, and the result screen shows no bonus line for them. Acceptable and honest.
9. Analytics enum drift test and client-whitelist test will fail until updated; `fightNumber` is absent on historic events, the funnel ignores them by design.
10. sessionStorage restore: keyed by fighterId, 30 minute TTL, cleared on dismiss/accept; a stale record from another fighter on the same browser is ignored by key. If the restored summary predates a schema addition it may lack `nextGoal`: the card hides itself.
11. Reduced motion and 2x: the timer chain must be cancelled on unmount (tab close) and re-planned on speed change; a leaked timer would call `onDone` twice. Guard `onDone` with a ref.
12. Phone anchors: `camp-info` and `energy` live in CampBar, confirm they render in the phone layout; tips with absent anchors skip after 3.5 s so nothing strands, but the lesson is lost. Walk every section at 375 px.
13. Energy offer is suppressed while `tutorial.completed === false`; after End tutorial it is allowed again even before the debut (spec: the debut costs at most about 26 energy, fine).
14. `tutorialRoutes` ownership: existing gap; the new route must not repeat it.
15. `offerIntel.buildCardModel` and `OfferCard` assume Easy/Even/Hard; a Debut-only board must not fall into `FightHub` ("no offers") because `offers.length === 1` is non-zero: fine, but `showChecklist`/callout footer logic should be hidden for the debut board.
16. Dashboard `heroAction` still says "Pick Your Next Fight" with "1 offer waiting" in the `heroAction` object; the client ignores it for the debut hero. If a later Home redesign reads `heroAction.label` blindly, the debut hero copy regresses.
17. e2e suite (`E:\Projects\ground-and-pound-e2e`), will break and must be rewritten:
   - `tests/helpers/tutorial.ts` (`STEPS` list of old ids; `startTutorialAt` advances through them → 400).
   - `tests/tutorial-walkthrough.spec.ts`, `tutorial-full.spec.ts`, `tutorial-pause.spec.ts`, `tutorial-edge.spec.ts`, `tutorial-fight-camp.spec.ts`: all seed or assert old steps/titles ("Your Stats", training step, Rankings/Events/Hospital tour, completion modal). Replace with: debut flow end to end at phone and desktop (4 tips, reveal, Skip, result Next goal), pause/resume at `debut_offer`, End tutorial at `debut_home` then fight pays the bonus, reload mid-reveal lands on the result.
   - `tests/shop.spec.ts`: expects $500 after the fixture's `completeTutorial` → now $0 until the first fight. Fixture should play one API fight (`playApiFight` helper exists) or the test should assert against a fighter who fought.
   - `tests/fight.spec.ts` tests 1 and 2: expect three bouts on a fresh guest → now one Debut card. Either assert the debut board or advance the fixture past the debut with one API fight.
   - `tests/dashboard.spec.ts`: verify any assertion on the number of Home bookings.
   - `tests/auth.spec.ts` "End tutorial" path and `tests/api.spec.ts` idempotent complete: expected to pass (fields kept), verify.
   - `journey.spec.ts`, `fight-variants.spec.ts`, `mobile.spec.ts`, `moves-*`, `pvp*`: expected unaffected (first API fight is the debut and resolves normally); run them.
   - New: a phone-width debut test (spec 6) and a reveal Skip test.
18. Documentation upkeep after QA (pipeline step 6): GDD §21 rewrite, §7 debut slot, §10 reveal, §15.4 energy offer suppression; Library getting-started/offers/fight articles; changelog 2.4 entry (`major: true` is the owner's call).

Key files read for this contract: `E:\Projects\GroundAndPound\docs\first-session-spec.md`, `consts\tutorialConfig.js`, `services\tutorialService.js`, `controllers\tutorialController.js`, `routes\tutorialRoutes.js`, `models\fighterModel.js`, `models\opponentModel.js`, `models\fightModel.js`, `models\analyticsEventModel.js`, `models\fightBreakdownSchema.js`, `services\fightService.js`, `services\offerBoardService.js`, `consts\offerBoardConfig.js`, `services\campService.js`, `consts\campConfig.js`, `services\dashboardService.js`, `services\analyticsService.js`, `controllers\analyticsController.js`, `controllers\authController.js`, `services\fighterService.js`, `services\rankingService.js`, `services\championService.js`, `services\calloutService.js`, `services\interviewService.js`, `utils\fightBreakdownView.js`, `utils\fightResolution.js`, `app.js`, `scripts\seedOpponents.js`, `frontend\src\App.jsx`, `frontend\src\constants\tutorialSteps.js`, `frontend\src\components\tutorial\*`, `frontend\src\components\fights\{FightSummary,FightDescription,FightOffers,OfferCard,FighterReport,FightCamp,CampSummary,offerIntel}.jsx|js`, `frontend\src\components\fights\breakdown\{RoundBlock,renderEvent}.jsx|js`, `frontend\src\components\dashboard\{DashboardTab,NextFightCard}.jsx`, `frontend\src\components\account\AccountTab.jsx`, `frontend\src\hooks\{useEnergyOffer,useOfferBoard}.js`, `frontend\src\api.js`, `tests\services\{analyticsService.clientEvents,fightService.offerSlots}.test.js`, `E:\Projects\ground-and-pound-e2e\tests\helpers\tutorial.ts` and the tutorial specs.