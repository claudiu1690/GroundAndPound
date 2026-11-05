# Fight replay: Highlights with your cards. Architect contract

Build-feature step 2, 2026-11-04, for `docs/fight-replay-highlights-spec.md` (behaviour) and `mockups/fight-reveal-highlights.html` (look). Backend is JS Express + Mongoose at the repo root; frontend is Vite React in `frontend/src`. No em dashes anywhere in player copy, and none in this document.

## Assumptions and findings from the code (read before building)

1. **`wildcard_fired` does not exist on the backend today.** The spec calls it "existing". The frontend has a template and a chip for it, but `utils/fightBreakdown.js` never emits it and `resolveFight` does not export which round the wildcard fired in. It is built here (section C).
2. **Camp events currently claim credit for move-only fires.** `resolveRound` pushes `campGnpPosture`, `campStrikingAccuracy`, `campCardio`, `campTakedownDefence`, `campSubmissionEscape`, `campClinchControl`, `campBodyShot` when the camp **or** the move value fired (e.g. `fightResolution.js:561` `if (campGnp > 0 || moveGnp > 0)`, `:684`, `:369`, `:597-601`, `:644`, `:711`, `:723`), and `deriveFightDetails.campAllowed()` returns true when `sessionBonuses` is empty. A fighter with Full Mount and no camp gets a "ground and pound camp work is paying off" line, and with this feature a gold "Camp paid off" card for a session that is not in the corner strip. Rule §7.4 makes this a required fix (section A.3). It is display-only; the golden fixture is regenerated once (procedure in A.5).
3. **Takedown attempts are not persisted.** `roundStats` has landed takedowns only; a failed player shot leaves no trace in the engine output. The counters show "Takedowns" as landed `you | opp`, not `landed/attempted`. Inventing attempts would break rule §7.5. Opponent shots that were stuffed by a fired Sprawl become a logged `takedown_stuffed` event (new), so that moment is real where it matters.
4. **"Real time" means the logged exchange's time.** All breakdown timestamps are seeded derivations (`fightBreakdown.js` slotting). Rule §7.3 is satisfied when a `move_fired` entry carries exactly the timestamp of the exchange event it is attached to, or `null`. Nothing here makes other timestamps "more real".
5. **Merged entries** (`buildMoveBonuses` collapses same `bonusType|triggerCondition`, e.g. Full Mount + Top Control) fire as one. One `move_fired` event carries both ids; the reveal plays one slam (highest rarity, then loadout order) and lights and counts both corner cards. They can never fire separately, so the second move never gets its own slam. Accepted simplification.
6. **PvP stays out.** `pvpFightService` passes no `moveBonuses` and no wildcard, so PvP breakdowns contain no `move_fired`/`wildcard_fired` events and `loadout` is `null`. The shared renderer must still tolerate them (it does: unknown keys fall back).
7. Frontend unit tests (`revealModel.test.js`, `renderEvent.test.js`) only run through `tests/frontend/firstSession.vitestFiles.qa.test.js` (node:test shim). New frontend test files must be registered there.
8. Reading time = 900 ms + 280 ms per word, on the short line only. 2x halves every duration including the finish card's 4 s auto-advance.

---

## A. Engine change (`utils/fightResolution.js`)

### A.1 What is captured

Per round, a list of **move firings**: every PROC or SIGNATURE `moveBonuses` entry whose `triggerCount` rose during the round, with the **site** (which part of the round's logic raised it) and the site's own **outcome** where the site knows it. PASSIVE entries (and `persona:*` entries, and legacy entries with no `effectType`) are never recorded.

Round record addition (`resolveFight` → `rounds[].moveFired`):

```js
moveFired: [{
  moveId:      "SPRAWL_INSTINCT",            // entry.moveId
  moveIds:     ["SPRAWL_INSTINCT"],          // entry.moveIds ?? [entry.moveId]
  bonusType:   "SPRAWL_SUCCESS",
  effectType:  "PROC",                        // "PROC" | "SIGNATURE"
  site:        "takedown_opponent",           // see table
  siteOutcome: "stuffed",                     // site-specific or null
  count:       1                              // triggerCount delta at this site
}]
```

`resolveRound` returns `moveFired` next to `campCommentary`; `resolveFight` copies it into the `rounds.push({...})` record. Nothing else in the result changes shape except `wildcard` (A.4).

### A.2 How: a mark-and-diff recorder, pure bookkeeping

Inside `resolveRound`, after `moveBonuses` is known:

- `mark = moveBonuses.map(b => b.triggerCount || 0)` taken once at the top.
- `note(site, siteOutcome)`: for each entry index `i` where `(moveBonuses[i].triggerCount || 0) > mark[i]` and `effectType` is `PROC` or `SIGNATURE` and `moveId` does not start with `persona:`, push a record with `count = now - mark[i]`; then `mark = now`.

No `Math.random`, no reads that feed any numeric path, no change to any helper signature (`triggerBonus`, `triggerGatedMoveBonus`, `fireSignatureOnce`, `markSignatureApplied` are untouched). `note` call sites, in order of the existing code:

| # | Where (after which existing block) | `site` | `siteOutcome` | Catches |
|---|---|---|---|---|
| 1 | After the opponent-stamina block (`oStamina` computed, ~line 383) | `round_start` | `null` | STAMINA_DRAIN (Second Wind) |
| 2 | Ground continuation: after the escape roll and the GnP block, before the top sub attempt | `ground_top` if player on top else `ground_bottom` | `"escaped"` if bottom escaped, else `"held"` | GNP_DAMAGE from top (Full Mount / Top Control), SIG_KILLER_INSTINCT (Crossface, marked before the roll), GROUND_DAMAGE_REDUCTION / SIG_IRON_RECOVERY via `reduceBottomDamage` |
| 3 | Ground continuation: after the top sub attempt block | `submission_player` if player on top else `submission_opponent` | `"finished"` if `finished` else `"defended"` | SUBMISSION_SUCCESS, SIG_SUBMISSION_HUNT, ESCAPE_PROBABILITY |
| 4 | Ground continuation: after the guard sub block | `submission_opponent` if player on top else `submission_player` | same rule | same lanes, guard side |
| 5 | Player takedown landed: after the GnP bonus block (`opponentDamage = gnpDamage`) | `takedown_player` | `"landed"` | GNP_DAMAGE, SIG_TAKEDOWN_BLITZ |
| 6 | Player takedown: after the sub attempt block | `submission_player` | finished/defended | SUBMISSION_SUCCESS, SIG_SUBMISSION_HUNT |
| 7 | Opponent shoots: right after `tdSucceeded` is decided | `takedown_opponent` | `"stuffed"` if `!tdSucceeded` else `"landed"` | SPRAWL_SUCCESS (Sprawl) |
| 8 | Opponent takedown landed: after `reduceBottomDamage(...)` | `ground_bottom` | `"held"` | GROUND_DAMAGE_REDUCTION (passive, filtered), SIG_IRON_RECOVERY, ALL_DAMAGE_REDUCTION (passive, filtered) |
| 9 | Opponent sub attempt: after `subSucceeded` is decided | `submission_opponent` | `"finished"` if `subSucceeded` else `"defended"` | ESCAPE_PROBABILITY (Hip Escape) |
| 10 | Striking: after `opponentDamage = Math.round(plStrike * pStaminaMod)` and before the flash KO checks | `striking` | `null` (outcome derived in the breakdown) | STRIKE_DAMAGE procs (Second Gear, Deep Waters), CLINCH_DAMAGE (Dirty Boxing), SIG_FINISHER_STRIKE (Overhand Right), SIG_FAST_START (Superman Punch), OPPONENT_DAMAGE_REDUCTION / ALL_DAMAGE_REDUCTION (passive, filtered) |
| 11 | After line 778 `if (gritUsed) triggerBonus(moveBonuses, 'FLASH_KO_RESISTANCE')` | `defence` | `null` | FLASH_KO_RESISTANCE (Fighting Spirit) |

The `mark` update at every `note` means a passive's rise never leaks into a later site's delta. An entry recorded at two sites in one round produces two records (the recorder is generic; in today's engine each entry fires at most once per round).

### A.3 Camp commentary fix (display-only, required by §7.4)

The seven `campCommentary.push(...)` calls fire on the **camp** value only:
- `campCardio`: `cardioBonusValue > 0`
- `campGnpPosture` (both sites): `campGnp > 0`
- `campStrikingAccuracy`: `campStrike > 0`
- `campBodyShot`: `bodyBonus` present (already the camp entry; keep the `bodyBonus &&` guard, drop the move-only path)
- `campClinchControl`: `clinchBonus` present
- `campTakedownDefence`: `campSprawl > 0 && !tdSucceeded`
- `campSubmissionEscape`: `campEscape > 0 && !subSucceeded`

`campCommentary` is read only by the legacy `commentary` lines and by `deriveFightDetails` (both display). No numeric path reads it.

### A.4 Wildcard round export

`resolveFight` returns `wildcard: wildcard ? { ...wildcard, countered: wildcardCountered, round: wildcardRound } : null` on both return paths. `wildcardRound` already exists locally. Nothing else changes; the stat boost logic is untouched.

### A.5 Maths-unchanged guarantee

- No new `Math.random` call, no reordering of existing ones, no new numeric read. The recorder reads `triggerCount` only.
- `tests/utils/fightResolution.golden.test.js` pins outcome, winner, finishCause, health, stamina, every round's damage/health/event/control, every entry's `triggerCount`, and the **total RNG draw count** per scenario. Its `summarise()` does not include `moveFired`, so A.1/A.2 cannot move the fixture. A.3 changes `rounds[].campCommentary` in scenarios where a move fired on a camp lane.
- Procedure for the backend dev, in this order: (1) `npm test` green before touching the engine; (2) copy `tests/fixtures/fightResolution.golden.json` to the scratchpad; (3) make A.1 to A.4; (4) run the golden test and confirm every failure message names only a `campCommentary` array (write a throwaway diff in the scratchpad that deep-compares old and new output with `campCommentary` removed; it must be equal, including `rngDraws`); (5) `REGEN=1`; (6) the regenerated fixture ships with the change; its diff must touch only `campCommentary` lines.
- New assertion in `tests/utils/specialMovesFightIntegration.test.js`: for a seeded fight with a full loadout, for every PROC/SIGNATURE entry, `sum(rounds[].moveFired[].count where moveId matches) === entry.triggerCount`, and every record's `moveIds` equals the entry's `moveIds ?? [moveId]`.

### A.6 `buildMoveBonuses` (`services/specialMovesService.js`)

Add `rarity: ownedEntry.rarity` to every entry it builds (merged entries take the first move's rarity; `moveIds` order is preserved). Additive field on a `Mixed` snapshot; nothing reads it in the engine. Used by the loadout snapshot (B.3). Legacy frozen snapshots without it fall back to the fighter's owned rarity at resolve.

---

## B. Breakdown and eventLog

### B.1 `move_fired` event (engine perspective, persisted)

```js
{
  round: 2,
  timestamp: "4:09" | null,          // anchor's timestamp, or null (round-only)
  type: "move",
  actorIsPlayer: true,               // always true in PvE (the player's card)
  templateKey: "move_fired",
  vars: {
    strike: null, sub: null, position: null, bodyPart: null,   // existing slots, unused
    moveIds: ["SPRAWL_INSTINCT"],
    bonusType: "SPRAWL_SUCCESS",
    effectType: "PROC",              // "PROC" | "SIGNATURE"
    outcome: "stuffed",              // see B.2 vocabulary, or null
    count: 1
  }
}
```

**Outcome vocabulary** (string | null): `stuffed`, `takedown_landed`, `ground_pound`, `absorbed`, `escaped`, `sub_attempt`, `sub_finished`, `tapped`, `hurt`, `landed`, `knockdown`, `finish`. Defined once in the `EventLogEntry` JSDoc in `utils/fightBreakdownView.js`; the frontend mirrors it as a display enum in `reveal/highlightLines.js` (same pattern as `frontend/src/constants/specialMovesCatalog.js` mirroring backend enums).

### B.2 Derivation (`utils/fightBreakdown.js`)

Inputs per round: `r.moveFired` (default `[]`), `engineResult.wildcard` (`{ stat, countered, round }` or null).

Changes to `deriveFightDetails` / `buildRoundEvents`, in order:

1. **Forced submission attempts.** Before the sub-attempt derivation: if any record has `site === "submission_player"`, `subP = Math.max(subP, 1)`; `submission_opponent` → `subO = Math.max(subO, 1)`. The engine really attempted; the display roll (`sub:top` 0.30) may otherwise hide it. `roundStats.subAttempts*` and the `submission_attempt` event stay in agreement because `addSubEvents` reads these counts.
2. **`wildcard_fired`** first in the round when `wildcard && !wildcard.countered && round === wildcard.round`: `{ type: "wildcard", templateKey: "wildcard_fired", actorIsPlayer: false, priority: 0, _roundOnly: true, vars: { stat: wildcard.stat } }`. Round-only (`timestamp: null`): the boost shaped every opponent exchange that round, not one.
3. **`takedown_stuffed`** when a record has `site: "takedown_opponent", siteOutcome: "stuffed"`: `{ type: "takedown", templateKey: "takedown_stuffed", actorIsPlayer: false, priority: 0, vars: { strike: takedownVar(opponentStyle, fightId, round, "tdstuff"), position: null } }`. Template exists at `eventTemplates.js:50`. Emitted whether or not a camp event exists.
4. Normal events as today (camp, strikes, takedown, ground, subs, finish).
5. **Anchor resolution and `move_fired` emission**, one event per record, in record order. Anchor search runs over the round's event list, first match wins:

| `site` / `siteOutcome` | Anchor search order (actor in brackets) | `outcome` |
|---|---|---|
| `takedown_opponent` / stuffed | `takedown_stuffed` [opp] | `stuffed` |
| `takedown_opponent` / landed | `takedown_secured` [opp] | `takedown_landed` |
| `takedown_player` / landed | finish `tko_finish_ground` [you] → `ground_pound` [you] → `takedown_secured` [you] | `finish` if anchor is the finish, `ground_pound` if `ground_pound`, else `takedown_landed` |
| `ground_top` / held | finish `tko_finish_ground` [you] → `ground_pound` [you] → `ground_control_carried` [you] | `finish` / `ground_pound` |
| `ground_top` / escaped | none | `escaped` |
| `ground_bottom` | `ground_pound` [opp] → `takedown_secured` [opp] → `ground_control_carried` [opp] | `absorbed` |
| `submission_player` / finished | `submission_finish` [you] | `sub_finished` |
| `submission_player` / defended | `submission_attempt` [you] (guaranteed by step 1) | `sub_attempt` |
| `submission_opponent` / finished | `submission_finish` [opp] | `tapped` |
| `submission_opponent` / defended | `submission_attempt` [opp] (guaranteed by step 1) | `escaped` |
| `striking` | finish `ko_finish`/`tko_finish_strike` [you] → `knockdown` [you] → `strike_hurt` [you] → `strike_body` [you] → `strike_clean` [you] | `finish` / `knockdown` / `hurt` (anchor `strike_hurt`) / `landed` |
| `defence` | `strike_hurt` [opp] → `ground_pound` [opp] → `strike_clean` [opp] | `absorbed` |
| `round_start` | none | `null` |

   A record with no anchor becomes a round-only event (`_roundOnly: true`, `timestamp: null`). The `move_fired` event is `{ type: "move", templateKey: "move_fired", actorIsPlayer: true, priority: 0, _anchor: <event or null>, vars: {...} }`.

6. **Camp combo re-anchoring.** When a `move_fired` has an anchor and the round contains a `camp_*_fired` event on the same lane (`SPRAWL_SUCCESS` → `camp_takedown_defence_fired`, `ESCAPE_PROBABILITY` → `camp_submission_escape_fired`, `GNP_DAMAGE`/`SIG_TAKEDOWN_BLITZ` → `camp_gnp_fired`, `STRIKE_DAMAGE`/`SIG_FINISHER_STRIKE`/`SIG_FAST_START` → `camp_striking_accuracy_fired`, `CLINCH_DAMAGE` → `camp_clinch_fired`), that camp event gets `_anchor` = the same anchor. Camp events in rounds with no fired move keep today's slotting. `camp_cardio_fired` is never re-anchored.
7. **Keep rule.** Forced set = finish, every `move`, `wildcard`, `takedown_stuffed`, and every event referenced as an `_anchor`. Cap = `6 + (count of move + wildcard + takedown_stuffed events)`. Trimming removes only non-forced events, lowest priority first (existing comparator). Rounds with no fired move and no wildcard keep today's 3 to 6 invariant exactly (existing test `fightBreakdown.test.js:374` still holds).
8. **Timestamp slotting.** Slot only *timed* events: not `_roundOnly`, not carrying `_anchor`. Then anchored events take `_t = anchor._t` and are placed immediately after the anchor, camp before move (combo). Round-only events: `wildcard_fired` and `round_start` moves at the start of the round; all other round-only moves at the end before the finish. `eventLog.push` writes `timestamp: e._t == null ? null : fmtTime(e._t)` and copies `vars.moveIds, bonusType, effectType, outcome, count, stat` (null/`[]` when absent).

### B.3 Loadout snapshot (new pure module `utils/fightLoadoutSnapshot.js`)

`buildLoadoutSnapshot({ moveBonuses, sessionBonuses, equippedOrder, ownedRarities })` → 

```js
{
  moves: [{
    moveId: "THE_FINISHER", name: "Overhand Right", rarity: "LEGENDARY",
    effectType: "SIGNATURE", bonusType: "SIG_FINISHER_STRIKE",
    triggerCondition: "OPPONENT_HEALTH_BELOW_75", art: "the_finisher",
    triggered: true, firedCount: 1
  }],
  camp: [{
    sessionType: "TAKEDOWN_DEFENCE", label: "Takedown Defence Drilling",
    matchStatus: "MATCHED", triggered: true, firedCount: 1
  }]
}
```

- `moves`: expand each `moveBonuses` entry over `moveIds ?? [moveId]`; skip `persona:*`; skip ids not in `SPECIAL_MOVES_BY_ID` (warn); dedupe by `moveId`; `rarity = entry.rarity ?? ownedRarities[moveId] ?? null`; `triggered = !!entry.triggered`, `firedCount = entry.triggerCount || 0` (a merged entry gives every id the same count). Sort by index in `equippedOrder` (fighter.specialMovesEquipped), unknown ids last in input order.
- `camp`: one row per `sessionBonuses` entry (these are the booked sessions that carry a bonus; UNMATCHED zero-value sessions are already excluded by `buildSessionBonuses`).
- Never throws; empty arrays on bad input.

Called in `fightService.resolveFightAndApply` right after `deriveFightDetails`, with `result.moveBonuses`, `result.sessionBonuses`, `fighter.specialMovesEquipped`, and a rarity map from `fighter.specialMovesOwned`. Stored at `fight.breakdown.loadout`. `fight.breakdown.version` becomes `2` (frontend gates on field presence, not version; `version == null` stays the only legacy check).

### B.4 Schema (`models/fightBreakdownSchema.js`, `models/fightModel.js`)

- `eventLogSchema.timestamp`: `{ type: String, default: null }` (drop `required`).
- `eventLogSchema.type` comment: add `move|wildcard`. The field has no enum, so no enum change.
- `eventLogSchema.vars` adds: `moveIds: { type: [String], default: undefined }`, `bonusType`, `effectType`, `outcome`, `stat` (`String, default: null`), `count: { type: Number, default: null }`. Strict mode would strip them otherwise.
- New `loadoutSchema` (`_id: false`) with `moves: [moveRowSchema]`, `camp: [campRowSchema]`, fields as B.3. Exported.
- `fightModel.js` `breakdown.loadout: { type: loadoutSchema, default: undefined }`. `pvpFightModel.js` unchanged (PvP never writes it).

No index changes. No Redis keys, no BullMQ jobs (the resolve is synchronous).

### B.5 View (`utils/fightBreakdownView.js`)

- `eventLogOut` passes `timestamp` through unchanged (may be null) and all `vars` fields (existing four plus `moveIds` (default `[]`), `bonusType`, `effectType`, `outcome`, `stat`, `count`).
- Response gains `loadout: breakdown.loadout ? { moves: [...], camp: [...] } : null` (plain objects, same field names).
- Perspective swap: `move`/`wildcard` events flip `actorIsPlayer` like every other event (PvE never swaps; PvP never has them).

### B.6 Degrade rules

- Fights with `breakdown.version === 1` (no `loadout`, no `move`/`wildcard` events): API returns `loadout: null`; FightDescription hides "Your corner"; FightDrawer keeps its camp outcomes block.
- Legacy fights (`version == null`): unchanged thin payload.
- A fresh fight with no moves and no camp: `loadout: { moves: [], camp: [] }` → the corner strip shows the muted line.
- Legacy frozen `fightCamp.moveBonuses` entries without `effectType`: never emit events (treated as passive by the recorder); the loadout row uses the catalog `effectType`, so "What fired" still shows the move with its count.

---

## C. Wildcard: real data for the line

`wildcard.stat` (`str|spd|leg|wre|gnd|sub|chn|fiq`, generated by `campService.generateWildcard`) is persisted on the event as `vars.stat`. Frontend `WILDCARD_AREA` (in `eventTemplates.js`): `str` "knockout power", `spd` "speed combinations", `leg` "a kicking game", `wre` "a wrestling game", `gnd` "ground and pound", `sub` "submission chains", `chn` "durability", `fiq` "fight IQ". Lines substitute `{area}`; they never invent a habit. The existing `wildcardText` (long description, same stat) remains in the summary and drawer. `wildcard_fired` is emitted only when the boost actually applied (not countered); a countered wildcard stays a summary fact (`campBreakdown.wildcard.wasCountered`), not a moment.

---

## D. API contract

Shared JSDoc home: `utils/fightBreakdownView.js` gains `@typedef EventLogEntry`, `@typedef LoadoutMoveRow`, `@typedef LoadoutCampRow`, `@typedef LoadoutSnapshot`, `@typedef BreakdownView`, with the outcome vocabulary. `fightService.getFightBreakdown`, `pvpFightService.getFightBreakdown`, `fightController.getFightBreakdown`, and the resolve response's `breakdownView` reference it. `frontend/src/components/fights/reveal/revealModel.js` header repeats the field list verbatim (the client cannot import it).

### D.1 `POST /fights/resolve/:fighterId` (existing)

Request unchanged. Response unchanged except `breakdownView` (shape D.2). `summary.campBreakdown` unchanged. Errors unchanged (`FIGHT_ALREADY_RESOLVED` 409, etc.).

### D.2 `GET /fights/:fightId/breakdown` (existing) and `breakdownView`

```jsonc
{
  "fightId": "…", "kind": "pve", "legacy": false,
  "outcome": "KO/TKO", "method": "KO", "finishRound": 4, "finishTime": "2:20",
  "youWon": true, "perspective": "player",
  "header": { "playerName": "…", "opponentName": "…", "tier": "Amateur", "campGrade": "A",
              "weightCut": { "label": "easy", "roll": 0 }, "outcomeWord": "VICTORY" },
  "introTemplateKey": "standard", "resultContextKey": "standard",
  "rounds": [ /* unchanged */ ],
  "eventLog": [
    { "round": 2, "timestamp": "4:09", "type": "takedown", "actorIsPlayer": false,
      "templateKey": "takedown_stuffed",
      "vars": { "strike": "double-leg", "sub": null, "position": null, "bodyPart": null,
                "moveIds": [], "bonusType": null, "effectType": null, "outcome": null, "stat": null, "count": null } },
    { "round": 2, "timestamp": "4:09", "type": "camp", "actorIsPlayer": true,
      "templateKey": "camp_takedown_defence_fired", "vars": { /* nulls, moveIds: [] */ } },
    { "round": 2, "timestamp": "4:09", "type": "move", "actorIsPlayer": true,
      "templateKey": "move_fired",
      "vars": { "strike": null, "sub": null, "position": null, "bodyPart": null,
                "moveIds": ["SPRAWL_INSTINCT"], "bonusType": "SPRAWL_SUCCESS", "effectType": "PROC",
                "outcome": "stuffed", "stat": null, "count": 1 } },
    { "round": 2, "timestamp": null, "type": "wildcard", "actorIsPlayer": false,
      "templateKey": "wildcard_fired",
      "vars": { "strike": null, "sub": null, "position": null, "bodyPart": null,
                "moveIds": [], "bonusType": null, "effectType": null, "outcome": null, "stat": "leg", "count": null } }
  ],
  "campOutcomes": [ /* unchanged */ ],
  "wildcardText": "has added a dangerous kicking game recently",
  "totals": { /* unchanged */ },
  "loadout": {
    "moves": [
      { "moveId": "THE_FINISHER", "name": "Overhand Right", "rarity": "LEGENDARY", "effectType": "SIGNATURE",
        "bonusType": "SIG_FINISHER_STRIKE", "triggerCondition": "OPPONENT_HEALTH_BELOW_75", "art": "the_finisher",
        "triggered": true, "firedCount": 1 },
      { "moveId": "HEAVY_HANDS", "name": "Heavy Hands", "rarity": "UNCOMMON", "effectType": "PASSIVE",
        "bonusType": "STRIKE_DAMAGE", "triggerCondition": "ALWAYS", "art": "heavy_hands",
        "triggered": true, "firedCount": 5 }
    ],
    "camp": [
      { "sessionType": "TAKEDOWN_DEFENCE", "label": "Takedown Defence Drilling", "matchStatus": "MATCHED", "triggered": true, "firedCount": 1 },
      { "sessionType": "CARDIO_PUSH", "label": "Cardio Push", "matchStatus": "PARTIAL", "triggered": false, "firedCount": 0 }
    ]
  }
}
```

- `timestamp` is `string | null` from now on (every consumer must handle null).
- `loadout` is `null` for version-1 fights and for PvP.
- Errors unchanged: 404 `fight_not_found` (invalid id, missing, or not owned), 500 generic.

### D.3 `GET /pvp/fights/by-id/:fightId/breakdown`

Same `BreakdownView` type. `loadout: null`, no `move`/`wildcard` events. No code change beyond the shared view builder.

---

## E. Frontend

### E.1 Model (`reveal/revealModel.js`, rewritten; keep the filename)

Exports: `buildHighlightScript(view, { speed })` → `{ items, totalHighlights, totalMs }`, plus `selectHighlights(roundEvents, firedSoFar)`, `readingMs(text)`, `canPlayReveal(view)` (unchanged), constants.

**Durations at 1x (`baseMs`)**: `COUNTERS_MS 500` (round_start), `QUIET_MS 1600`, `ROUND_CARD_MS 1000`, `SIG_SLAM_MS 2600`, `PROC_SLAM_MS 2100`, `CAMP_MS 2000`, `WILD_MS 2000`, `FINISH_HIT_MS 1600`, `FINISH_CARD_MS 4000`, `readingMs = 900 + 280 * words`. Card holds are `max(fixed, readingMs(shortLine))`; knockdown/takedown/submission/big strike use `readingMs` alone. `durationMs = baseMs / speed`.

**Item kinds**:

```js
// every item: { kind, round, baseMs, durationMs, damage:[p,o], clock:{round,timestamp|null},
//               counters:{ strikes:[p,o], takedowns:[p,o] } (cumulative through this round),
//               corner:{ moves:{ [moveId]: count }, camp:{ [sessionType]: true } } (state after this item) }
round_start   { passives: [moveId] }               // round 1 only lists triggered passives (pill)
highlight     { hkind: "move"|"camp"|"wildcard"|"knockdown"|"submission"|"takedown"|"big_strike"|"finish_hit",
                event, eventIndex, line, combo?: { event, eventIndex, line }, move?: LoadoutMoveRow,
                ticks: [moveId], flash: bool, shake: bool }
quiet         { variant: 0|1|2 }
round_card    { winner, dominant, score }           // as today
finish_card   { methodKey, youWon, outcomeWord, finishRound, finishTime, tally, whatFired }
```

**Selection per round** (`selectHighlights`):

1. Index the round's events in log order. Build `absorbed`: every non-move event that shares `round + timestamp` with a `move_fired` event **and** has type `knockdown`, `takedown`, or `submission` (not finish). These moments are told by the card line, not shown twice.
2. Candidates, in log order: finish event → `finish_hit` (prio 0); `move_fired` where at least one `moveIds` entry has not fired yet this fight → `move` (prio 1), with `combo` = the camp event immediately before it with the same timestamp, if any (that camp event is then not a separate candidate); `move_fired` already seen → a **tick** (zero duration, appended to `ticks` of the next kept item in the round, else to the round_card); camp (not consumed) → prio 2; `wildcard_fired` → prio 3; knockdown not absorbed → prio 4; `submission_attempt` not absorbed → prio 5; `takedown_secured` not absorbed → prio 6; `strike_hurt` → prio 7. Routine strikes, `ground_pound`, `takedown_stuffed`, `ground_control_carried` never become highlights.
3. Keep the 4 best by (prio, log order); restore log order. A combo counts as one.
4. `corner` state: moves increment per `move_fired.vars.count` for every id in `moveIds` when the item (or its tick) plays; camp lights when a `camp_*_fired` plays (map via existing `CAMP_EVENT_SESSION`). Passives: lit from round 1 when `loadout.moves[].effectType === "PASSIVE" && triggered`.
5. No candidates → one `quiet` item (variant = seededPick index on `${fightId}:quiet:${round}`).
6. `finish_card.whatFired` = `loadout` rows verbatim (true totals, so Skip shows the same numbers as watching to the end), plus per move `bestOutcome` = highest-ranked `outcome` among its `move_fired` events (`finish > knockdown > sub_finished > stuffed > tapped > takedown_landed > ground_pound > hurt > escaped > absorbed > sub_attempt > landed > null`).
7. `flash`/`shake`: signature slam → both; proc slam → shake only when `outcome` is `knockdown` or `finish`; knockdown → both; finish_hit → both; wildcard → shake; camp → none.

**Legacy view** (no `loadout`, or no `move` events): corner strip is built from `campOutcomes` only (chips, `triggered`); no slams; counts shown on the finish card from `loadout` when present. When `loadout` is `null` the corner strip is hidden.

### E.2 Short lines (`reveal/highlightLines.js`, new)

`shortLine(event, ctx)` → string. Picks with the same djb2 `seededPick` (export it from `renderEvent.js`) seeded by `${fightId}:${round}:${eventIndex}:hl`, and substitutes `{actor} {target} {move} {trigger} {area} {sub} {strike}`. Two or three variants per key, 8 to 10 words, outcome-specific. No em dashes.

Keys: `knockdown.you|them`, `takedown_secured.you|them`, `submission_attempt.you|them`, `submission_finish.you|them`, `ko_finish.you|them`, `tko_finish_strike.you|them`, `tko_finish_ground.you|them`, `strike_hurt.you|them`, `camp_takedown_defence_fired`, `camp_submission_escape_fired`, `camp_gnp_fired`, `camp_cardio_fired`, `camp_striking_accuracy_fired`, `camp_clinch_fired`, `wildcard_fired` (uses `{area}`), `quiet` (3 variants), and `move_fired[bonusType][outcome | "default"]`.

Required `move_fired` cells (others fall back to `default`, then to the generic "`{move}` fires: `{trigger}`."):

| bonusType | outcome | sample line |
|---|---|---|
| SPRAWL_SUCCESS | stuffed | "Hips back. Stuffed flat." / "He shoots. Nothing there. Sprawled." |
| SPRAWL_SUCCESS | takedown_landed | "Sprawl fires, but he still drags it down." |
| ESCAPE_PROBABILITY | escaped | "Caught, then gone. One hip escape and out." |
| ESCAPE_PROBABILITY | tapped | "Hip escape fires. Not enough this time." |
| GNP_DAMAGE | ground_pound | "Full mount. Heavy shots from the top." |
| GNP_DAMAGE | finish | "Top position. The shots do not stop. It's over." |
| SIG_TAKEDOWN_BLITZ | takedown_landed, ground_pound, finish | "First takedown of the night. Planted hard." |
| SUBMISSION_SUCCESS / SIG_SUBMISSION_HUNT | sub_attempt | "The neck is wrapped. He fights it off." |
| SUBMISSION_SUCCESS / SIG_SUBMISSION_HUNT | sub_finished | "The neck is wrapped. He taps." |
| STRIKE_DAMAGE / SIG_FINISHER_STRIKE / SIG_FAST_START / CLINCH_DAMAGE | landed | "The {move} lands. He feels that one." |
| same | hurt | "He's hurt. The {move} lands clean." |
| same | knockdown | "He's hurt. The {move} lands. He's down!" |
| same | finish | "The {move} lands. He's out!" |
| STAMINA_DRAIN | null | "The tank should be empty. It isn't." |
| FLASH_KO_RESISTANCE | absorbed | "Hurt, not gone. He eats it and stays." |
| GROUND_DAMAGE_REDUCTION / SIG_IRON_RECOVERY | absorbed | "Flat on his back, still in charge. Nothing lands clean." |
| SIG_KILLER_INSTINCT | ground_pound, finish | "Forearm across the jaw. He stays flat." |
| SIG_KILLER_INSTINCT | escaped | "Crossface set. He still squirms out." |

`{trigger}` comes from `TRIGGER_WORDS[triggerCondition]` (new, `frontend/src/constants/specialMovesCatalog.js`, display-only mirror): ALWAYS "Always on"; OPPONENT_SHOOTS_TAKEDOWN "When they shoot a takedown"; OPPONENT_ATTEMPTS_SUBMISSION "When they go for a submission"; STRIKING_EXCHANGE "In a striking exchange"; PLAYER_STAMINA_BELOW_70 "When your tank drops under 70%"; PLAYER_TOP_POSITION "From top position"; OPPONENT_STAMINA_BELOW_70 "When they tire under 70%"; PLAYER_ATTEMPTS_SUBMISSION "When you go for a submission"; LATE_ROUNDS "In the late rounds"; PLAYER_HEALTH_BELOW_75 "When you're hurt, under 75%"; OPPONENT_HEALTH_BELOW_75 "When they're under 75% health"; PLAYER_ON_BOTTOM "The first time you're on your back"; OPPONENT_HEALTH_BELOW_50 "When they're under 50% health"; ROUND_ONE "Round one, opening exchange"; PLAYER_FIRST_TAKEDOWN_LANDED "Your first takedown of the night"; FIRST_SUBMISSION_FROM_TOP "Your first submission from top".

### E.3 Components (`frontend/src/components/fights/reveal/`)

- `FightReveal.jsx` (rewrite, same props minus `campSessions`; `loadout` is read from `breakdownView`): one `setTimeout` chain as today, `cursor` over `items`, speed re-plan unchanged, Escape and Tab handling unchanged. Keep root `.fight-reveal` + `data-testid="fight-reveal"`, `.fr-rv-speed` (text "2x", `aria-pressed`), `.fr-rv-skip` (text "Skip to result"). Skip jumps to the `finish_card` item (true totals) and records `skipped`; the finish card replaces Skip with **See result** (`.fr-rv-see-result`); `onDone` fires on See result, on the 4 s auto-advance, or when the finish card plays out. `result` = `skipped` if Skip was pressed before the finish card, else `watched`; `beatIndex`/`beatsTotal` now count highlight items (document in `handleRevealDone`).
- `CornerStrip.jsx`: label "Your corner" / "cards · camp", mini cards (`moveArtUrl(art)`, `--rarity-color` from `RARITY_COLORS`, `.is-lit`, `.fr-rv-mini-n` counter "x{n}"), camp chips (`.is-lit` gold), or the muted line when both lists are empty, hidden when `loadout` is null.
- `RevealCards.jsx`: `MoveCard` (slam; signature 168x250, proc 140x208; rarity tag; name; "Signature card"/"Proc card"; trigger words; short line), `CampCard` ("Camp paid off", session label, effect from `CAMP_SESSIONS`-adjacent description or the camp row's `description` when present, short line), `WildcardCard` ("Their wildcard", `WILDCARD_AREA[stat]` as the big word, short line), `HighlightCard` (blue `.is-you` / red `.is-them`, small "{name} · {time}" or "{name} · R{n}" when timestamp is null, big word, short line), `QuietLine`, `PassivePill` ("{name} · always on", one per triggered passive, shown during round 1's items until round 2 starts, no extra timer).
- `FinishCard.jsx`: method, VICTORY/DEFEAT/DRAW, finish line or tally, **What fired** list (move rows: art thumb, name, "{Type} · {bestOutcome words}" or "{Type} · always on" for passives, `x{n}` or "didn't fire" dimmed; camp rows: "C" dot, label, "Camp session", "paid off" / "didn't fire"), See result button. `data-testid="reveal-finish"` kept.
- Every current highlight element and the quiet line carry class `.fr-rv-item` (e2e waits on it).
- `reveal.css`: add corner, counters, cards, slam/burst/sheen/shake/flash/pop keyframes, `.fight-reveal--reduced` overrides (no slam, burst, shake, flash, sheen, pulse, count-up; `.fr-rv-item` fades in 200 ms), and the `@media (max-width: 360px)` block: mini cards 30x44, signature 150x224, proc 128x190, card padding 12px, big word 28px, counters 18px, camp chips ellipsised, stage `min-height: 0; overflow: hidden`. Column stays single on every width; desktop centres it at `max-width: 640px` (existing `.fr-rv-top` width).
- `RevealErrorBoundary.jsx` unchanged.

### E.4 Full report changes

- `breakdown/eventTemplates.js`: `EVENT.move_fired` = `{ [bonusType]: { [outcome]: [long lines], default: [...] }, default: [...] }` using `{move}` and `{trigger}`; `EVENT.wildcard_fired` rewritten to use `{area}` ("{actor} shows something the tape never had: {area}. {target} did not prepare for it."); export `WILDCARD_AREA`. Existing `takedown_stuffed` lines are reused unchanged.
- `breakdown/renderEvent.js`: `renderEvent(entry, ctx)` gains `ctx.moves` (array of `LoadoutMoveRow`, optional) to resolve `{move}` (names joined with " and " for merged ids; fallback: title-cased moveId) and `{trigger}`; `{area}` from `vars.stat`; `move_fired` template lookup by `vars.bonusType`/`vars.outcome`; `styleClass` `"move"` for type move, `"wildcard"` for type wildcard. Export `seededPick`. Fallback text for unknown keys unchanged (PvP safety).
- `breakdown/RoundBlock.jsx` (both variants): time cell shows `R{n}` muted (`.ev-time--round`) when `timestamp` is null; a chip before the text: `CAMP` (gold, `.ev-chip--camp`) for type camp, `CARD` (rarity-coloured, `.ev-chip--card`, title = move name) for type move, `WILDCARD` (red) for type wildcard. Accepts `moves` prop and forwards it in `ctx`.
- `breakdown/YourCorner.jsx` (new): props `loadout`; renders the same rows as the finish card's What fired (`x{n}` / "didn't fire" / "paid off"), header "Your corner". Rendered by `FightDescription.jsx` after `ResultRow` when `breakdown.loadout` is present, and by `FightDrawer.jsx` in the Result tab above the camp outcomes block when `kind !== "pvp" && loadout`. `FightDescription` passes `loadout.moves` to each `RoundBlock`.
- `FightSummary.jsx`: no structural change; its camp card already reads `result.sessionBonuses` counts, the same numbers as `loadout.camp`.
- `App.jsx`: drop the `campSessions` prop; `handleRevealDone` comment updated; nothing else (sessionStorage restore record already stores `breakdownView`, which now contains `loadout`).
- `locales/en.json` `reveal.*` additions: `corner`, `cornerSub`, `cornerEmpty` ("No cards or camp for this fight"), `counters.strikes`, `counters.takedowns`, `passiveOn` ("{name} · always on"), `campPaidOff`, `theirWildcard`, `signatureCard`, `procCard`, `whatFired`, `seeResult`, `didntFire`, `paidOff`, `campSession`, `times` ("x{n}"), `quiet.0..2`, `roundResult` ("Round {n}: {name} {score}") and `roundEvenShort` ("Round {n}: Even"). `fights.roundBlock.chipCamp|chipCard|chipWildcard`, `fights.yourCorner.*`.

### E.5 Reduced motion, 2x, phone

- Reduced motion: `prefersReducedMotion()` (existing util) adds `fight-reveal--reduced`; durations unchanged; no slam, glow pulse, shake, flash, sheen or count-up; fade only; Skip and See result work.
- 2x: `durationMs = baseMs / 2` for every item including `finish_card` (2 s auto); the existing re-plan on toggle is kept.
- 340 px: see E.3 CSS block; the top bar, counters, corner strip, round label and stage stack in one column; Skip/2x stay in the bottom-right as today (e2e asserts Skip is on screen).

---

## F. Consistency test (§7.7)

`tests/integration/fightReplayConsistency.test.js` (node:test, CJS; loads the two alias-free ESM frontend modules with `await import(pathToFileURL(...))`: `frontend/src/components/fights/reveal/revealModel.js`, `frontend/src/components/fights/breakdown/renderEvent.js`, and `reveal/highlightLines.js`). Written by QA (step 5) after both sides land; the backend half can be drafted earlier.

For each of the golden `SCENARIOS` × loadouts (reuse the fixtures' fighter builders and `mulberry32`), plus one scenario with camp bonuses carrying `label`/`sessionType`/`matchStatus` and a `wildcard` object (`{ stat: "wre", counterSession: "GAME_PLAN_STUDY", fightEffect: 0.15, description: "…" }`):

1. `result = resolveFight(...)` under the seed; `bd = deriveFightDetails(result, ctx, "fight-x")`; `loadout = buildLoadoutSnapshot({...})`; `view = buildBreakdownResponse({ breakdown: { ...bd, loadout }, kind: "pve", perspective: "player", ... })`; `script = buildHighlightScript(view, { speed: 1 })`.
2. **Every highlight is a logged event**: for each `highlight` item (and its `combo`), `view.eventLog[globalIndex]` deep-equals `item.event` and has the same `round`, `timestamp`, `actorIsPlayer`; the number of `highlight` items per round is ≤ 4.
3. **The report renders it**: `renderEvent(entry, { playerName, opponentName, fightId, index, moves: loadout.moves })` for every `move`, `camp`, `wildcard`, `takedown_stuffed` event returns text that is not the fallback "makes a move." and contains no "{" placeholder.
4. **Times real or absent**: every `move_fired` with a non-null timestamp has a non-move event in the same round with the same timestamp; `wildcard_fired` has `timestamp === null`.
5. **Outcome-accurate**: `stuffed` only in rounds where `rounds[].takedowns[1] === 0`; `takedown_landed` on `takedown_opponent` lanes only where `takedowns[1] === 1`; `knockdown` only when a `knockdown` event by the player exists in that round; `finish` only in the finish round when the finish event's actor is the player; `sub_finished` only when the finish event is `submission_finish` by the player; `tapped` only when it is `submission_finish` by the opponent.
6. **Counts match**: for every `loadout.moves` row with `effectType !== "PASSIVE"`: `sum(event.vars.count where moveIds includes moveId) === firedCount === result.moveBonuses entry.triggerCount`; the final `corner.moves[moveId]` on the last item before the finish card equals `firedCount`; `finish_card.whatFired` equals `loadout`. For camp: every `camp_*_fired` event's lane session (`CAMP_EVENT_SESSION`) has `triggered === true` in `loadout.camp`; `loadout.camp[].triggered === result.sessionBonuses[].triggered`.
7. **Passive pill only if real**: `round_start.passives` equals the ids of PASSIVE rows with `triggered === true`.
8. **Engine purity**: `result.rounds[].{playerDamage, opponentDamage, playerHealth, opponentHealth, event}` equal the regenerated golden fixture's values for the same scenario key (ties the recorder to the pinned maths).

Unit tests alongside: `tests/utils/fightBreakdown.moveFired.test.js` (hand-built engine results per anchor row of B.2, null timestamps, keep rule, forced sub attempts, wildcard round, no events for PASSIVE records); `tests/utils/fightLoadoutSnapshot.test.js`; frontend `reveal/revealModel.test.js` (rewritten: selection, absorb, combo, ticks, 4-cap, quiet, durations, 2x, legacy view) and `reveal/highlightLines.test.js`, both registered in `tests/frontend/firstSession.vitestFiles.qa.test.js`.

---

## G. File placement and task order

### BACKEND (root dirs only), in order

1. `services/specialMovesService.js`: `buildMoveBonuses` adds `rarity` (A.6).
2. `utils/fightResolution.js`: recorder + 11 `note` sites, `moveFired` on the round record, camp commentary fix, wildcard `round` export (A.1 to A.4). Golden fixture procedure A.5; regen `tests/fixtures/fightResolution.golden.json`.
3. `models/fightBreakdownSchema.js`: nullable timestamp, `vars` fields, `loadoutSchema`. `models/fightModel.js`: `breakdown.loadout`.
4. `utils/fightLoadoutSnapshot.js` (new, pure) + `tests/utils/fightLoadoutSnapshot.test.js`.
5. `utils/fightBreakdown.js`: B.2 steps 1 to 8 + `tests/utils/fightBreakdown.moveFired.test.js`; existing `tests/utils/fightBreakdown.test.js` must stay green unchanged.
6. `utils/fightBreakdownView.js`: typedefs (JSDoc home), vars/timestamp passthrough, `loadout`.
7. `services/fightService.js` `resolveFightAndApply`: build and store `loadout`, `version: 2`. `getFightBreakdown` needs no change beyond what the view builder returns. `services/pvpFightService.js`: no change (verify `loadout: null` comes out).
8. `tests/utils/specialMovesFightIntegration.test.js`: A.5 sum assertion. `tests/frontend/firstSession.vitestFiles.qa.test.js`: register `reveal/highlightLines.test.js` (the frontend creates it).
9. (QA) `tests/integration/fightReplayConsistency.test.js` (F).

### FRONTEND (`frontend/` only), in order

1. `src/constants/specialMovesCatalog.js`: `TRIGGER_WORDS`.
2. `src/components/fights/breakdown/eventTemplates.js`: `move_fired`, `wildcard_fired` rewrite, `WILDCARD_AREA`.
3. `src/components/fights/breakdown/renderEvent.js`: `{move}/{trigger}/{area}`, `ctx.moves`, style classes, export `seededPick`.
4. `src/components/fights/reveal/highlightLines.js` + `highlightLines.test.js`.
5. `src/components/fights/reveal/revealModel.js` rewrite + `revealModel.test.js` rewrite (build against the D.2 shape with hand-made views; no backend needed).
6. `src/components/fights/reveal/CornerStrip.jsx`, `RevealCards.jsx`, `FinishCard.jsx`, `FightReveal.jsx` rewrite, `reveal.css`.
7. `src/components/fights/breakdown/RoundBlock.jsx` (chips, null time), `YourCorner.jsx`, `FightDescription.jsx`, `FightDrawer.jsx`.
8. `src/App.jsx` (drop `campSessions`, comment), `src/locales/en.json`.

Both lists can run in parallel from the start: the frontend builds against D.2 with fixture views; integration happens at QA.

### Rationale (patterns, briefly)

- **Pure derivation layer extended, not a new one**: `move_fired`/`wildcard_fired`/`takedown_stuffed` are derived in `fightBreakdown.js` from engine facts, like every other event; the engine only records facts (recorder = bookkeeping observer, no RNG). This keeps "one event list" literally true: the reveal and the report read the same persisted `eventLog`.
- **Snapshot on write** (`breakdown.loadout`): names, rarity, art and counts are frozen at resolve so the Career Feed reopen does not depend on the live catalog or the fighter's current equipment.
- **Single shaping point** (`buildBreakdownResponse`) and a **single JSDoc home** for the view type; the client mirrors enums as display constants (existing `specialMovesCatalog.js` pattern).
- **Flagged, not fixed beyond scope**: `resolveFightAndApply` is a ~1,000-line function (pre-existing); `campAllowed()` returning true for empty `sessionBonuses` becomes moot after A.3 but stays; existing `eventTemplates.js` lines contain em dashes (new lines must not; old ones untouched).

### Sequence summary

Backend 1 to 8 and frontend 1 to 8 in parallel → QA: F test, run `npm test`, e2e updates (H) → step 6 docs: GDD §10.0a (replace layout/beats with counters, corner, highlights, What fired, cards), Library "The Fight Summary" replay paragraph, changelog: append to the unreleased 2.4 entry (no new version).

Shared types the frontend needs: `BreakdownView` with nullable `timestamp`, `EventLogEntry.vars` additions, `LoadoutSnapshot`, the `outcome` vocabulary (B.1), `site` is backend-internal (not in the view).

---

## H. Risks

1. **Maths drift.** Any new `Math.random` or a reordered helper changes the fight. The golden test pins RNG draw count; A.5's diff procedure is the only acceptance path for a fixture regen. Reviewer: the fixture diff must show `campCommentary` lines only.
2. **Camp commentary fix changes legacy `commentary` lines and some `camp_*_fired` events disappear** (the ones that were move-only). This is correct per §7.4 but is a visible behaviour change for players with moves and no camp. Changelog line: "Camp credit now only appears when a booked camp session fired".
3. **Schema strict mode**: forgetting a `vars` field in the schema or in `eventLogOut` silently drops `moveIds`/`outcome`, and the reveal shows generic lines. The F test catches it (rule 3 and 6 assertions).
4. **Nullable timestamp** reaches every consumer: `RoundBlock` (both variants), `FightDrawer` events, `FightReveal` clock, `buildBreakdownResponse` finishTime (finish events are always timed, fine), the e2e `fight-variants`/`journey` specs that may read `.ev-time` text.
5. **Old fights**: version-1 breakdowns have no `loadout`; the sessionStorage restore record from a pre-deploy session has no `loadout` either. Every consumer treats `loadout` as optional.
6. **PvP**: `PvpFightStory` renders `FightDescription`; `loadout` null hides "Your corner"; swapped perspective flips `actorIsPlayer` on move events if PvP ever gets moves (then "Your corner" would be the attacker's; out of scope, note in the JSDoc).
7. **Merged entries**: one slam for two cards; both count. Say so in the Library article.
8. **Keep rule**: rounds with fired moves can hold up to 6 + 3 events; `FightDescription` renders any count, the reveal caps at 4 highlights. The existing 3..6 test only covers move-free rounds.
9. **Performance**: eventLog grows by at most ~3 entries per round, `loadout` is a few hundred bytes; the reveal still runs one timer chain. Art thumbs are the existing `/assets/moves/*.webp`; the slam shows them at 168x250, `object-fit: cover`.
10. **Analytics**: `fight_reveal.beatIndex/beatsTotal` change meaning (highlights, not beats); dashboards reading them compare pre/post as different scales. Note in the GDD §10.0a text.
11. **e2e (E:\Projects\ground-and-pound-e2e) that must change**: Skip no longer hides the reveal; it lands on the finish card with a **See result** button and a 4 s auto-advance. Update `tests/helpers/gnp.ts` `skipFightReveal` (after Skip, click `getByRole("button", { name: "See result" })`, then expect hidden), `tests/helpers/tutorial.ts:185` (same), `tests/debut-flow.spec.ts:207-210` (same, and the `.fr-rv-item` wait still works because highlights/quiet carry that class), `tests/debut-edge.spec.ts:155` and `:249`. `tests/fight.spec.ts:134` (reveal off) is unaffected. Selectors kept on purpose: `.fight-reveal`, `.fr-rv-item`, `.fr-rv-speed` with `aria-pressed`, button text "Skip to result", `data-testid="reveal-finish"`.
12. **Vitest shim**: new frontend test files must be added to `tests/frontend/firstSession.vitestFiles.qa.test.js` or they never run.
13. **Legacy frozen `moveBonuses` snapshots** (camps finalised before `effectType`/`moveIds`/`rarity` existed) must not throw in the recorder or the loadout builder; both default conservatively (no event, catalog effectType, rarity from the fighter).

Key files read for this contract: `E:\Projects\GroundAndPound\utils\fightResolution.js`, `E:\Projects\GroundAndPound\utils\fightBreakdown.js`, `E:\Projects\GroundAndPound\utils\fightBreakdownView.js`, `E:\Projects\GroundAndPound\models\fightBreakdownSchema.js`, `E:\Projects\GroundAndPound\models\fightModel.js`, `E:\Projects\GroundAndPound\services\fightService.js` (resolve 995-1230, summary 1995-2060, `getFightBreakdown` 2089-2170), `E:\Projects\GroundAndPound\services\specialMovesService.js` (`buildMoveBonuses` 730-786, `describeMove` 73-155), `E:\Projects\GroundAndPound\consts\specialMovesCatalog.js`, `E:\Projects\GroundAndPound\consts\campConfig.js`, `E:\Projects\GroundAndPound\services\campService.js` (wildcard 289-329), `E:\Projects\GroundAndPound\services\pvpFightService.js` (1327-1391), `E:\Projects\GroundAndPound\tests\utils\fightResolution.golden.test.js`, `E:\Projects\GroundAndPound\frontend\src\components\fights\reveal\*`, `E:\Projects\GroundAndPound\frontend\src\components\fights\breakdown\*`, `E:\Projects\GroundAndPound\frontend\src\components\fights\FightDescription.jsx`, `E:\Projects\GroundAndPound\frontend\src\App.jsx` (1423-1569, 1822-1840), `E:\Projects\GroundAndPound\frontend\src\components\moves\moveArtUrl.js`, `E:\Projects\ground-and-pound-e2e\tests\helpers\gnp.ts`, `E:\Projects\ground-and-pound-e2e\tests\debut-flow.spec.ts`.