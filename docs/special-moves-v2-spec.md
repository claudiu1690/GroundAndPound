# Special Moves v2 — roster expansion (12 → 24) and technique renames

Status: design LOCKED (user-approved 2026-08-22), art SHIPPED to
`frontend/public/assets/moves/`, code NOT built. This document is the design
source of truth for the build. Design of record for v1 is GDD §26 and
`docs/special-moves-spec.md`; nothing in v1's slot model, rarity model,
acquisition, or fight integration changes here.

## 1. Scope

1. Add 12 new moves to `consts/specialMovesCatalog.js` (24 total).
2. Rename 7 of the shipped 12 (display `name` only — ids, `art` slugs and asset
   filenames stay exactly as they are, or every shipped card's art breaks).
3. Extend the coach teach pools and the teach ladder so pools longer than 4 boot.
4. Add the engine branches the new moves need in `utils/fightResolution.js`.
5. GDD §26, Library article, changelog.

Unchanged and out of scope: 3 slots / 2-passive cap, rarity scaling, drops,
teaching, duplicates→cash, PvE-only (moves never touch the Proving Ground),
loadout freeze at camp finalize, fighter schema (`specialMovesOwned` /
`specialMovesEquipped` unchanged), Fight Camp (new bonusTypes are
move-exclusive; camp gets nothing).

## 2. Naming rule (hybrid, locked)

Passives keep trait names (an attribute, not an action). Procs and Signatures
carry technique / event names (something that happens in the fight).

### 2.1 Renames of the shipped 12 (display name only)

| id (unchanged) | art (unchanged) | old name | NEW name |
|---|---|---|---|
| SPRAWL_INSTINCT | sprawl_instinct | Sprawl Instinct | **Sprawl** |
| NEVER_TAP | never_tap | Never Tap | **Hip Escape** |
| CLINCH_KILLER | clinch_killer | Clinch Killer | **Dirty Boxing** |
| MOUNT_REAPER | mount_reaper | Mount Reaper | **Full Mount** |
| THE_FINISHER | the_finisher | The Finisher | **Overhand Right** |
| IRON_RECOVERY | iron_recovery | Iron Recovery | **Rubber Guard** |
| KILLER_INSTINCT | killer_instinct | Killer Instinct | **Crucifix** |

Granite Jaw, Heavy Hands, Body Snatcher, Veteran IQ, Second Wind: unchanged.
Flavor text of renamed moves may be lightly re-worded to fit the new name; no
mechanical field changes. (Note: `never-tap.webp` was re-painted on 2026-08-22
to show a choke escape; same filename.)

## 3. The 12 new moves

Values are engine fractions (UI shows ×1000 as Rating, unchanged contract).
minRarity COMMON for Passive/Proc (dense C/U/R/L), RARE for Signatures (R/L).
`art` = lowercase id; the webp already exists at
`frontend/public/assets/moves/<id-with-dashes>.webp`.

| id | name | type | bonusType | triggerCondition | C / U / R / L | domain | engine |
|---|---|---|---|---|---|---|---|
| HIGH_GUARD | High Guard | PASSIVE | OPPONENT_DAMAGE_REDUCTION | ALWAYS | .006 / .011 / .019 / .026 | STRIKING | existing branch |
| SECOND_GEAR | Second Gear | PROC | STRIKE_DAMAGE | OPPONENT_STAMINA_BELOW_70 | .005 / .009 / .015 / .020 | STRIKING | existing branch + NEW gate |
| SUPERMAN_PUNCH | Superman Punch | SIGNATURE | SIG_FAST_START | ROUND_ONE | R .10 / L .18 | STRIKING | NEW signature |
| DOUBLE_LEG_PRECISION | Double-Leg Precision | PASSIVE | TAKEDOWN_SUCCESS | ALWAYS | .02 / .035 / .06 / .08 | WRESTLING | NEW branch |
| TOP_CONTROL | Top Control | PROC | GNP_DAMAGE | PLAYER_TOP_POSITION | .025 / .045 / .075 / .10 | WRESTLING | existing branch |
| BLAST_DOUBLE | Blast Double | SIGNATURE | SIG_TAKEDOWN_BLITZ | PLAYER_FIRST_TAKEDOWN_LANDED | R .10 / L .18 | WRESTLING | NEW signature |
| FRAME_AND_BASE | Frame & Base | PASSIVE | GROUND_DAMAGE_REDUCTION | ALWAYS | .015 / .026 / .044 / .06 | BJJ | NEW branch |
| GUILLOTINE_CHOKE | Guillotine Choke | PROC | SUBMISSION_SUCCESS | PLAYER_ATTEMPTS_SUBMISSION | .03 / .05 / .08 / .11 | BJJ | NEW branch |
| ARM_TRIANGLE | Arm Triangle | SIGNATURE | SIG_SUBMISSION_HUNT | PLAYER_ACHIEVES_TOP_POSITION | R .12 / L .20 | BJJ | NEW signature |
| PACE_PUSHER | Pace Pusher | PASSIVE | OPPONENT_STAMINA_DRAIN | ALWAYS | .04 / .042 / .046 / .05 (quantized lane, see §5) | CONDITIONING | NEW branch |
| DEEP_WATERS | Deep Waters | PROC | STRIKE_DAMAGE | LATE_ROUNDS | .008 / .015 / .025 / .033 | CONDITIONING | existing branch + NEW gate |
| FIGHTING_SPIRIT | Fighting Spirit | PROC | FLASH_KO_RESISTANCE | PLAYER_HEALTH_BELOW_25 | .004 / .008 / .012 / .018 | CONDITIONING | NEW branch |

Flavor text (one line each, no em dashes in player copy):
- High Guard: "Hands high, chin down. Nothing clean gets through."
- Second Gear: "A tired man's guard drops an inch. This fighter never misses the inch."
- Superman Punch: "No feeling-out round. The bell rings and the storm is already here."
- Double-Leg Precision: "The shot never misses because it was never sloppy to begin with."
- Top Control: "Top position isn't a reward, it's a job. This fighter clocks in."
- Blast Double: "The first takedown of the night is a statement, not a formality."
- Frame & Base: "Flat on the back and still structurally sound. Nothing gets through the frame."
- Guillotine Choke: "Once the neck is wrapped, it's only a matter of time."
- Arm Triangle: "Top position is an invitation. This fighter RSVPs immediately."
- Pace Pusher: "Every exchange costs the other guy a little more than it should."
- Deep Waters: "Drag them out past the third round and watch them drown."
- Fighting Spirit: "Hurt, not gone. The chin negotiates a longer fight."

### 3.1 Semantics of the new engine surface

Existing pattern to follow: `getBonusValue` / `triggerBonus` keyed by
`bonusType` at the exact call site that represents the trigger; signatures via
`getSignatureEntry` + per-fight `sigState[moveId]` one-shot. Collapse rule:
same `bonusType` sums (built by `buildMoveBonuses`, not the engine).

- **OPPONENT_STAMINA_BELOW_70 gate (Second Gear)**: the STRIKE_DAMAGE branch
  only counts this entry while `opponent.stamina < 0.70 * opponent.maxStamina`.
  Because collapse merges same-bonusType entries, the gated STRIKE_DAMAGE entries
  must NOT be merged with ungated ones; keep per-entry `triggerCondition` and
  evaluate at the call site (architect decides whether `buildMoveBonuses` stops
  collapsing across different triggerConditions, or the engine sums per-entry).
- **LATE_ROUNDS gate (Deep Waters)**: fires in the back half of the fight:
  `roundNum > ceil(totalRounds / 2)` (round 3 of 3, rounds 4-5 of 5). Architect
  confirms how `totalRounds` reaches `resolveRound`.
- **TAKEDOWN_SUCCESS**: additive to the player's takedown success probability at
  the takedown-attempt branch (mirror of SPRAWL_SUCCESS, offense side).
- **GROUND_DAMAGE_REDUCTION**: multiplies down damage the player takes while on
  the bottom (ground strikes / GnP received), the ground analog of
  OPPONENT_DAMAGE_REDUCTION which today only touches standing strikes.
- **SUBMISSION_SUCCESS**: additive to the player's submission finish probability
  at the player-attempts-submission branch (mirror of ESCAPE_PROBABILITY).
- **OPPONENT_STAMINA_DRAIN**: increases the opponent's per-round stamina loss by
  the fraction (mirror of STAMINA_DRAIN, which reduces the player's).
- **FLASH_KO_RESISTANCE**: while player health < 25%, subtracts the fraction from
  the flash-KO probability applied to the player. Smallest values in the roster
  on purpose: no precedent for this lever anywhere in the bonus system.
- **SIG_FAST_START (Superman Punch)**: one-shot in round 1 only: the player's
  first landed strike of the fight deals +value extra damage.
- **SIG_TAKEDOWN_BLITZ (Blast Double)**: one-shot: the first takedown the player
  lands grants +value to that round's GnP damage.
- **SIG_SUBMISSION_HUNT (Arm Triangle)**: one-shot: the first time the player
  achieves top position, the next submission attempt that round gets +value
  success probability.

Signatures never merge, keyed by moveId, exactly like the three shipped ones.
New `triggerCondition` strings are display metadata plus the gate the engine
checks; `ENGINE_BONUS_TYPES` in the catalog must list every new non-SIG
bonusType or `validateCatalog` throws at boot.

## 4. Coach teach pools and the teach ladder (boot blocker)

`consts/homeCampConfig.js`:

- Append the new ids to the END of each pool so the first four slots (what
  existing coaches already carry in `teachPoolMoveIds`) do not move:

```
STRIKING:     [HEAVY_HANDS, BODY_SNATCHER, CLINCH_KILLER, THE_FINISHER, HIGH_GUARD, SECOND_GEAR, SUPERMAN_PUNCH]
WRESTLING:    [SPRAWL_INSTINCT, MOUNT_REAPER, KILLER_INSTINCT, DOUBLE_LEG_PRECISION, TOP_CONTROL, BLAST_DOUBLE]
BJJ:          [NEVER_TAP, VETERAN_IQ, IRON_RECOVERY, FRAME_AND_BASE, GUILLOTINE_CHOKE, ARM_TRIANGLE]
CONDITIONING: [GRANITE_JAW, SECOND_WIND, PACE_PUSHER, DEEP_WATERS, FIGHTING_SPIRIT]
```

  Teach-ceiling rule (rule 12) is satisfied: indices 0 and 1 of every pool are
  COMMON-min moves; every RARE Signature sits at index ≥ 2.
- `TEACH_RANK_BY_SLOT` must cover the longest pool (7):
  `{ 0: 2, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 }`. Without this, rule 13 fails the
  boot with "no entry for slot 4".
- Coach-flagship drop bias and Rank-4 "teach everything remaining" need no code
  change; they read the pool.

## 5. Balance decisions (from the 2026-08-22 Monte-Carlo check)

- Second Gear and Deep Waters ship at the TRIMMED values above (roughly half the
  first draft). Reason: they share the STRIKE_DAMAGE lane with Heavy Hands and a
  legal Heavy Hands + Second Gear + Deep Waters loadout measured +10.2 pts in the
  ungated worst case, over the 5-10 pt guardrail. Trimmed sum at Legendary:
  .035 + .020 + .033 = .088.
- Fighting Spirit ships at HALF the drafted values (no precedent for a flash-KO
  lever); revisit after a dedicated sweep.
- Pace Pusher ships at .04 / .042 / .046 / .05. OPPONENT_STAMINA_DRAIN is a QUANTIZED
  lane: the engine keeps stamina in whole points and the per-round drain is an integer
  8..13, so the value only acts in rounds where drain x value rounds up to a full extra
  point. Steps: below .0385 nothing ever happens; .04 fires on drain 13 (1 round in 6);
  .042 on 12-13 (2/6); .046 on 11-13 (3/6); .05 on 10-13 (4/6); .056 on 9-13 (5/6);
  .0625 and up every round. Percent-style trims therefore do not work here (.08 and .06
  measured the same +5.3 to +6.3 alone, both above every other passive); the shipped
  ladder puts each rarity on its own step and lands Legendary at about +4, the passive
  ceiling. Tune this lane by step, not by percentage. History of the first trim: the
  post-build sweep (2026-09-26) at the draft .16 Legendary measured +8.4 pts alone
  on the Boxer mirror and +16.7 on Capoeira, with legal stacks at +10.1 (+ Body
  Snatcher) and +12.1 (+ Granite Jaw + Clinch Killer) on Boxer, over the guardrail.
  At .08 (8000 sims/cell): alone +5.7 Boxer / +11.0 Capoeira; + Body Snatcher +8.1 /
  +16.4; + Granite Jaw + Clinch Killer +12.2 / +20.5. The last stack stays high
  because Granite Jaw + Clinch Killer alone (all v1, no Pace Pusher) already measures
  +7.6 Boxer / +13.5 Capoeira; Pace Pusher adds about +4.6 on top. Capoeira numbers
  are amplified by the lopsided style (flat bonuses land about 2x there), so judge
  them against the camp baseline rather than the absolute guardrail.
- High Guard (+1.9 pts alone) and Top Control (≈0) verified safe on the real
  engine. Mount Reaper + Top Control stacked (.27 GNP_DAMAGE) measured ≈0 swing.
- Worst legal OPPONENT_DAMAGE_REDUCTION pair is still Granite Jaw + Veteran IQ
  (+7.2 pts, inside guardrail); High Guard is the smallest of the three.
- After the build, `scripts/specialMovesBalanceSweep.js` should gain the two new
  worst-case rows (STRIKE_DAMAGE trio, GNP_DAMAGE pair) so the sweep covers them.

## 6. Acceptance

- Boot passes `validateCatalog` and `validateHomeCampConfig` with 24 moves.
- `moveBonuses=[]` remains numerically inert (baseline mirror ≈ 50%).
- Every new bonusType has exactly one read site in `resolveRound`.
- Existing tests in `tests/services/specialMovesService.test.js`,
  `tests/utils/specialMovesFightIntegration.test.js`, `tests/services/gymDropWeights.test.js`,
  and the homeCamp teach tests still pass; new tests cover each new branch, the
  two gates, the three signatures, and the pool/ladder validation.
- Frontend: the 12 new cards render with existing `MoveArt` (art already on
  disk), type colors unchanged (Passive red / Proc blue / Signature gold are in
  the art, rarity stays the CSS frame), `describeMove` produces a unit label for
  each new bonusType (Takedown / Ground Defense / Submission / Pressure / Grit
  Rating or similar), renamed moves show the new names everywhere.
